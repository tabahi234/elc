import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Public config — safe to ship; access is controlled by Firestore rules + Auth.
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
// Offline cache so the PWA keeps working without signal and syncs later
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
