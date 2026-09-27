import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Check, Trash2, Plus, Users, CalendarClock, ListChecks, AlertCircle,
  StickyNote, Pencil, CopyPlus, Lock, RefreshCw, BellRing,
} from 'lucide-react';
import { useClassData } from '../lib/classDataContext';
import { useAllTasks, dueBadge, daysUntil } from '../lib/useTasks';
import { useToast } from '../lib/toastContext';
import { Field, Sheet, ConfirmButton, EmptyState, Tabs, CardSkeleton } from '../components/ui';
import { LIMITS, TASK_TYPES, clean, hasErrors, vTask, dueDateHint } from '../lib/validate';
import { friendlyError } from '../lib/errors';

export default function Tasks() {
  const { subjects } = useClassData();
  const {
    tasks, loading, error, addTask, updateTask, deleteTask, toggle,
    adoptTask, applyClassUpdate, dismissClassUpdate,
  } = useAllTasks();
  const toast = useToast();
  const [filter, setFilter] = useState('pending');
  // null when closed; the task being edited, or {} for a new one.
  const [editing, setEditing] = useState(null);

  const counts = useMemo(() => ({
    pending: tasks.filter((t) => !t.completed).length,
    done: tasks.filter((t) => t.completed).length,
    overdue: tasks.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) < 0).length,
  }), [tasks]);

  const visible = tasks.filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed);

  const remove = async (task) => {
    try {
      await deleteTask(task.id);
      toast.success(task.sourceTaskId
        ? 'Your copy is gone. The class deadline is back on your list.'
        : 'Task deleted.');
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const adopt = async (task) => {
    try {
      await adoptTask(task);
      toast.success('Copied to your tasks. Edit it however you like; the class version is untouched.');
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const applyUpdate = async (task) => {
    try {
      await applyClassUpdate(task);
      toast.success('Your copy now matches the class version.');
    } catch (err) { toast.error(friendlyError(err)); }
  };

  const keepMine = async (task) => {
    try {
      await dismissClassUpdate(task);
      toast.info('Keeping your version. You will be told again if the CR changes it further.');
    } catch (err) { toast.error(friendlyError(err)); }
  };

  const save = async (data) => {
    try {
      if (editing?.id) {
        await updateTask(editing.id, data);
        toast.success('Task updated.');
      } else {
        await addTask(data);
        toast.success('Task added.');
      }
      setEditing(null);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">
          {counts.pending} pending
          {counts.overdue > 0 && <span style={{ color: 'var(--danger)' }}> · {counts.overdue} overdue</span>}
        </p>
        <h1 className="page-title">Deadlines</h1>
      </header>

      <button
        className="btn btn-primary btn-block"
        onClick={() => setEditing({})}
        style={{ marginBottom: 'var(--s4)' }}
      >
        <Plus size={18} aria-hidden="true" /> Add a task
      </button>

      <Tabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'pending', label: `Pending ${counts.pending || ''}`.trim() },
          { value: 'done', label: `Done ${counts.done || ''}`.trim() },
          { value: 'all', label: 'All' },
        ]}
      />

      <div className="stack-sm" style={{ marginTop: 'var(--s4)' }}>
        {/* A failure to load *personal* tasks must not hide the class-wide
            deadlines, which come from a different listener and are usually
            still fine. Warn, then show whatever did load. */}
        {error && (
          <div className="alert alert-warning">
            <AlertCircle size={16} aria-hidden="true" />
            <div className="alert-body">
              <strong className="small">Your own tasks could not load</strong>
              <p className="small" style={{ marginTop: 2 }}>
                {friendlyError(error, 'Pull down to reload in a moment.')} Class deadlines
                below are still up to date.
              </p>
            </div>
          </div>
        )}

        {loading && !error ? (
          <><CardSkeleton rows={1} /><CardSkeleton rows={1} /></>
        ) : visible.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ListChecks}
              title={filter === 'done' ? 'Nothing ticked off yet' : 'All clear'}
            >
              {filter === 'done'
                ? 'Completed tasks collect here.'
                : 'Add anything your teacher mentions in class. Whatever your CR announces shows up automatically.'}
            </EmptyState>
          </div>
        ) : (
          visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              subject={subjects[task.subject]}
              onToggle={() => toggle(task)}
              onDelete={() => remove(task)}
              onEdit={() => setEditing(task)}
              onAdopt={() => adopt(task)}
              onApplyUpdate={() => applyUpdate(task)}
              onKeepMine={() => keepMine(task)}
            />
          ))
        )}
      </div>

      {editing && (
        <TaskSheet
          task={editing}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function TaskCard({ task, subject, onToggle, onDelete, onEdit, onAdopt, onApplyUpdate, onKeepMine }) {
  const due = dueBadge(task);
  const isClass = task.source === 'class';

  return (
    <div className={`task ${task.completed ? 'done' : ''}`} style={{ '--stripe': subject?.color }}>
      <button
        className="task-check"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={`Mark "${task.title}" as ${task.completed ? 'not done' : 'done'}`}
        onClick={onToggle}
      >
        <span className="task-check-box">
          {task.completed && <Check size={15} aria-hidden="true" strokeWidth={3} />}
        </span>
      </button>

      <div className="grow" style={{ minWidth: 0 }}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span>{subject?.short || task.subject}</span>
          <span className="badge">{task.type}</span>
          {isClass && (
            <span className="badge badge-accent"><Users size={10} aria-hidden="true" /> Class</span>
          )}
          {/* An adopted copy is private but began as a class deadline. Saying so
              stops it reading as a duplicate the student invented. */}
          {task.sourceTaskId && (
            <span className="badge"><CopyPlus size={10} aria-hidden="true" /> Your copy</span>
          )}
          {due && (
            <span className={`badge ${due.tone}`}>
              <CalendarClock size={10} aria-hidden="true" /> {due.text}
              {/* A time without a date says nothing, so it waits for one. */}
              {task.dueDate && task.dueTime && ` ${format(new Date(`2000-01-01T${task.dueTime}`), 'h:mm a')}`}
            </span>
          )}
        </div>
        {task.note && (
          <p className="muted small row" style={{ marginTop: 6, alignItems: 'flex-start', gap: 5 }}>
            <StickyNote size={12} aria-hidden="true" style={{ marginTop: 3, flexShrink: 0 }} />
            {task.note}
          </p>
        )}

        {/* The CR changed the class original after this copy was made. Silence
            here is the dangerous option: the student works from a due date
            that moved and never finds out. */}
        {task.classUpdate && (
          <div className="alert alert-warning" style={{ marginTop: 'var(--s3)', padding: 'var(--s2) var(--s3)' }}>
            <BellRing size={14} aria-hidden="true" />
            <div className="alert-body" style={{ minWidth: 0 }}>
              <strong className="small">Your CR changed the class version</strong>
              <ul className="muted tiny" style={{ marginTop: 4 }}>
                {task.classUpdate.fields.map((f) => (
                  <li key={f.key}>
                    {f.label}: {formatDiff(f.from)} to {formatDiff(f.to)}
                  </li>
                ))}
              </ul>
              <div className="row" style={{ gap: 'var(--s2)', marginTop: 'var(--s2)' }}>
                <button className="btn btn-sm btn-primary" onClick={onApplyUpdate}>
                  <RefreshCw size={13} aria-hidden="true" /> Update mine
                </button>
                <button className="btn btn-sm btn-ghost" onClick={onKeepMine}>Keep mine</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isClass ? (
        // A class deadline belongs to everyone, so a student can tick it off but
        // cannot edit or delete it. The rules reject those writes too, not just
        // this UI. What they can do is take a private copy and change that.
        <button
          className="btn-icon btn-icon-sm"
          onClick={onAdopt}
          aria-label={`Make an editable copy of "${task.title}"`}
          title="Make my own editable copy"
        >
          <CopyPlus size={15} aria-hidden="true" />
        </button>
      ) : (
        <>
          <button
            className="btn-icon btn-icon-sm"
            onClick={onEdit}
            aria-label={`Edit "${task.title}"`}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <ConfirmButton onConfirm={onDelete} label={`Delete ${task.title}`}>
            <Trash2 size={15} aria-hidden="true" />
          </ConfirmButton>
        </>
      )}
    </div>
  );
}

function TaskSheet({ task, subjects, onClose, onSave }) {
  const isEdit = Boolean(task.id);
  const [form, setForm] = useState({
    title: task.title ?? '',
    subject: task.subject ?? Object.keys(subjects)[0] ?? '',
    type: task.type ?? 'Assignment',
    dueDate: task.dueDate ?? '',
    dueTime: task.dueTime ?? '',
    note: task.note ?? '',
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // A personal reminder does not have to have a date, but a class-wide one does.
  const errors = vTask(form, { requireDueDate: false });
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    await onSave({
      title: clean(form.title),
      subject: form.subject,
      type: form.type,
      dueDate: form.dueDate || null,
      dueTime: form.dueTime || '',
      note: clean(form.note),
    });
    setSaving(false);
  };

  return (
    <Sheet
      open onClose={onClose}
      title={isEdit ? 'Edit task' : 'Add a task'}
      subtitle="Only you can see this, not even your CR."
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add task'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {task.sourceTaskId && (
          <div className="alert alert-accent">
            <CopyPlus size={15} aria-hidden="true" />
            <span className="alert-body">
              This began as a class deadline. Your changes stay on your copy, and
              if your CR later changes the class version you will be told, with
              the option to pull those changes in. Delete the copy to go back to
              following the class version outright.
            </span>
          </div>
        )}

        <Field label="What do you have to do" required error={show('title')}
          counter={{ value: clean(form.title).length, max: LIMITS.title.max }}>
          <input value={form.title} onChange={set('title')} onBlur={() => setTouched(true)}
            placeholder="Revise chapters 4-6 for the quiz" maxLength={LIMITS.title.max} />
        </Field>

        <div className="field-grid">
          <Field label="Subject" required error={show('subject')}>
            <select value={form.subject} onChange={set('subject')}>
              {Object.entries(subjects).map(([code, s]) => (
                <option key={code} value={code}>{s.short} ({code})</option>
              ))}
            </select>
          </Field>
          <Field label="Type" required error={show('type')}>
            <select value={form.type} onChange={set('type')}>
              {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <div className="field-grid">
          <Field
            label="Due date" error={show('dueDate')}
            hint={dueDateHint(form.dueDate) || 'Leave empty if there is no fixed date.'}
          >
            <input type="date" value={form.dueDate} onChange={set('dueDate')} onBlur={() => setTouched(true)} />
          </Field>
          <Field label="Time" error={show('dueTime')}>
            <input type="time" value={form.dueTime} onChange={set('dueTime')} />
          </Field>
        </div>

        <Field label="Note" error={show('note')}
          counter={{ value: clean(form.note).length, max: LIMITS.note.max }}>
          <textarea value={form.note} onChange={set('note')} rows={2} maxLength={LIMITS.note.max} />
        </Field>

        <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6 }}>
          <Lock size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          Stored under your account only. The security rules stop anyone else
          reading it, including the class representative and an admin.
        </p>
      </form>
    </Sheet>
  );
}

/** Renders a changed field value for the "class version changed" list. */
function formatDiff(value) {
  if (value == null || value === '') return 'nothing';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return format(new Date(value + 'T00:00:00'), 'd MMM');
  }
  return String(value).length > 32 ? String(value).slice(0, 32) + '...' : String(value);
}
