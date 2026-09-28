import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection, deleteDoc, doc, onSnapshot, query, orderBy,
  serverTimestamp, setDoc, addDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './authContext';
import { subjects as defaultSubjects, timetable as defaultTimetable } from '../data/timetable';

export const ClassDataContext = createContext(null);

// No exam period set up yet. A missing config document and an explicitly
// switched-off one have to look identical to every screen, or the timetable
// disappears the first time somebody opens the app before a CR has been here.
const EXAM_MODE_OFF = { active: false, label: '', from: '', to: '' };

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
    return await Promise.race([promise.then(() => ({ ok: true })), queued]);
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
  // One-off departures from the weekly timetable, and notices that are not
  // deadlines. Both are class-wide and both are written only by a manager.
  const [classChanges, setClassChanges] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  // The exam schedule, and the switch that says it has replaced the timetable.
  const [exams, setExams] = useState([]);
  const [examMode, setExamMode] = useState(EXAM_MODE_OFF);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) {
      setRemoteSubjects(null); setRemoteTimetable(null); setGlobalTasks([]);
      setClassChanges([]); setAnnouncements([]);
      setExams([]); setExamMode(EXAM_MODE_OFF);
      setLoading(false);
      return;
    }
    setLoading(true);
    let pending = 7;
    const done = () => { if (--pending <= 0) setLoading(false); };
    const fail = (where) => (err) => {
      console.error(`${where} listener:`, err);
      setError(err);
      done();
    };

    const unsubSubjects = onSnapshot(collection(db, 'subjects'), (snap) => {
      setRemoteSubjects(Object.fromEntries(snap.docs.map((d) => [d.id, { code: d.id, ...d.data() }])));
      setError(null);
      done();
    }, fail('subjects'));

    const unsubTimetable = onSnapshot(collection(db, 'timetable'), (snap) => {
      setRemoteTimetable(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      done();
    }, fail('timetable'));

    // dueDate is nullable: a deadline can be announced before its date is.
    // Firestore sorts null first, which is what we want here, because "date
    // not announced" is not the same thing as "a long way off".
    const unsubTasks = onSnapshot(
      query(collection(db, 'globalTasks'), orderBy('dueDate', 'asc')),
      (snap) => { setGlobalTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); done(); },
      fail('globalTasks')
    );

    const unsubChanges = onSnapshot(
      query(collection(db, 'classChanges'), orderBy('date', 'asc')),
      (snap) => { setClassChanges(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); done(); },
      fail('classChanges')
    );

    const unsubAnnouncements = onSnapshot(
      query(collection(db, 'announcements'), orderBy('createdAt', 'desc')),
      (snap) => { setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); done(); },
      fail('announcements')
    );

    const unsubExams = onSnapshot(
      query(collection(db, 'exams'), orderBy('date', 'asc')),
      (snap) => { setExams(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); done(); },
      fail('exams')
    );

    // A single document rather than a collection: there is exactly one exam
    // period on at a time, and the rules refuse any other id.
    const unsubExamMode = onSnapshot(
      doc(db, 'config', 'examMode'),
      (snap) => {
        setExamMode(snap.exists() ? { ...EXAM_MODE_OFF, ...snap.data() } : EXAM_MODE_OFF);
        done();
      },
      fail('examMode')
    );

    return () => {
      unsubSubjects(); unsubTimetable(); unsubTasks();
      unsubChanges(); unsubAnnouncements();
      unsubExams(); unsubExamMode();
    };
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

  // ── writes ────────────────────────────────────────────────────────────────
  // Every one of these is also gated in firestore.rules. The `canManage` guard
  // here only avoids a pointless round trip and a scary console error.
  const stamp = useCallback(() => ({
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  }), [user]);

  const guard = () => {
    if (!canManage) {
      return { ok: false, error: Object.assign(new Error('Not allowed'), { code: 'permission-denied' }) };
    }
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
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      ...stamp(),
    }));
  }, [stamp, user, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteGlobalTask = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'globalTasks', id))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveClassChange = useCallback((id, data) => {
    const blocked = guard();
    if (blocked) return blocked;
    const payload = { ...data, ...stamp() };
    return commit(id
      ? setDoc(doc(db, 'classChanges', id), payload)
      : addDoc(collection(db, 'classChanges'), payload));
  }, [stamp, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteClassChange = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'classChanges', id))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveExam = useCallback((id, data) => {
    const blocked = guard();
    if (blocked) return blocked;
    const payload = { ...data, ...stamp() };
    return commit(id
      ? setDoc(doc(db, 'exams', id), payload)
      : addDoc(collection(db, 'exams'), payload));
  }, [stamp, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteExam = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'exams', id))),
  [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveExamMode = useCallback((data) =>
    guard() ?? commit(setDoc(doc(db, 'config', 'examMode'), { ...data, ...stamp() })),
  [stamp, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveAnnouncement = useCallback((id, data) => {
    const blocked = guard();
    if (blocked) return blocked;
    if (id) {
      // createdAt/createdBy are immutable under the rules, so resend them as-is.
      return commit(setDoc(doc(db, 'announcements', id), { ...data, ...stamp() }));
    }
    return commit(addDoc(collection(db, 'announcements'), {
      ...data,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      ...stamp(),
    }));
  }, [stamp, user, canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteAnnouncement = useCallback((id) =>
    guard() ?? commit(deleteDoc(doc(db, 'announcements', id))),
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
      return {
        ok: false,
        error: new Error('You seem to be offline. Publishing needs a connection, so reconnect and try again.'),
      };
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
    subjects, timetable, globalTasks, classChanges, announcements,
    exams, examMode,
    loading, error, usingDefaults,
    saveSubject, deleteSubject,
    saveSlot, deleteSlot,
    saveGlobalTask, deleteGlobalTask,
    saveClassChange, deleteClassChange,
    saveAnnouncement, deleteAnnouncement,
    saveExam, deleteExam, saveExamMode,
    publishDefaults,
  };

  return <ClassDataContext.Provider value={value}>{children}</ClassDataContext.Provider>;
}

export const useClassData = () => useContext(ClassDataContext);
