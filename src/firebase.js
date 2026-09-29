import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  clearIndexedDbPersistence, terminate,
} from "firebase/firestore";

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
// Records are cached on the device (IndexedDB), so a cold start paints the last
// known timetable, deadlines and notices straight away and keeps working with
// no signal. Live listeners then patch in anything a CR or admin changed, with
// no reload. The memory-only cache this replaced meant every launch waited on
// seven server round trips before showing anything, and an offline launch
// showed nothing at all.
//
// The shared-device protection moves to sign-out: `wipeLocalData` below shuts
// Firestore down and deletes the on-disk cache before the page reloads.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// The sign-in is kept on the device too, so the app opens signed in offline.
export const authReady = setPersistence(auth, browserLocalPersistence);

/** Delete every cached record from this device. Used on sign-out. */
export async function wipeLocalData() {
  await terminate(db);
  await clearIndexedDbPersistence(db);
}
