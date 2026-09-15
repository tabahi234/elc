import React, { useState } from 'react';
import { subjects } from '../data/timetable';
import { useTasks, sortTasks, dueLabel, TASK_TYPES } from '../lib/useTasks';
import { Check, Trash2, Plus, CalendarClock } from 'lucide-react';

export default function Tasks() {
  const { tasks, loading, error, addTask, toggleTask, deleteTask } = useTasks();
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(Object.keys(subjects)[0]);
  const [type, setType] = useState('Assignment');
  const [dueDate, setDueDate] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await addTask({ title: title.trim(), subject, type, dueDate: dueDate || null });
      setTitle(''); setDueDate('');
    } catch (err) {
      console.error('Error adding task:', err);
    }
  };

  const sorted = sortTasks(tasks);
  const pending = sorted.filter(t => !t.completed).length;

  return (
    <div className="animate-fade-in">
      <header className="mb-4">
        <h1>Tasks & Deadlines</h1>
        <p className="text-muted">{pending} pending · sorted by due date</p>
      </header>

      <form onSubmit={submit} className="card glass mb-4" style={{ padding: 15 }}>
        <div className="input-group">
          <input type="text" placeholder="e.g. OOP Assignment 2 – inheritance" value={title}
            onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="form-row">
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {Object.entries(subjects).map(([code, s]) => (
              <option key={code} value={code}>{s.title} ({code})</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <button type="submit" className="btn btn-primary" style={{ padding: '12px 16px' }}>
            <Plus size={18} /> Add
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-muted text-center mt-4">Loading tasks...</p>
      ) : error ? (
        <div className="card" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)' }}>
          <h3 style={{ color: 'var(--danger)' }}>Database Error</h3>
          <p style={{ fontSize: '0.9rem' }}>{error}</p>
          <p className="text-muted mt-2" style={{ fontSize: '0.8rem' }}>
            Check that the Firestore rules from firestore.rules are published in the Firebase console.
          </p>
        </div>
      ) : (
        <ul className="task-list">
          {sorted.length === 0 ? (
            <p className="text-center text-muted mt-4">No tasks yet. Add every assignment and quiz the moment it's announced.</p>
          ) : sorted.map(task => {
            const due = dueLabel(task.dueDate, task.completed);
            return (
              <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}
                style={{ borderLeft: `3px solid ${subjects[task.subject]?.color || 'var(--card-border)'}` }}>
                <div className="task-checkbox" onClick={() => toggleTask(task.id, task.completed)}>
                  {task.completed && <Check size={14} color="white" />}
                </div>
                <div className="task-content">
                  <div className="task-title">{task.title}</div>
                  <div className="task-meta">
                    <span>{subjects[task.subject]?.short || task.subject}</span>
                    {task.type && <span>· {task.type}</span>}
                    {due && (
                      <span className={`badge ${due.cls}`} style={{ padding: '2px 8px', fontSize: '0.7rem', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <CalendarClock size={11} /> {due.text}
                      </span>
                    )}
                  </div>
                </div>
                <button className="btn-icon" onClick={() => deleteTask(task.id)}
                  style={{ color: 'var(--danger)', background: 'transparent' }} title="Delete Task">
                  <Trash2 size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
