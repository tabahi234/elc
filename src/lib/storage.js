import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './authContext';

/**
 * Persistent per-user state stored at users/{uid}/data/{key}.
 *
 * Reads like useState; writes go to Firestore (offline-cached) and sync across
 * devices. Only the owner can read or write this path. See firestore.rules.
 */
export function useUserDoc(key, initialValue) {
  const { user } = useAuth();
  const [value, setValue] = useState(initialValue);
  // A document that does not exist yet is a perfectly good answer, and callers
  // need to tell that apart from "the answer has not arrived". Without this a
  // first-run screen cannot know whether to show itself.
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(initialValue);

  useEffect(() => {
    setLoaded(false);
    // Signing in as someone else must not leave the previous account's data on
    // screen while the new snapshot is in flight.
    latest.current = initialValue;
    setValue(initialValue);
    if (!user) return;

    const ref = doc(db, 'users', user.uid, 'data', key);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        latest.current = snap.data().value;
        setValue(latest.current);
      }
      setLoaded(true);
    }, (err) => {
      console.error(`Sync error (${key}):`, err);
      // Settled, just not with data. Leaving this false would hang any screen
      // that waits for the first read.
      setLoaded(true);
    });
    // initialValue is often a fresh object literal; including it would
    // resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key]);

  const update = useCallback((next) => {
    const v = typeof next === 'function' ? next(latest.current) : next;
    latest.current = v;
    setValue(v);
    if (!user) return;
    setDoc(doc(db, 'users', user.uid, 'data', key), { value: v, updatedAt: serverTimestamp() })
      .catch((err) => console.error(`Save error (${key}):`, err));
  }, [user, key]);

  return [value, update, loaded];
}
