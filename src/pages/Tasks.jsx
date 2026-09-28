import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Check, Trash2, Plus, Users, CalendarClock, ListChecks, AlertCircle,
  StickyNote, Pencil, CopyPlus, Lock, RefreshCw, BellRing, FileText,
} from 'lucide-react';
import { useClassData } from '../lib/classDataContext';
import { useAllTasks, dueBadge, daysUntil } from '../lib/useTasks';
import { useToast } from '../lib/toastContext';
import { Field, Sheet, ConfirmButton, EmptyState, Tabs, CardSkeleton } from '../components/ui';
import { LIMITS, EVENT_TYPES, isEventType, typeOptions, clean, hasErrors, vTask, dueDateHint } from '../lib/validate';
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
  // The id of the record whose full details are open. An id rather than the
  // object, so the sheet keeps showing live data if the CR edits the class
  // version, or the student ticks it off, while it is open.
  const [openId, setOpenId] = useState(null);
  const open = openId ? tasks.find((t) => t.id === openId) : null;

  // Exams are split out entirely rather than filtered into a tab. They do not
  // belong to the pending/done idea at all: you cannot be "pending" a quiz,
  // and a quiz you sat last month is not something you "completed", it is
  // simply behind you. Mixing them in was what produced a checkbox that meant
  // nothing and a list that never emptied.
  const { events, todos } = useMemo(() => ({
    events: tasks.filter((t) => t.isEvent),
    todos: tasks.filter((t) => !t.isEvent),
  }), [tasks]);

  const upcomingEvents = events.filter((t) => !t.completed);
  const pastEvents = events.filter((t) => t.completed);

  const counts = useMemo(() => ({
    pending: todos.filter((t) => !t.completed).length,
    done: todos.filter((t) => t.completed).length,
    overdue: todos.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) < 0).length,
  }), [todos]);

  const visible = todos.filter((t) =>
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
          {counts.pending} to hand in
          {upcomingEvents.length > 0 && ` · ${upcomingEvents.length} to sit`}
          {counts.overdue > 0 && <span style={{ color: 'var(--danger)' }}> · {counts.overdue} overdue</span>}
        </p>
        <h1 className="page-title">Deadlines</h1>
      </header>

      {/* Exams first: they are the only thing on this page with a time and a
          place attached, and the only thing that cannot be done late. */}
      {(upcomingEvents.length > 0 || pastEvents.length > 0) && (
        <section className="section" style={{ marginTop: 0, marginBottom: 'var(--s5)' }}>
          <div className="section-head">
            <h2 className="section-title">Quizzes and exams</h2>
            <span className="muted small">{upcomingEvents.length} ahead</span>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="field-hint">Nothing coming up. Everything below has been sat.</p>
          ) : (
            <div className="stack-sm">
              {upcomingEvents.map((event) => (
                <EventCard
                  key={event.id}
                  task={event}
                  subject={subjects[event.subject]}
                  onOpen={() => setOpenId(event.id)}
                  onEdit={event.source === 'class' ? null : () => setEditing(event)}
                  onDelete={event.source === 'class' ? null : () => remove(event)}
                />
              ))}
            </div>
          )}

          {pastEvents.length > 0 && (
            <details className="card card-tight" style={{ marginTop: 'var(--s3)' }}>
              <summary className="muted small" style={{ cursor: 'pointer' }}>
                Already sat ({pastEvents.length})
              </summary>
              <div className="stack-sm" style={{ marginTop: 'var(--s3)' }}>
                {pastEvents.slice(0, 20).map((event) => (
                  <EventCard
                    key={event.id}
                    task={event}
                    subject={subjects[event.subject]}
                    onOpen={() => setOpenId(event.id)}
                    onEdit={event.source === 'class' ? null : () => setEditing(event)}
                    onDelete={event.source === 'class' ? null : () => remove(event)}
                    past
                  />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      <button
        className="btn btn-primary btn-block"
        onClick={() => setEditing({})}
        style={{ marginBottom: 'var(--s4)' }}
      >
        <Plus size={18} aria-hidden="true" /> Add a task
      </button>
      <p className="field-hint" style={{ marginTop: -8, marginBottom: 'var(--s4)' }}>
        Pick a quiz, sessional or final as the type and it goes to the list above
        instead, with the date it happens rather than a tick box.
      </p>

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
              title={filter === 'done' ? 'Nothing ticked off yet' : 'Nothing to hand in'}
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
              onOpen={() => setOpenId(task.id)}
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

      {/* The detail sheet has to close before the edit sheet opens, or two
          dialogs fight over the focus trap and the background scroll lock. */}
      {open && !editing && (
        <TaskDetail
          task={open}
          subject={subjects[open.subject]}
          onClose={() => setOpenId(null)}
          onToggle={() => toggle(open)}
          onEdit={() => { setEditing(open); setOpenId(null); }}
          onDelete={() => { setOpenId(null); remove(open); }}
          onAdopt={() => { setOpenId(null); adopt(open); }}
        />
      )}

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

/**
 * A quiz, mid or final.
 *
 * Structurally the same record as a task, shown without the one control that
 * made no sense on it. There is no tick box and no completion state: whether
 * this is behind you is a fact about the date, which the badge already says,
 * so a second control saying the same thing could only ever disagree with it.
 *
 * A class-wide exam is not editable here either — and unlike a deadline there
 * is no "make my own copy", because a private copy of a quiz date is a way to
 * be confidently wrong about when a quiz is.
 */
function EventCard({ task, subject, onOpen, onEdit, onDelete, past }) {
  const due = dueBadge(task);

  return (
    <div className="task" style={{ '--stripe': subject?.color, opacity: past ? 0.6 : 1 }}>
      <div
        className="task-check"
        aria-hidden="true"
        style={{ cursor: 'default', color: past ? 'var(--text-faint)' : 'var(--warning)' }}
      >
        <FileText size={19} />
      </div>

      <button className="task-open grow" onClick={onOpen} aria-label={`Open "${task.title}"`}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span>{subject?.short || task.subject}</span>
          <span className="badge">{task.type}</span>
          {task.source === 'class' && (
            <span className="badge badge-accent"><Users size={10} aria-hidden="true" /> Class</span>
          )}
          {due && (
            <span className={`badge ${due.tone}`}>
              <CalendarClock size={10} aria-hidden="true" /> {due.text}
              {task.dueDate && task.dueTime && ` ${format(new Date(`2000-01-01T${task.dueTime}`), 'h:mm a')}`}
            </span>
          )}
        </div>
        {/* A preview only. The whole note is in the sheet this opens, so a long
            one cannot push every other exam off the screen. */}
        {task.note && (
          <p className="muted small row" style={{ marginTop: 6, alignItems: 'flex-start', gap: 5 }}>
            <StickyNote size={12} aria-hidden="true" style={{ marginTop: 3, flexShrink: 0 }} />
            <span className="clamp-2">{task.note}</span>
          </p>
        )}
      </button>

      {onEdit && (
        <button className="btn-icon btn-icon-sm" onClick={onEdit} aria-label={`Edit "${task.title}"`}>
          <Pencil size={15} aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <ConfirmButton onConfirm={onDelete} label={`Delete ${task.title}`}>
          <Trash2 size={15} aria-hidden="true" />
        </ConfirmButton>
      )}
    </div>
  );
}

function TaskCard({ task, subject, onOpen, onToggle, onDelete, onEdit, onAdopt, onApplyUpdate, onKeepMine }) {
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
        {/* The row itself opens the full record. The "update mine" alert below
            stays outside this button, because a button inside a button is not
            something a browser or a screen reader can make sense of. */}
        <button className="task-open" onClick={onOpen} aria-label={`Open "${task.title}"`}>
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
              <span className="clamp-2">{task.note}</span>
            </p>
          )}
        </button>

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

/**
 * Everything the app holds about one deadline or exam.
 *
 * The cards are a scanning surface: a title, a subject, a date, and a note
 * clamped to two lines so one wordy assignment cannot bury five others. That
 * leaves nowhere for the rest of it to go, and a student who wants the full
 * submission format was having to open the edit form to read it — or, on a
 * class deadline they cannot edit at all, simply could not.
 *
 * So the row opens this instead: read-only, complete, and with the actions
 * that make sense for this particular record at the bottom.
 */
function TaskDetail({ task, subject, onClose, onToggle, onEdit, onDelete, onAdopt }) {
  const isClass = task.source === 'class';
  const due = dueBadge(task);

  const when = task.dueDate
    ? format(new Date(`${task.dueDate}T00:00:00`), 'EEEE d MMMM yyyy')
      + (task.dueTime ? `, ${format(new Date(`2000-01-01T${task.dueTime}`), 'h:mm a')}` : '')
    : (isClass ? 'Not announced yet' : 'No date set');

  const origin = isClass ? 'Announced to the whole class by your CR'
    : task.sourceTaskId ? 'Your own copy of a class deadline'
    : 'Yours only. Nobody else can see it.';

  const status = task.isEvent
    ? (task.completed ? 'Already sat' : 'Still to sit')
    : (task.completed ? 'Done' : 'Not done yet');

  return (
    <Sheet
      open
      onClose={onClose}
      title={task.title}
      subtitle={subject?.title || task.subject}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
          {/* An exam has nothing to mark. A class deadline has no edit. What is
              left over differs per record, so the primary action does too. */}
          {!task.isEvent && (
            <button className="btn btn-primary" type="button" onClick={onToggle}>
              <Check size={16} aria-hidden="true" />
              {task.completed ? 'Mark not done' : 'Mark as done'}
            </button>
          )}
          {task.isEvent && !isClass && (
            <button className="btn btn-primary" type="button" onClick={onEdit}>
              <Pencil size={16} aria-hidden="true" /> Edit
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <div className="card card-flush list">
          <div className="list-row">
            <span className="muted small grow">Subject</span>
            <span className="small">{subject?.short || task.subject} · {task.subject}</span>
          </div>
          <div className="list-row">
            <span className="muted small grow">Type</span>
            <span className="badge">{task.type}</span>
          </div>
          <div className="list-row">
            <span className="muted small grow">{task.isEvent ? 'Happens' : 'Due'}</span>
            <span className="small" style={{ textAlign: 'right' }}>{when}</span>
          </div>
          {due && (
            <div className="list-row">
              <span className="muted small grow">Status</span>
              <span className="row" style={{ gap: 6 }}>
                <span className="small">{status}</span>
                <span className={`badge ${due.tone}`}>{due.text}</span>
              </span>
            </div>
          )}
        </div>

        {task.note ? (
          <div>
            <p className="field-label" style={{ marginBottom: 8 }}>Details</p>
            <div className="card card-tight">
              <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{task.note}</p>
            </div>
          </div>
        ) : (
          <p className="field-hint">No further details were added.</p>
        )}

        {task.isEvent && (
          <div className="alert alert-accent">
            <FileText size={15} aria-hidden="true" />
            <span className="alert-body">
              Nothing to tick off. It happens on the day and then folds itself away.
            </span>
          </div>
        )}

        <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6 }}>
          {isClass
            ? <Users size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
            : <Lock size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />}
          {origin}
        </p>

        {/* Secondary actions. In the body rather than the footer, because two
            of them are one-way doors and a footer invites a reflex tap. */}
        <div className="row" style={{ gap: 'var(--s2)' }}>
          {isClass && !task.isEvent && (
            <button className="btn btn-secondary grow" type="button" onClick={onAdopt}>
              <CopyPlus size={16} aria-hidden="true" /> Make my own copy
            </button>
          )}
          {!isClass && !task.isEvent && (
            <button className="btn btn-secondary grow" type="button" onClick={onEdit}>
              <Pencil size={16} aria-hidden="true" /> Edit
            </button>
          )}
          {!isClass && (
            <ConfirmButton
              onConfirm={onDelete}
              label="Delete"
              className="btn btn-secondary"
            >
              <Trash2 size={16} aria-hidden="true" /> Delete
            </ConfirmButton>
          )}
        </div>
      </div>
    </Sheet>
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
      subtitle={EVENT_TYPES.includes(form.type)
        ? 'Only you can see this. It lands under quizzes and exams.'
        : 'Only you can see this, not even your CR.'}
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
          <Field
            label="Type" required error={show('type')}
            hint={isEventType(form.type) ? 'Sat, not handed in. No tick box.' : undefined}
          >
            <select value={form.type} onChange={set('type')}>
              {typeOptions(form.type).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <div className="field-grid">
          <Field
            label={isEventType(form.type) ? 'Date it happens' : 'Due date'}
            error={show('dueDate')}
            hint={dueDateHint(form.dueDate)
              || (isEventType(form.type)
                ? 'Without a date it cannot count down or sort itself out of the way.'
                : 'Leave empty if there is no fixed date.')}
          >
            <input type="date" value={form.dueDate} onChange={set('dueDate')} onBlur={() => setTouched(true)} />
          </Field>
          <Field label={isEventType(form.type) ? 'Starts' : 'Time'} error={show('dueTime')}>
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
