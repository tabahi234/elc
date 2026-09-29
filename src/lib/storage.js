import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './authContext';

/**
 * Persistent per-user state stored at users/{uid}/data/{key}.
 *
 * Reads like useState; writes go to Firestore (offline-cached) and sync across
 * devices. Only the owner can read or write this path. See firestore.rules.
 *
 * Every write replaces the whole stored value, so a write made before the
 * stored value has arrived would be built on `initialValue` and wipe out
 * everything already saved: one quick-log tap on a slow connection used to
 * replace the entire study history with a single entry. Updates made before
 * the first read are therefore held, shown on screen straight away, and then
 * replayed on top of the real stored value once it lands. Pass a function
 * (`set((current) => next)`) for anything that merges, so the replay merges
 * into the real data rather than into the placeholder.
 */
export function useUserDoc(key, initialValue) {
  const { user } = useAuth();
  const [value, setValue] = useState(initialValue);
  // A document that does not exist yet is a perfectly good answer, and callers
  // need to tell that apart from "the answer has not arrived". Without this a
  // first-run screen cannot know whether to show itself.
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(initialValue);
  const loadedRef = useRef(false);
  const pending = useRef([]);

  const write = useCallback((v) => {
    if (!user) return;
    setDoc(doc(db, 'users', user.uid, 'data', key), { value: v, updatedAt: serverTimestamp() })
      .catch((err) => console.error(`Save error (${key}):`, err));
  }, [user, key]);

  useEffect(() => {
    setLoaded(false);
    loadedRef.current = false;
    pending.current = [];
    // Signing in as someone else must not leave the previous account's data on
    // screen while the new snapshot is in flight.
    latest.current = initialValue;
    setValue(initialValue);
    if (!user) return;

    const ref = doc(db, 'users', user.uid, 'data', key);
    return onSnapshot(ref, (snap) => {
      if (!loadedRef.current) {
        // First answer: start from what is really stored, then replay any
        // edits made while it was on its way, and save the result once.
        let base = snap.exists() ? snap.data().value : initialValue;
        const queued = pending.current;
        pending.current = [];
        for (const next of queued) base = typeof next === 'function' ? next(base) : next;
        latest.current = base;
        setValue(base);
        loadedRef.current = true;
        setLoaded(true);
        if (queued.length) write(base);
        return;
      }
      if (snap.exists()) {
        latest.current = snap.data().value;
        setValue(latest.current);
      }
    }, (err) => {
      console.error(`Sync error (${key}):`, err);
      // Settled, just not with data. Leaving this false would hang any screen
      // that waits for the first read. Held edits stay on screen but are not
      // written: the read failed, so there is nothing safe to merge them into.
      pending.current = [];
      loadedRef.current = true;
      setLoaded(true);
    });
    // initialValue is often a fresh object literal; including it would
    // resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, key, write]);

  const update = useCallback((next) => {
    const v = typeof next === 'function' ? next(latest.current) : next;
    latest.current = v;
    setValue(v);
    if (!loadedRef.current) {
      pending.current.push(next);
      return;
    }
    write(v);
  }, [write]);

  return [value, update, loaded];
}
