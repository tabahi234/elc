import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './authContext';
import { format } from 'date-fns';

export const TASK_TYPES = ['Assignment', 'Quiz', 'Sessional', 'Final', 'Lab', 'Project', 'Revision'];

export function useTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const col = () => collection(db, 'users', user.uid, 'tasks');

  useEffect(() => {
    const q = query(collection(db, 'users', user.uid, 'tasks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Firestore Error:', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user.uid]);

  const addTask = (data) => addDoc(col(), {
    completed: false,
    createdAt: new Date().toISOString(),
    ...data
  });
  const toggleTask = (id, completed) => updateDoc(doc(col(), id), { completed: !completed });
  const deleteTask = (id) => deleteDoc(doc(col(), id));

  return { tasks, loading, error, addTask, toggleTask, deleteTask };
}

// Sort: incomplete first, then by due date (no due date last), then newest
export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

// Days until due (negative = overdue). null if no due date.
export function daysUntil(dueDate) {
  if (!dueDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

export function dueLabel(dueDate, completed) {
  const d = daysUntil(dueDate);
  if (d == null) return null;
  if (completed) return { text: format(new Date(dueDate + 'T00:00:00'), 'MMM d'), cls: 'badge-primary' };
  if (d < 0) return { text: `Overdue ${-d}d`, cls: 'badge-danger' };
  if (d === 0) return { text: 'Due today', cls: 'badge-danger' };
  if (d === 1) return { text: 'Due tomorrow', cls: 'badge-warning' };
  if (d <= 3) return { text: `Due in ${d}d`, cls: 'badge-warning' };
  return { text: format(new Date(dueDate + 'T00:00:00'), 'EEE, MMM d'), cls: 'badge-primary' };
}

