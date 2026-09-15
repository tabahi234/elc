import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './authContext';

/**
 * Persistent per-user state stored at users/{uid}/data/{key}.
 * Works like useState; writes go to Firestore (offline-cached) and sync across devices.
 */
export function useUserDoc(key, initialValue) {
  const { user } = useAuth();
  const [value, setValue] = useState(initialValue);
  const latest = useRef(initialValue);

  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid, 'data', key);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        latest.current = snap.data().value;
        setValue(latest.current);
      }
    }, (err) => console.error(`Sync error (${key}):`, err));
  }, [user, key]);

  const update = useCallback((next) => {
    const v = typeof next === 'function' ? next(latest.current) : next;
    latest.current = v;
    setValue(v);
    if (user) {
      setDoc(doc(db, 'users', user.uid, 'data', key), { value: v })
        .catch(err => console.error(`Save error (${key}):`, err));
    }
  }, [user, key]);

  return [value, update];
}
