import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { AuthContext } from './authContext';

const POPUP_TIMEOUT_MS = 90_000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);   // undefined = still checking
  const [role, setRole] = useState(undefined);   // undefined = still checking
  // A denied read of the role document is NOT the same thing as "this person is
  // a student", and treating them the same made a broken deployment look like a
  // working one. It is tracked separately so the UI can say what went wrong.
  const [roleError, setRoleError] = useState(null);
  // Kept exactly as Firestore returned it, purely so the diagnostics panel can
  // show what is really in the document when it does not match expectations.
  const [roleRaw, setRoleRaw] = useState(undefined);
  const [roleDocExists, setRoleDocExists] = useState(undefined);

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
      setRole(user === null ? null : undefined);
      setRoleError(null); setRoleRaw(undefined); setRoleDocExists(undefined);
      return;
    }
    return onSnapshot(
      doc(db, 'roles', user.uid),
      (snap) => {
        setRoleError(null);
        setRoleDocExists(snap.exists());
        const raw = snap.exists() ? snap.data().role : undefined;
        setRoleRaw(raw);
        // Typed by hand into the Firebase console, so "Admin", "ADMIN" and
        // "admin " with a stray space all have to mean the same thing. The
        // rules compare the stored string exactly, so keep the console value
        // lowercase; this only stops the UI disagreeing with the server.
        const normalised = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        // A role document that does not exist means an ordinary student. That
        // is a successful read, not a failure.
        setRole(normalised || 'student');
      },
      (err) => {
        // Still fail closed: an unreadable role is never an admin. But record
        // why, because permission-denied here almost always means the rules in
        // firestore.rules have not been deployed to this project yet.
        console.error('Role lookup failed:', err);
        setRoleError(err);
        setRoleRaw(undefined);
        setRoleDocExists(undefined);
        setRole('student');
      }
    );
  }, [user]);

  const signIn = async () => {
    // Popup only. Redirect sign-in needs the handler on the same origin as the
    // app, which localhost and most hosts can't do since Chrome blocked
    // third-party storage.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Sign-in timed out'), { code: 'auth/timeout' })), POPUP_TIMEOUT_MS));
    try {
      const result = await Promise.race([signInWithPopup(auth, googleProvider), timeout]);
      setUser(result.user);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      throw err;
    }
  };

  const signOut = () => fbSignOut(auth);

  const value = {
    user,
    role,
    roleError,
    roleRaw,
    roleDocExists,
    isAdmin: role === 'admin',
    isCR: role === 'cr',
    canManage: role === 'admin' || role === 'cr',
    roleLoading: role === undefined,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
