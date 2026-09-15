import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { AuthContext } from './authContext';

const POPUP_TIMEOUT_MS = 90_000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => onAuthStateChanged(auth, setUser, (err) => {
    console.error('Auth error:', err);
    setUser(null);
  }), []);

  const signIn = async () => {
    // Popup only. Redirect sign-in needs the handler on the same origin as the app,
    // which localhost / most hosts can't do since Chrome blocked third-party storage.
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error('Sign-in timed out'), { code: 'auth/timeout' })), POPUP_TIMEOUT_MS));
    try {
      const result = await Promise.race([signInWithPopup(auth, googleProvider), timeout]);
      // Belt and braces: if the listener somehow doesn't fire, set the user ourselves.
      setUser(result.user);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      throw err;
    }
  };
  const signOut = () => fbSignOut(auth);

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}
