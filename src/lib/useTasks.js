import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase';
import { useAuth } from './authContext';
import { useClassData } from './classDataContext';
import { useUserDoc } from './storage';
import { TASK_TYPES, daysFromToday, isEventType, eventIsOver } from './validate';
import { timestampMillis } from './timestamps';

export { TASK_TYPES };

/**
 * Personal tasks only. Class-wide deadlines come from ClassDataProvider.
 */
export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setTasks([]);
    setError(null);
    setLoading(true);
    if (!user) { setLoading(false); return; }
    const q = query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Tasks listener:', err);
      setError(err);
      setLoading(false);
    });
  }, [user]);

  const col = useCallback(() => collection(db, 'users', user.uid, 'tasks'), [user]);

  const addTask = useCallback((data) => addDoc(col(), {
    title: data.title,
    subject: data.subject,
    type: data.type,
    dueDate: data.dueDate || null,
    dueTime: data.dueTime || '',
    note: data.note || '',
    completed: Boolean(data.completed),
    createdAt: new Date().toISOString(),
    sourceTaskId: data.sourceTaskId || null,
    sourceSnapshot: data.sourceSnapshot || null,
  }), [col]);

  const updateTask = useCallback((id, data) =>
    setDoc(doc(col(), id), data, { merge: true }), [col]);

  const deleteTask = useCallback((id) => deleteDoc(doc(col(), id)), [col]);

  return { tasks, loading, error, addTask, updateTask, deleteTask };
}

/**
 * Whether the student has ticked off a class-wide deadline.
 *
 * The previous version wrote a stub into users/{uid}/tasks under the global
 * task's id, which produced half-formed task documents that the security rules
 * now (correctly) reject. Completion is a per-student flag about someone
 * else's task, so it belongs in the student's own key-value store.
 */
export function useGlobalTaskState() {
  const [state, setState] = useUserDoc('taskState', {});

  const toggle = useCallback((id, done) => {
    setState((current) => {
      const next = { ...current };
      if (done) next[id] = true; else delete next[id];
      return next;
    });
  }, [setState]);

  return [state ?? {}, toggle];
}

/**
 * Decorates one merged entry with whether it is sat rather than handed in.
 *
 * An event carries no completion state of its own. Whether it is behind you is
 * a fact about the calendar, not a box anybody ticked, so `completed` is
 * derived from the date. That keeps every existing consumer — the sort, the
 * counts, the filters — working without special-casing, while making it
 * impossible for a quiz to sit in somebody's pending list all semester because
 * they never went back to tick it.
 */
function asEntry(task) {
  if (!isEventType(task.type)) return { ...task, isEvent: false };
  return { ...task, isEvent: true, completed: eventIsOver(task) };
}

/**
 * The single list every screen reads: personal tasks and class broadcasts,
 * merged and sorted. Class tasks are flagged so they can't be deleted by a
 * student who only wants them off their own list.
 */
export function useAllTasks() {
  const { tasks, loading, error, addTask, updateTask, deleteTask } = useTasks();
  const { globalTasks } = useClassData();
  const [globalState, toggleGlobal] = useGlobalTaskState();

  const merged = useMemo(() => {
    // A class deadline the student has adopted is hidden in its original form,
    // otherwise they would see the same assignment twice: once read-only and
    // once as their editable copy.
    const adopted = new Set(tasks.map((t) => t.sourceTaskId).filter(Boolean));
    const byId = new Map(globalTasks.map((t) => [t.id, t]));
    return sortTasks([
      ...tasks.map((t) => asEntry({
        ...t,
        source: 'personal',
        classUpdate: t.sourceTaskId ? diffAgainstClass(t, byId.get(t.sourceTaskId)) : null,
      })),
      ...globalTasks
        .filter((t) => !adopted.has(t.id))
        .map((t) => asEntry({ ...t, source: 'class', completed: Boolean(globalState[t.id]) })),
    ]);
  }, [tasks, globalTasks, globalState]);

  const toggle = useCallback((task) => {
    // Nothing to toggle on an exam. The screens do not offer a checkbox for
    // one, and this is the second lock: a stale prop or an old cached list
    // must not be able to write a meaningless completion flag.
    if (isEventType(task.type)) return;
    if (task.source === 'class') toggleGlobal(task.id, !task.completed);
    else updateTask(task.id, { completed: !task.completed });
  }, [toggleGlobal, updateTask]);

  /**
   * Take a class deadline and make a private copy the student owns outright.
   * The class original is untouched, so nothing the student does here can
   * affect a classmate. The copy carries its completion state across so
   * adopting something already ticked off does not silently un-tick it.
   */
  const adoptTask = useCallback((classTask) => addTask({
    title: classTask.title,
    subject: classTask.subject,
    type: classTask.type,
    dueDate: classTask.dueDate || null,
    dueTime: classTask.dueTime || '',
    note: classTask.note || '',
    completed: Boolean(globalState[classTask.id]),
    sourceTaskId: classTask.id,
    sourceSnapshot: snapshotOf(classTask),
  }), [addTask, globalState]);

  /**
   * Pull the CR's later changes into a copy the student already owns. Only the
   * fields the CR actually changed are touched, so anything the student
   * personalised and the CR did not touch survives.
   */
  const applyClassUpdate = useCallback((task) => {
    const update = task.classUpdate;
    if (!update) return Promise.resolve();
    const patch = {};
    for (const field of update.fields) patch[field.key] = field.to;
    return updateTask(task.id, { ...patch, sourceSnapshot: update.snapshot });
  }, [updateTask]);

  /** Stop tracking the class version without losing the copy. */
  const dismissClassUpdate = useCallback((task) =>
    updateTask(task.id, { sourceSnapshot: task.classUpdate?.snapshot ?? null }),
  [updateTask]);

  return {
    tasks: merged, loading, error,
    addTask, updateTask, deleteTask, toggle,
    adoptTask, applyClassUpdate, dismissClassUpdate,
  };
}

const TRACKED = [
  { key: 'title', label: 'Title' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'dueTime', label: 'Due time' },
  { key: 'type', label: 'Type' },
  { key: 'note', label: 'Note' },
];

const snapshotOf = (classTask) => Object.fromEntries(
  TRACKED.map(({ key }) => [key, classTask[key] ?? null])
);

/**
 * What the CR has changed on the class original since this copy was made.
 *
 * Comparing against the snapshot taken at adoption time, rather than against
 * the student's current values, is what makes this safe: a student who renamed
 * their copy is not told the title "changed" every time they open the app.
 */
function diffAgainstClass(personal, classTask) {
  if (!classTask) return null;                 // the CR deleted it
  const snapshot = personal.sourceSnapshot;
  if (!snapshot) return null;                  // adopted before this existed

  const fields = TRACKED
    .map(({ key, label }) => ({
      key,
      label,
      from: snapshot[key] ?? null,
      to: classTask[key] ?? null,
    }))
    .filter((f) => (f.from ?? '') !== (f.to ?? ''));

  if (!fields.length) return null;
  return { fields, snapshot: snapshotOf(classTask) };
}

/** Incomplete first, then soonest due, then newest. */
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return timestampMillis(b.createdAt) - timestampMillis(a.createdAt);
  });
}

export const daysUntil = daysFromToday;

/**
 * The one badge that describes when a task is due.
 *
 * A task can legitimately have no date. A class deadline often gets announced
 * before the teacher fixes the date, and a personal reminder may never need
 * one. Those two read differently to a student, so they are worded
 * differently, and neither is left blank: a card with no date badge at all
 * looks like the app forgot something.
 */
export function dueBadge(task) {
  if (!task?.dueDate) {
    return task?.source === 'class'
      ? { text: 'Date not announced yet', tone: '' }
      : { text: 'No date', tone: '' };
  }
  const d = daysFromToday(task.dueDate);
  if (d == null) return null;
  const pretty = (fmt) => format(new Date(`${task.dueDate}T00:00:00`), fmt);

  // An exam is never due and never overdue. It is on a day, and afterwards it
  // simply happened, so the words change even though the dates do not.
  if (isEventType(task.type)) {
    if (d < 0) return { text: `Sat ${pretty('MMM d')}`, tone: '' };
    if (d === 0) return { text: 'Today', tone: 'badge-danger' };
    if (d === 1) return { text: 'Tomorrow', tone: 'badge-danger' };
    if (d <= 3) return { text: `In ${d} days`, tone: 'badge-warning' };
    if (d <= 7) return { text: pretty('EEEE'), tone: 'badge-accent' };
    return { text: pretty('MMM d'), tone: '' };
  }

  if (task.completed) return { text: pretty('MMM d'), tone: '' };
  if (d < 0) return { text: d === -1 ? 'Overdue 1 day' : `Overdue ${-d} days`, tone: 'badge-danger' };
  if (d === 0) return { text: 'Due today', tone: 'badge-danger' };
  if (d === 1) return { text: 'Due tomorrow', tone: 'badge-warning' };
  if (d <= 3) return { text: `In ${d} days`, tone: 'badge-warning' };
  if (d <= 7) return { text: pretty('EEEE'), tone: 'badge-accent' };
  return { text: pretty('MMM d'), tone: '' };
}
