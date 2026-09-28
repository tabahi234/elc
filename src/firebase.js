import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, memoryLocalCache, clearIndexedDbPersistence } from "firebase/firestore";

// Public config, safe to ship: access is controlled by Firestore rules + Auth.
// Analytics is deliberately not initialised here; nothing in the app uses it,
// and it would load another SDK on every cold start of the PWA.
const firebaseConfig = {
  apiKey: "AIzaSyAli2dh8zLSdeQtG34I8WMWB1yCTxCcoPI",
  authDomain: "elc-dashboard-d6405.firebaseapp.com",
  projectId: "elc-dashboard-d6405",
  storageBucket: "elc-dashboard-d6405.firebasestorage.app",
  messagingSenderId: "23627710636",
  appId: "1:23627710636:web:7de6560be340ad6a505f09"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// Private records must not survive in an offline database on shared devices.
export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
// Remove the previous version's on-disk cache before starting any listeners.
// Fail closed if another tab still holds that database open.
//
// The sign-in itself is kept on the device (browserLocalPersistence) while the
// records are not. These are two different things and the old code conflated
// them: session persistence meant closing the tab signed you out, so students
// were re-authenticating several times a day for no privacy gain — the only
// thing it evicted was the token, and every grade and task was already
// memory-only and gone the moment the tab closed. Signing out still clears the
// token, and still reloads the page to drop everything in memory with it.
export const privacyReady = Promise.all([
  clearIndexedDbPersistence(db),
  setPersistence(auth, browserLocalPersistence),
]);
