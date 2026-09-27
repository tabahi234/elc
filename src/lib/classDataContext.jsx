import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, deleteDoc, doc, onSnapshot, query, orderBy,
  serverTimestamp, setDoc, addDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './authContext';
import {
  subjects as defaultSubjects,
  timetable as defaultTimetable,
  SEMESTER_WEEKS,
} from '../data/timetable';

export const ClassDataContext = createContext(null);

/**
 * Class-wide data: subjects, the weekly timetable, and broadcast deadlines.
 *
 * Shape note: these used to live inside one classData/main document as a
 * nested map and array. They are now one document each, because Firestore
 * rules cannot iterate a nested map, so with the old shape there was no way
 * to validate an individual subject's Drive link or a slot's times on the
 * server. One doc per row means every field is checked before it lands.
 */

/**
 * Firestore resolves a write promise only once the server acknowledges it, so
 * offline the promise simply never settles. Awaiting it directly would hang
 * the button forever on a bad campus connection. This settles either way and
 * says which happened.
 */
async function commit(promise, ms = 4000) {
  let timer;
  const queued = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: true, queued: true }), ms); });
  try {
    const result = await Promise.race([promise.then(() => ({ ok: true })), queued]);
    return result;
  } catch (error) {
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

export function ClassDataProvider({ children }) {
  const { user, canManage } = useAuth();
  const [remoteSubjects, setRemoteSubjects] = useState(null);
  const [remoteTimetable, setRemoteTimetable] = useState(null);
  const [globalTasks, setGlobalTasks] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setRemoteSubjects(null); setRemoteTimetable(null); setGlobalTasks([]); setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let pending = 4;
    const done = () => { if (--pending <= 0) setLoading(false); };
    const fail = (where) => (err) => {
      console.error(`${where} listener:`, err);
      setError(err);
      done();
    };

    const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
      setRemoteSubjects(Object.fromEntries(snap.docs.map((d) => [d.id, { code: d.id, ...d.data() }])));
      done();
    }, fail('subjects'));

    const unsubTimetable = onSnapshot(collection(db, 'timetable'), (snap) => {
      setRemoteTimetable(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      done();
    }, fail('timetable'));

    // Classes the CR has confirmed actually happened. Attendance is measured
    // against these rather than against a count each student keeps themselves.
    const unsubSessions = onSnapshot(collection(db, 'sessions'), (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      done();
    }, fail('sessions'));

    const unsubTasks = onSnapshot(
      query(collection(db, 'globalTasks'), orderBy('dueDate', 'asc')),
      (snap) => { setGlobalTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); done(); },
      fail('globalTasks')
    );

    return () => { unsubSubjects(); unsubTimetable(); unsubSessions(); unsubTasks(); };
  }, [user]);

  /**
   * Before anyone publishes the real data, fall back to the timetable bundled
   * in src/data so a new student still sees their week instead of a blank app.
   * Read-only: nothing writes to Firestore on its own.
   */
  const usingDefaults = !remoteSubjects || Object.keys(remoteSubjects).length === 0;

  const subjects = useMemo(() => {
    if (usingDefaults) return defaultSubjects;
    // Stable order: explicit `order` first, then course code.
    return Object.fromEntries(
      Object.entries(remoteSubjects).sort(
        ([aCode, a], [bCode, b]) => (a.order ?? 50) - (b.order ?? 50) || aCode.localeCompare(bCode)
      )
    );
  }, [remoteSubjects, usingDefaults]);

  const timetable = useMemo(() => {
    const rows = usingDefaults
      ? defaultTimetable.map((slot, i) => ({ id: `default-${i}`, ...slot }))
      : (remoteTimetable ?? []);
    return [...rows].sort((a, b) => (a.day - b.day) || String(a.start).localeCompare(String(b.start)));
  }, [remoteTimetable, usingDefaults]);

  const weeklySessions = useMemo(() => Object.fromEntries(
    Object.keys(subjects).map((code) => [code, timetable.filter((t) => t.code === code).length || 1])
  ), [subjects, timetable]);

  // ── writes ────────────────────────────────────────────────────────────────
  // Every one of these is also gated in firestore.rules. The `canManage` guard
  // here only avoids a pointless round trip and a scary console error.
  const stamp = useCallback(() => ({
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  }), [user]);

  const guard = () => {
    if (!canManage) return { ok: false, error: new Error('You do not have permission to change class data.') };
    return null;
  };

  const saveSubject = useCallback((code, data) =>
    guard() ?? commit(setDoc(doc(db, 'subjects', code), { ...data, ...stamp() })),
  [stamp, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSubject = useCallback((code) =>
    guard() ?? commit(deleteDoc(doc(db, 'subjects', code))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSlot = useCallback((id, data) => {
    const blocked = guard();
    if (blocked) return blocked;
    const payload = { ...data, ...stamp() };
    return commit(id
      ? setDoc(doc(db, 'timetable', id), payload)
      : addDoc(collection(db, 'timetable'), payload));
  }, [stamp, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSlot = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'timetable', id))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveGlobalTask = useCallback((id, data) => {
    const blocked = guard();
    if (blocked) return blocked;
    if (id) {
      // createdAt/createdBy are immutable under the rules, so resend them as-is.
      return commit(setDoc(doc(db, 'globalTasks', id), { ...data, ...stamp() }));
    }
    return commit(addDoc(collection(db, 'globalTasks'), {
      ...data,
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
      ...stamp(),
    }));
  }, [stamp, user, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSession = useCallback((id, data) => {
    const blocked = guard();
    if (blocked) return blocked;
    const payload = { ...data, ...stamp() };
    return commit(id
      ? setDoc(doc(db, 'sessions', id), payload)
      : addDoc(collection(db, 'sessions'), payload));
  }, [stamp, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Record many classes at once, for catching up after a few weeks of not
   * marking the register.
   *
   * Written in chunks because a Firestore batch takes at most 500 operations.
   * Unlike publishDefaults this can safely batch, since every subject these
   * sessions reference already exists; the rules only have to look at
   * committed state, which already contains them.
   */
  const bulkRecordSessions = useCallback(async (entries) => {
    const blocked = guard();
    if (blocked) return blocked;
    if (!entries.length) return { ok: true, written: 0 };

    const CHUNK = 400;
    const meta = { updatedAt: serverTimestamp(), updatedBy: user.uid };
    let written = 0;

    for (let i = 0; i < entries.length; i += CHUNK) {
      const batch = writeBatch(db);
      const slice = entries.slice(i, i + CHUNK);
      for (const entry of slice) {
        batch.set(doc(collection(db, 'sessions')), {
          code: entry.code,
          date: entry.date,
          slotId: entry.slotId ?? null,
          status: 'held',
          note: '',
          ...meta,
        });
      }
      const result = await commit(batch.commit(), 20_000);
      // Report what did land, so a partial failure is not described as none.
      if (!result.ok) return { ...result, written };
      written += slice.length;
    }
    return { ok: true, written };
  }, [user, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteSession = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'sessions', id))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteGlobalTask = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'globalTasks', id))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * One-time bootstrap: pushes the bundled timetable into Firestore.
   *
   * This runs as TWO sequential commits, and it has to. The rules for a
   * timetable slot require its subject to already exist
   * (`subjectExists(d.code)`), and Firestore evaluates the rules for every
   * write in a batch against the state *before* the batch. Put both in one
   * batch and every slot fails the existence check, which takes the whole
   * atomic write down with it. Subjects must be committed and acknowledged
   * before the slots that reference them are even sent.
   */
  const publishDefaults = useCallback(async () => {
    const blocked = guard();
    if (blocked) return blocked;
    const meta = { updatedAt: serverTimestamp(), updatedBy: user.uid };

    const batch = writeBatch(db);
    Object.entries(defaultSubjects).forEach(([code, s], i) => {
      batch.set(doc(db, 'subjects', code), {
        title: s.title,
        short: s.short,
        teacher: s.teacher ?? '',
        credits: Number(s.credits) || 0,
        color: s.color,
        online: Boolean(s.online),
        order: i,
        driveLink: '',
        classroomLink: '',
        ...meta,
      });
    });
    const subjectsResult = await commit(batch.commit(), 12_000);
    if (!subjectsResult.ok) return subjectsResult;
    if (subjectsResult.queued) {
      // Queued means the subject writes have not reached the server, so the
      // slot writes would be rejected on arrival. Better to stop than to leave
      // half a timetable behind.
      return { ok: false, error: new Error('You appear to be offline. Publishing needs a connection, because the timetable can only be written after the subjects land. Reconnect and try again.') };
    }

    const slots = writeBatch(db);
    defaultTimetable.forEach((slot) => {
      slots.set(doc(collection(db, 'timetable')), {
        day: slot.day, start: slot.start, end: slot.end,
        code: slot.code, room: slot.room, type: slot.type,
        changeNote: '', changeUntil: '',
        ...meta,
      });
    });
    return commit(slots.commit(), 12_000);
  }, [user, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    subjects, timetable, weeklySessions, globalTasks, sessions,
    loading, error, usingDefaults, SEMESTER_WEEKS,
    saveSubject, deleteSubject,
    saveSlot, deleteSlot,
    saveGlobalTask, deleteGlobalTask,
    saveSession, deleteSession, bulkRecordSessions,
    publishDefaults,
  };

  return <ClassDataContext.Provider value={value}>{children}</ClassDataContext.Provider>;
}

export const useClassData = () => useContext(ClassDataContext);
