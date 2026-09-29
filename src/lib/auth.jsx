import React, { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, wipeLocalData } from '../firebase';
import { AuthContext } from './authContext';

const POPUP_TIMEOUT_MS = 90_000;

// Every role the app recognises. 'blocked' is a real answer, not an absence of
// one: it is how an admin takes access away from somebody who already signed
// up, and it has to survive being read back or they would simply re-enrol.
const ROLES = ['admin', 'cr', 'student', 'blocked'];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);   // undefined = still checking
  const [roleState, setRoleState] = useState(null);
  // The uid we have already tried to enrol, so a write that is refused is not
  // retried in a loop against the same listener that reported it missing.
  const enrolled = useRef(null);
  const role = user && roleState?.uid === user.uid ? roleState.role : undefined;

  useEffect(() => onAuthStateChanged(auth, setUser, (err) => {
    console.error('Auth error:', err);
    setUser(null);
  }), []);

  /**
   * The role is the single source of truth for what the UI offers. It is NOT
   * the source of truth for what the user can do. That is firestore.rules,
   * which re-reads this same document server-side on every write. Hiding the
   * admin tab is a courtesy; the rules are the lock.
   *
   * No role document means nobody has signed up under this account yet, so we
   * write one: a plain student, under their own uid, with the email off their
   * own verified token. The rules allow exactly that and nothing more, so this
   * is the sign-up, and it replaces the old routine of a student copying their
   * user ID out of a code block, sending it to the admin, and waiting. Becoming
   * a class representative is still an admin's decision, because that is the
   * only part of it that was ever actually a decision.
   */
  useEffect(() => {
    if (!user) {
      setRoleState(null);
      // A later sign-in gets a fresh attempt at signing up, in case the last
      // one failed on a dead connection.
      enrolled.current = null;
      return;
    }
    let active = true;
    const unsubscribe = onSnapshot(
      doc(db, 'roles', user.uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!active) return;

        // A cached role is good enough to open the app on: it is what the
        // server said last time, and the listener corrects it the moment the
        // server answers (a block still lands as soon as there is signal). A
        // cached *absence* proves nothing, so wait for the server, unless there
        // is no network to wait for.
        if (snap.metadata.fromCache && !snap.exists()) {
          if (!navigator.onLine) setRoleState({ uid: user.uid, role: null });
          return;
        }

        if (!snap.exists()) {
          // First time on this account. Stay in the loading state rather than
          // flashing a refusal: this same listener fires again the moment the
          // document lands.
          if (enrolled.current !== user.uid) {
            enrolled.current = user.uid;
            setDoc(doc(db, 'roles', user.uid), {
              role: 'student',
              email: user.email ?? '',
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            }).catch((err) => {
              console.error('Sign-up failed:', err);
              if (active) setRoleState({ uid: user.uid, role: null });
            });
            return;
          }
          // Already tried once and it is still not there. Fail closed.
          setRoleState({ uid: user.uid, role: null });
          return;
        }

        const raw = snap.data().role;
        const normalised = ROLES.includes(raw) ? raw : null;
        setRoleState({ uid: user.uid, role: normalised });
      },
      (err) => {
        // Fail closed: an unreadable role is never an admin. The student is
        // never told about this, because there is nothing they could do with
        // the information; whoever runs the app gets it in the console.
        console.error('Role lookup failed:', err);
        if (active) setRoleState({ uid: user.uid, role: null });
      }
    );
    return () => { active = false; unsubscribe(); };
  }, [user]);

  const signIn = async () => {
    // Popup only. Redirect sign-in needs the handler on the same origin as the
    // app, which localhost and most hosts can't do since Chrome blocked
    // third-party storage.
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Sign-in timed out'), { code: 'auth/timeout' })), POPUP_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([signInWithPopup(auth, googleProvider), timeout]);
      setUser(result.user);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const signOut = async () => {
    await fbSignOut(auth);
    // Delete the on-device cache so the next person on a shared phone sees
    // nothing, then reload to drop everything still held in memory.
    try { await wipeLocalData(); } catch (err) { console.error('Cache wipe failed:', err); }
    window.location.reload();
  };

  const value = {
    user,
    role,
    isMember: ['admin', 'cr', 'student'].includes(role),
    // Signed up, then had access taken away. Distinct from "we could not find
    // out", which is what null means and which gets a different screen.
    isBlocked: role === 'blocked',
    isAdmin: role === 'admin',
    isCR: role === 'cr',
    canManage: role === 'admin' || role === 'cr',
    roleLoading: role === undefined,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
