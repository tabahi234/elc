import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserSessionPersistence } from "firebase/auth";
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
export const privacyReady = Promise.all([
  clearIndexedDbPersistence(db),
  setPersistence(auth, browserSessionPersistence),
]);
