import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext } from './authContext';

const POPUP_TIMEOUT_MS = 90_000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);   // undefined = still checking
  const [roleState, setRoleState] = useState(null);
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
   */
  useEffect(() => {
    if (!user) {
      setRoleState(null);
      return;
    }
    let active = true;
    const unsubscribe = onSnapshot(
      doc(db, 'roles', user.uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (!active || snap.metadata.fromCache) return;
        const raw = snap.exists() ? snap.data().role : undefined;
        // Match the server's exact values and require explicit approval.
        const normalised = ['admin', 'cr', 'student'].includes(raw) ? raw : null;
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
    // Dispose all in-memory Firestore data and pending UI state.
    window.location.reload();
  };

  const value = {
    user,
    role,
    isMember: ['admin', 'cr', 'student'].includes(role),
    isAdmin: role === 'admin',
    isCR: role === 'cr',
    canManage: role === 'admin' || role === 'cr',
    roleLoading: role === undefined,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
