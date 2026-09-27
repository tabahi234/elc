import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { format, parse } from 'date-fns';
import {
  Plus, Pencil, Trash2, Megaphone, BookOpen, CalendarDays, Users,
  ExternalLink, Link2, ShieldCheck, Info, MapPin, Sparkles, Clock,
  ClipboardCheck, CalendarOff, CheckCheck, Check, X, CalendarRange, AlertCircle,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../lib/authContext';
import { useClassData } from '../lib/classDataContext';
import { useToast } from '../lib/toastContext';
import { Field, Sheet, ConfirmButton, EmptyState, Tabs } from '../components/ui';
import {
  LIMITS, TASK_TYPES, SLOT_TYPES, clean, hasErrors, todayIso, toMinutes,
  vTask, vSubject, vSubjectCode, vSlot, vSession, dueDateHint, safeLink, daysFromToday,
} from '../lib/validate';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Harmonised categorical set: every hue sits at roughly the same saturation
// and lightness, so no subject shouts louder than another and the group reads
// as one family. Raw Tailwind 500s do not do this.
const PALETTE = ['#5b93ce', '#45a79f', '#4fa87b', '#88a852', '#cfa153', '#cf7f63', '#ce6e8e', '#9a7fce'];

const prettyTime = (t) => (t ? format(parse(t, 'HH:mm', new Date()), 'h:mm a') : '');

/** Turns whatever the write helper returned into the right toast. */
function useCommitToast() {
  const toast = useToast();
  return (result, successMessage) => {
    if (!result || result.ok === false) {
      // Firestore never says which rule failed, so the next best thing is to
      // name the handful of things that actually cause this in practice.
      const message = result?.error?.code === 'permission-denied'
        ? 'Firestore refused that write. Usual causes: the subject it points at does not exist yet, a link is not on drive.google.com or classroom.google.com, or your role was changed.'
        : result?.error?.message || 'Something went wrong.';
      toast.error(message);
      return false;
    }
    if (result.queued) toast.warning('Saved offline. It will sync when you reconnect.');
    else toast.success(successMessage);
    return true;
  };
}

export default function Admin() {
  const { isAdmin, isCR } = useAuth();
  const { usingDefaults, publishDefaults } = useClassData();
  const [tab, setTab] = useState('deadlines');
  const report = useCommitToast();
  const [seeding, setSeeding] = useState(false);

  const seed = async () => {
    setSeeding(true);
    report(await publishDefaults(), 'Starter timetable published to the class.');
    setSeeding(false);
  };

  const tabs = [
    { value: 'deadlines', label: 'Deadlines', icon: Megaphone },
    { value: 'subjects', label: 'Subjects', icon: BookOpen },
    { value: 'timetable', label: 'Timetable', icon: CalendarDays },
    { value: 'sessions', label: 'Register', icon: ClipboardCheck },
    ...(isAdmin ? [{ value: 'people', label: 'People', icon: Users }] : []),
  ];

  return (
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">Class management</p>
        <h1 className="page-title">Manage</h1>
        <p className="page-sub row" style={{ gap: 6 }}>
          <ShieldCheck size={14} aria-hidden="true" />
          Signed in as {isAdmin ? 'admin' : isCR ? 'class representative' : 'student'} · everything here is visible to the whole class
        </p>
      </header>

      {usingDefaults && (
        <div className="alert alert-accent" style={{ marginBottom: 'var(--s4)' }}>
          <Sparkles size={16} aria-hidden="true" />
          <div className="grow">
            <div className="alert-body" style={{ fontWeight: 650 }}>Nothing published yet</div>
            <p className="alert-body small" style={{ marginTop: 2 }}>
              The class is seeing the timetable bundled with the app. Publish it once
              to make it editable, then keep it up to date here.
            </p>
            <button className="btn btn-sm btn-primary" style={{ marginTop: 'var(--s3)' }} onClick={seed} disabled={seeding}>
              {seeding ? 'Publishing…' : 'Publish starter timetable'}
            </button>
          </div>
        </div>
      )}

      <Tabs value={tab} onChange={setTab} options={tabs} />

      <div style={{ marginTop: 'var(--s4)' }}>
        {tab === 'deadlines' && <DeadlinesTab />}
        {tab === 'subjects' && <SubjectsTab />}
        {tab === 'timetable' && <TimetableTab />}
        {tab === 'sessions' && <SessionsTab />}
        {tab === 'people' && isAdmin && <PeopleTab />}
      </div>
    </div>
  );
}

/* ══ Deadlines ═══════════════════════════════════════════════════════════════ */

const blankTask = (subjects) => ({
  title: '', subject: Object.keys(subjects)[0] || '', type: 'Assignment',
  dueDate: '', dueTime: '', note: '',
});

function DeadlinesTab() {
  const { subjects, globalTasks, saveGlobalTask, deleteGlobalTask, usingDefaults } = useClassData();
  const report = useCommitToast();
  const [editing, setEditing] = useState(null);

  const upcoming = globalTasks.filter((t) => t.dueDate >= todayIso());
  const past = globalTasks.filter((t) => t.dueDate < todayIso()).reverse();

  const remove = async (task) => {
    report(await deleteGlobalTask(task.id), `Removed "${task.title}".`);
  };

  return (
    <div className="stack">
      <button
        className="btn btn-primary btn-block"
        onClick={() => setEditing(blankTask(subjects))}
        disabled={usingDefaults}
      >
        <Plus size={18} aria-hidden="true" /> Announce a deadline
      </button>
      {usingDefaults && <p className="field-hint">Publish the timetable first so deadlines can be tied to a subject.</p>}

      <TaskGroup title="Upcoming" tasks={upcoming} subjects={subjects} onEdit={setEditing} onDelete={remove} />
      {past.length > 0 && (
        <details className="card card-tight">
          <summary className="muted small" style={{ cursor: 'pointer' }}>Past deadlines ({past.length})</summary>
          <div className="stack-sm" style={{ marginTop: 'var(--s3)' }}>
            {past.map((t) => (
              <TaskRow key={t.id} task={t} subjects={subjects} onEdit={setEditing} onDelete={remove} />
            ))}
          </div>
        </details>
      )}

      {editing && (
        <TaskSheet
          task={editing}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const isEdit = Boolean(editing.id);
            const payload = isEdit
              ? { ...data, createdAt: editing.createdAt, createdBy: editing.createdBy }
              : data;
            const ok = report(
              await saveGlobalTask(editing.id ?? null, payload),
              isEdit ? 'Deadline updated for everyone.' : 'Deadline sent to the whole class.'
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TaskGroup({ title, tasks, subjects, onEdit, onDelete }) {
  return (
    <section className="section" style={{ marginTop: 'var(--s2)' }}>
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="muted small">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="card">
          <EmptyState icon={Megaphone} title="No deadlines announced">
            Anything you add here lands on every classmate's dashboard straight away.
          </EmptyState>
        </div>
      ) : (
        <div className="stack-sm">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} subjects={subjects} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, subjects, onEdit, onDelete }) {
  const subject = subjects[task.subject];
  return (
    <div className="card card-tight card-accent row" style={{ '--stripe': subject?.color }}>
      <div className="grow">
        <div style={{ fontWeight: 650 }}>{task.title}</div>
        <div className="muted tiny row-wrap" style={{ marginTop: 4 }}>
          <span className="badge">{task.type}</span>
          <span>{subject?.short || task.subject}</span>
          <span className="dot-sep" />
          <span className="nums">
            {format(new Date(`${task.dueDate}T00:00:00`), 'EEE, MMM d')}
            {task.dueTime ? ` · ${prettyTime(task.dueTime)}` : ''}
          </span>
        </div>
        {task.note && <p className="muted small" style={{ marginTop: 6 }}>{task.note}</p>}
      </div>
      <button className="btn-icon btn-icon-sm" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}>
        <Pencil size={15} aria-hidden="true" />
      </button>
      <ConfirmButton onConfirm={() => onDelete(task)} label={`Delete ${task.title}`}>
        <Trash2 size={15} aria-hidden="true" />
      </ConfirmButton>
    </div>
  );
}

function TaskSheet({ task, subjects, onClose, onSave }) {
  const [form, setForm] = useState(task);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = vTask(form);
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
      dueDate: form.dueDate,
      dueTime: form.dueTime || '',
      note: clean(form.note),
    });
    setSaving(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={task.id ? 'Edit deadline' : 'Announce a deadline'}
      subtitle="Every student sees this immediately and gets an alert as it approaches."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
            {saving ? 'Saving…' : task.id ? 'Save changes' : 'Announce'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <Field
          label="What is due" required error={show('title')}
          counter={{ value: clean(form.title).length, max: LIMITS.title.max }}
        >
          <input
            value={form.title} onChange={set('title')} onBlur={() => setTouched(true)}
            placeholder="e.g. Assignment 2 on inheritance and polymorphism"
            maxLength={LIMITS.title.max}
          />
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
          <Field label="Due date" required error={show('dueDate')} hint={dueDateHint(form.dueDate)}>
            <input type="date" value={form.dueDate} onChange={set('dueDate')} onBlur={() => setTouched(true)} />
          </Field>
          <Field label="Due time" error={show('dueTime')} hint="Optional, for a submission cut-off.">
            <input type="time" value={form.dueTime} onChange={set('dueTime')} />
          </Field>
        </div>

        <Field
          label="Note" error={show('note')}
          hint="Submission format, chapters covered, anything they will ask about."
          counter={{ value: clean(form.note).length, max: LIMITS.note.max }}
        >
          <textarea value={form.note} onChange={set('note')} maxLength={LIMITS.note.max} rows={3} />
        </Field>
      </form>
    </Sheet>
  );
}

/* ══ Subjects & links ════════════════════════════════════════════════════════ */

const blankSubject = () => ({
  code: '', title: '', short: '', teacher: '', credits: 3,
  color: PALETTE[0], online: false, driveLink: '', classroomLink: '',
});

function SubjectsTab() {
  const { subjects, timetable, saveSubject, deleteSubject } = useClassData();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const report = useCommitToast();
  const [editing, setEditing] = useState(null);

  return (
    <div className="stack">
      <button className="btn btn-primary btn-block" onClick={() => setEditing(blankSubject())}>
        <Plus size={18} aria-hidden="true" /> Add a subject
      </button>

      {Object.entries(subjects).map(([code, s]) => {
        const drive = safeLink(s.driveLink, 'drive');
        const classroom = safeLink(s.classroomLink, 'classroom');
        return (
          <div key={code} className="card card-accent" style={{ '--stripe': s.color }}>
            <div className="row-between">
              <div className="grow">
                <div style={{ fontWeight: 650 }}>{s.title}</div>
                <div className="muted tiny" style={{ marginTop: 3 }}>
                  {code} · {s.credits} cr{s.teacher ? ` · ${s.teacher}` : ''}
                </div>
              </div>
              <button className="btn-icon btn-icon-sm" onClick={() => setEditing({ code, ...s })} aria-label={`Edit ${s.title}`}>
                <Pencil size={15} aria-hidden="true" />
              </button>
              {isAdmin && (
                <ConfirmButton
                  onConfirm={async () => {
                    // A slot whose subject is gone fails subjectExists() in the
                    // rules forever after, so it can never be edited or fixed.
                    // Refuse rather than create one.
                    const used = timetable.filter((slot) => slot.code === code).length;
                    if (used > 0) {
                      toast.error(`${code} still has ${used} class ${used === 1 ? 'slot' : 'slots'} on the timetable. Delete those first, or they become uneditable.`);
                      return;
                    }
                    report(await deleteSubject(code), `${code} removed.`);
                  }}
                  label={`Delete ${s.title}`}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </ConfirmButton>
              )}
            </div>

            <div className="row-wrap" style={{ marginTop: 'var(--s3)' }}>
              <span className={`badge ${drive ? 'badge-success' : ''}`}>
                <Link2 size={11} aria-hidden="true" /> {drive ? 'Drive linked' : 'No Drive link'}
              </span>
              <span className={`badge ${classroom ? 'badge-success' : ''}`}>
                <Link2 size={11} aria-hidden="true" /> {classroom ? 'Classroom linked' : 'No Classroom link'}
              </span>
              {s.online && <span className="badge badge-accent">Online course</span>}
            </div>
          </div>
        );
      })}

      {editing && (
        <SubjectSheet
          subject={editing}
          existingCodes={Object.keys(subjects)}
          onClose={() => setEditing(null)}
          onSave={async (code, data) => {
            const ok = report(await saveSubject(code, data), `${code} saved.`);
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SubjectSheet({ subject, existingCodes, onClose, onSave }) {
  const isNew = !existingCodes.includes(subject.code);
  const [form, setForm] = useState({ ...subject, code: subject.code || '' });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = { ...vSubject(form) };
  const codeError = vSubjectCode(form.code);
  if (codeError) errors.code = codeError;
  else if (isNew && existingCodes.includes(clean(form.code).toUpperCase())) {
    errors.code = 'That course code already exists.';
  }
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    await onSave(clean(form.code).toUpperCase(), {
      title: clean(form.title),
      short: clean(form.short),
      teacher: clean(form.teacher),
      credits: Number(form.credits),
      color: form.color,
      online: Boolean(form.online),
      order: Number.isInteger(form.order) ? form.order : existingCodes.length,
      driveLink: clean(form.driveLink),
      classroomLink: clean(form.classroomLink),
    });
    setSaving(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Add a subject' : form.title || form.code}
      subtitle="Links appear on the subject card for every student."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
            {saving ? 'Saving…' : 'Save subject'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <div className="field-grid">
          <Field label="Course code" required error={show('code')} hint={isNew ? 'e.g. CSC241' : 'Cannot be changed.'}>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              onBlur={() => setTouched(true)}
              disabled={!isNew}
              placeholder="CSC241"
              maxLength={7}
            />
          </Field>
          <Field label="Credit hours" required error={show('credits')}>
            <select value={form.credits} onChange={(e) => setForm((f) => ({ ...f, credits: Number(e.target.value) }))}>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Full title" required error={show('title')}>
          <input value={form.title} onChange={set('title')} onBlur={() => setTouched(true)} placeholder="Object Oriented Programming" maxLength={LIMITS.subjectTitle.max} />
        </Field>

        <div className="field-grid">
          <Field label="Short name" required error={show('short')} hint="Shown on small cards.">
            <input value={form.short} onChange={set('short')} onBlur={() => setTouched(true)} placeholder="OOP" maxLength={LIMITS.subjectShort.max} />
          </Field>
          <Field label="Teacher" error={show('teacher')}>
            <input value={form.teacher} onChange={set('teacher')} placeholder="Dr. Habib" maxLength={LIMITS.teacher.max} />
          </Field>
        </div>

        <Field label="Colour" error={show('color')} hint="Used for the stripe on every card for this subject.">
          <div className="row-wrap" style={{ gap: 6 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => ({ ...f, color: c }))}
                aria-label={`Colour ${c}`}
                aria-pressed={form.color === c}
                style={{
                  width: 32, height: 32, borderRadius: 9, background: c,
                  border: form.color === c ? '2px solid var(--text)' : '2px solid transparent',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </Field>

        <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(form.online)}
            onChange={(e) => setForm((f) => ({ ...f, online: e.target.checked }))}
            style={{ width: 18, height: 18, minHeight: 0, accentColor: 'var(--accent)' }}
          />
          <span className="small">Online course (no room on the timetable)</span>
        </label>

        <hr className="divider" />

        <Field
          label="Google Drive course material"
          error={show('driveLink')}
          hint="Students open this from the subject card. Only drive.google.com or docs.google.com links are accepted."
        >
          <input value={form.driveLink} onChange={set('driveLink')} onBlur={() => setTouched(true)}
            type="url" inputMode="url" placeholder="https://drive.google.com/drive/folders/…" />
        </Field>

        <Field
          label="Google Classroom"
          error={show('classroomLink')}
          hint="Only classroom.google.com links are accepted."
        >
          <input value={form.classroomLink} onChange={set('classroomLink')} onBlur={() => setTouched(true)}
            type="url" inputMode="url" placeholder="https://classroom.google.com/c/…" />
        </Field>

        <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6 }}>
          <Info size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          Only those two hosts are allowed, on the server as well as here. A shortened
          or redirecting link will be rejected. Paste the address from the Drive or
          Classroom address bar.
        </p>
      </form>
    </Sheet>
  );
}

/* ══ Timetable ═══════════════════════════════════════════════════════════════ */

const blankSlot = (subjects) => ({
  day: 1, start: '08:30', end: '10:00',
  code: Object.keys(subjects)[0] || '', room: '', type: 'Lecture',
  changeNote: '', changeUntil: '',
});

function TimetableTab() {
  const { subjects, timetable, saveSlot, deleteSlot, usingDefaults } = useClassData();
  const report = useCommitToast();
  const [editing, setEditing] = useState(null);

  const byDay = useMemo(() => {
    const groups = {};
    for (const slot of timetable) (groups[slot.day] ??= []).push(slot);
    return groups;
  }, [timetable]);

  if (usingDefaults) {
    return (
      <div className="card">
        <EmptyState icon={CalendarDays} title="Timetable not published yet">
          Publish the starter timetable at the top of this page, then you can edit
          every slot, change a room, or add a make-up class.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="stack">
      <button className="btn btn-primary btn-block" onClick={() => setEditing(blankSlot(subjects))}>
        <Plus size={18} aria-hidden="true" /> Add a class slot
      </button>

      {timetable.length === 0 && (
        <div className="card"><EmptyState icon={CalendarDays} title="No slots yet" /></div>
      )}

      {DAYS.map((dayName, day) => {
        const slots = byDay[day];
        if (!slots?.length) return null;
        return (
          <section key={day} className="section" style={{ marginTop: 'var(--s2)' }}>
            <div className="section-head">
              <h2 className="section-title">{dayName}</h2>
              <span className="muted small">{slots.length} {slots.length === 1 ? 'class' : 'classes'}</span>
            </div>
            <div className="stack-sm">
              {slots.map((slot) => {
                const s = subjects[slot.code];
                const changeLive = slot.changeNote && (!slot.changeUntil || slot.changeUntil >= todayIso());
                return (
                  <div key={slot.id} className="card card-tight card-accent" style={{ '--stripe': s?.color }}>
                    <div className="row">
                      <div className="grow">
                        <div className="row-wrap" style={{ gap: 6 }}>
                          <span style={{ fontWeight: 650 }}>{s?.short || slot.code}</span>
                          <span className="badge">{slot.type}</span>
                        </div>
                        <div className="muted tiny row-wrap nums" style={{ marginTop: 4, gap: 8 }}>
                          <span className="row" style={{ gap: 4 }}><Clock size={11} aria-hidden="true" />{prettyTime(slot.start)}-{prettyTime(slot.end)}</span>
                          <span className="row" style={{ gap: 4 }}><MapPin size={11} aria-hidden="true" />{slot.room}</span>
                        </div>
                      </div>
                      <button className="btn-icon btn-icon-sm" onClick={() => setEditing(slot)} aria-label={`Edit ${s?.short || slot.code} on ${dayName}`}>
                        <Pencil size={15} aria-hidden="true" />
                      </button>
                      <ConfirmButton
                        onConfirm={async () => report(await deleteSlot(slot.id), 'Class slot removed.')}
                        label="Delete slot"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </ConfirmButton>
                    </div>
                    {changeLive && (
                      <div className="alert alert-warning" style={{ marginTop: 'var(--s2)', padding: 'var(--s2) var(--s3)' }}>
                        <Info size={14} aria-hidden="true" />
                        <span>{slot.changeNote}{slot.changeUntil ? ` · until ${format(new Date(`${slot.changeUntil}T00:00:00`), 'MMM d')}` : ''}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {editing && (
        <SlotSheet
          slot={editing}
          subjects={subjects}
          others={timetable.filter((s) => s.id !== editing.id)}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const ok = report(await saveSlot(editing.id ?? null, data), 'Timetable updated for the class.');
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SlotSheet({ slot, subjects, others, onClose, onSave }) {
  const [form, setForm] = useState(slot);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = vSlot(form, others);
  const isClock = (v) => typeof v === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(v);
  const duration = isClock(form.start) && isClock(form.end)
    ? toMinutes(form.end) - toMinutes(form.start)
    : null;
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    await onSave({
      day: Number(form.day),
      start: form.start,
      end: form.end,
      code: form.code,
      room: clean(form.room),
      type: form.type,
      changeNote: clean(form.changeNote),
      changeUntil: form.changeUntil || '',
    });
    setSaving(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={slot.id ? 'Edit class slot' : 'Add a class slot'}
      subtitle="Clashes with an existing slot are caught before you can save."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
            {saving ? 'Saving…' : 'Save slot'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <div className="field-grid">
          <Field label="Subject" required error={show('code')}>
            <select value={form.code} onChange={set('code')}>
              {Object.entries(subjects).map(([code, s]) => (
                <option key={code} value={code}>{s.short} ({code})</option>
              ))}
            </select>
          </Field>
          <Field label="Type" required error={show('type')}>
            <select value={form.type} onChange={set('type')}>
              {SLOT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Day" required error={show('day')}>
          <select value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: Number(e.target.value) }))}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </Field>

        <div className="field-grid">
          <Field label="Starts" required error={show('start')}>
            <input type="time" value={form.start} onChange={set('start')} onBlur={() => setTouched(true)} step={300} />
          </Field>
          <Field label="Ends" required error={show('end')}>
            <input type="time" value={form.end} onChange={set('end')} onBlur={() => setTouched(true)} step={300} />
          </Field>
        </div>

        {/* Reading a duration off two clock times is exactly the sort of sum
            people get wrong when they are retyping a changed timetable. */}
        {duration != null && (
          <p className="field-hint" style={{ marginTop: -4 }}>
            {duration > 0
              ? `That is ${Math.floor(duration / 60)}h ${String(duration % 60).padStart(2, '0')}m of class.`
              : 'The end time is not after the start time.'}
          </p>
        )}

        <Field label="Room" required error={show('room')} hint="Where it actually happens today.">
          <input value={form.room} onChange={set('room')} onBlur={() => setTouched(true)} placeholder="D-109" maxLength={LIMITS.room.max} />
        </Field>

        <hr className="divider" />

        <p className="field-label" style={{ marginBottom: -4 }}>Temporary change notice</p>
        <p className="field-hint" style={{ marginTop: -4 }}>
          Changed the room for a week, or shifted a class? Update the room above, then
          leave a note here so nobody walks into the old one. It shows on the dashboard
          and disappears on its own after the date you set.
        </p>

        <Field label="Note to the class" error={show('changeNote')}
          counter={{ value: clean(form.changeNote).length, max: 140 }}>
          <input value={form.changeNote} onChange={set('changeNote')}
            placeholder="Moved from N-15 to D-7 while the lab is being rewired" maxLength={140} />
        </Field>

        <Field label="Show the note until" error={show('changeUntil')}
          hint="Leave empty to keep it up until you remove it.">
          <input type="date" value={form.changeUntil} onChange={set('changeUntil')} min={todayIso()} />
        </Field>
      </form>
    </Sheet>
  );
}

/* ══ People ══════════════════════════════════════════════════════════════════ */

function PeopleTab() {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => onSnapshot(
    collection(db, 'roles'),
    (snap) => { setRoles(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))); setError(null); },
    (err) => setError(err.message)
  ), []);

  return (
    <div className="stack">
      <div className="alert alert-accent">
        <ShieldCheck size={16} aria-hidden="true" />
        <div className="alert-body">
          <strong>How access works.</strong> A class representative can edit deadlines,
          subjects and the timetable. Only an admin can add or remove a CR, and the
          admin role itself can only be granted from the Firebase console, so nobody
          can promote themselves from inside the app, even with the developer tools open.
        </div>
      </div>

      <GrantCR existing={roles} />

      <section className="section" style={{ marginTop: 'var(--s2)' }}>
        <div className="section-head"><h2 className="section-title">Current access</h2></div>
        {error && <div className="alert alert-danger"><Info size={15} aria-hidden="true" />{error}</div>}
        {roles.length === 0 && !error && (
          <div className="card"><EmptyState icon={Users} title="No roles assigned">Everyone is a student.</EmptyState></div>
        )}
        <div className="stack-sm">
          {roles.map((r) => <RoleRow key={r.uid} role={r} isSelf={r.uid === user.uid} />)}
        </div>
      </section>
    </div>
  );
}

function RoleRow({ role, isSelf }) {
  const report = useCommitToast();
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'roles', role.uid));
      report({ ok: true }, `${role.email || role.uid} is a student again.`);
    } catch (error) {
      report({ ok: false, error });
    }
    setBusy(false);
  };

  return (
    <div className="card card-tight row">
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="truncate" style={{ fontWeight: 600 }}>{role.email || '(no email recorded)'}</div>
        <div className="muted tiny truncate">{role.uid}</div>
      </div>
      <span className={`badge ${role.role === 'admin' ? 'badge-danger' : 'badge-accent'}`}>{role.role}</span>
      {role.role !== 'admin' && !isSelf && (
        <ConfirmButton onConfirm={revoke} label="Revoke access" className="btn-icon btn-icon-sm btn-icon-danger">
          {busy ? '…' : <Trash2 size={15} aria-hidden="true" />}
        </ConfirmButton>
      )}
    </div>
  );
}

function GrantCR({ existing }) {
  const { user } = useAuth();
  const report = useCommitToast();
  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const errors = {};
  const trimmedUid = clean(uid);
  if (!trimmedUid) errors.uid = 'Paste the user ID.';
  else if (!/^[A-Za-z0-9]{20,64}$/.test(trimmedUid)) errors.uid = 'That does not look like a Firebase user ID.';
  else if (trimmedUid === user.uid) errors.uid = 'You cannot change your own role.';
  else if (existing.some((r) => r.uid === trimmedUid && r.role === 'admin')) errors.uid = 'That user is an admin already.';
  if (!clean(email).includes('@')) errors.email = 'Add their email so the list is readable.';

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setBusy(true);
    try {
      await setDoc(doc(db, 'roles', trimmedUid), {
        role: 'cr',
        email: clean(email),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      report({ ok: true }, `${clean(email)} can now manage class data.`);
      setUid(''); setEmail(''); setTouched(false);
    } catch (error) {
      report({ ok: false, error });
    }
    setBusy(false);
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div>
        <h2 className="section-title">Make someone a class representative</h2>
        <p className="muted small" style={{ marginTop: 2 }}>
          Find their user ID in Firebase console → Authentication → Users. They have to
          sign in once before they appear there.
        </p>
      </div>
      <Field label="Firebase user ID" required error={touched ? errors.uid : undefined}>
        <input value={uid} onChange={(e) => setUid(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="e.g. 7Kc2fQ1mZ9XbTn4wLpR8sVd3Ae02" spellCheck={false} />
      </Field>
      <Field label="Their email" required error={touched ? errors.email : undefined} hint="Only so you can tell the list apart later.">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)}
          placeholder="name@example.com" />
      </Field>
      <button className="btn btn-primary" disabled={busy} type="submit">
        <ExternalLink size={16} aria-hidden="true" /> {busy ? 'Granting…' : 'Grant CR access'}
      </button>
    </form>
  );
}

/* ══ Sessions: which classes actually happened ═══════════════════════════════ */

/**
 * The CR's register. Students cannot know how many classes were held, so this
 * is the one number they must be given. Everything here is one tap: the day's
 * scheduled classes are listed, and each is marked held, cancelled, or left
 * alone.
 */
function SessionsTab() {
  const { subjects, timetable, sessions, saveSession, deleteSession, usingDefaults } = useClassData();
  const report = useCommitToast();
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
  const scheduled = useMemo(
    () => timetable.filter((s) => s.day === dayOfWeek),
    [timetable, dayOfWeek]
  );
  const onDate = useMemo(
    () => sessions.filter((s) => s.date === date),
    [sessions, date]
  );
  const recordFor = (slot) => onDate.find((s) => s.slotId === slot.id);

  const isFuture = daysFromToday(date) > 0;

  const mark = async (slot, status) => {
    const existing = recordFor(slot);
    setBusy(slot.id);
    if (existing && existing.status === status) {
      report(await deleteSession(existing.id), 'Record removed.');
    } else {
      const errors = vSession(
        { code: slot.code, date, slotId: slot.id, status, id: existing?.id },
        sessions
      );
      if (hasErrors(errors)) {
        setBusy(null);
        return report({ ok: false, error: new Error(Object.values(errors)[0]) });
      }
      report(
        await saveSession(existing?.id ?? null, {
          code: slot.code, date, slotId: slot.id, status, note: '',
        }),
        status === 'held' ? 'Marked as held.' : 'Marked as cancelled.'
      );
    }
    setBusy(null);
  };

  const markAllHeld = async () => {
    const pending = scheduled.filter((slot) => !recordFor(slot));
    if (!pending.length) return;
    setBusy('all');
    let failed = 0;
    // Sequential, because two writes for the same slot racing each other would
    // both pass the duplicate check and create two records.
    for (const slot of pending) {
      const result = await saveSession(null, {
        code: slot.code, date, slotId: slot.id, status: 'held', note: '',
      });
      if (!result.ok) failed++;
    }
    setBusy(null);
    if (failed) report({ ok: false, error: new Error(`${failed} of ${pending.length} could not be saved.`) });
    else report({ ok: true }, `${pending.length} ${pending.length === 1 ? 'class' : 'classes'} recorded.`);
  };

  const totals = useMemo(() => {
    const held = sessions.filter((s) => s.status !== 'cancelled');
    const byCode = {};
    for (const s of held) byCode[s.code] = (byCode[s.code] || 0) + 1;
    return { held: held.length, byCode };
  }, [sessions]);

  if (usingDefaults) {
    return (
      <div className="card">
        <EmptyState icon={ClipboardCheck} title="Publish the timetable first">
          Attendance is recorded against the published timetable, so that has to
          exist before you can mark a class as held.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="alert alert-accent">
        <Info size={16} aria-hidden="true" />
        <p className="alert-body small">
          Mark each class as held or cancelled. Students then mark themselves
          present or absent against exactly these, so nobody has to guess how
          many classes there were.
        </p>
      </div>

      <button className="btn btn-secondary btn-block" onClick={() => setBulkOpen(true)}>
        <CalendarRange size={17} aria-hidden="true" /> Record a date range
      </button>

      <Field label="Date" hint={isFuture ? 'That day has not happened yet.' : undefined}>
        <input
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      {scheduled.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarOff} title="No classes scheduled that day">
            Pick another date, or add a make-up class from the Timetable tab.
          </EmptyState>
        </div>
      ) : (
        <>
          <button
            className="btn btn-secondary btn-block"
            onClick={markAllHeld}
            disabled={isFuture || busy === 'all' || scheduled.every((s) => recordFor(s))}
          >
            <CheckCheck size={17} aria-hidden="true" />
            {busy === 'all' ? 'Recording…' : 'All of them went ahead'}
          </button>

          <div className="stack-sm">
            {scheduled.map((slot) => {
              const record = recordFor(slot);
              const s = subjects[slot.code];
              return (
                <div key={slot.id} className="card card-tight card-accent" style={{ '--stripe': s?.color }}>
                  <div className="row-between" style={{ marginBottom: 'var(--s2)' }}>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate" style={{ fontWeight: 560 }}>{s?.short || slot.code}</div>
                      <div className="muted tiny nums">
                        {prettyTime(slot.start)} to {prettyTime(slot.end)} · {slot.room}
                      </div>
                    </div>
                    {record && (
                      <span className={`badge ${record.status === 'held' ? 'badge-success' : 'badge-warning'}`}>
                        {record.status === 'held' ? 'Held' : 'Cancelled'}
                      </span>
                    )}
                  </div>
                  <div className="row" style={{ gap: 'var(--s2)' }}>
                    <button
                      className={`btn btn-sm grow ${record?.status === 'held' ? 'btn-success' : 'btn-secondary'}`}
                      onClick={() => mark(slot, 'held')}
                      disabled={isFuture || busy === slot.id}
                    >
                      <Check size={14} aria-hidden="true" /> Held
                    </button>
                    <button
                      className={`btn btn-sm grow ${record?.status === 'cancelled' ? 'btn-danger' : 'btn-secondary'}`}
                      onClick={() => mark(slot, 'cancelled')}
                      disabled={isFuture || busy === slot.id}
                    >
                      <X size={14} aria-hidden="true" /> Cancelled
                    </button>
                  </div>
                  {record && (
                    <p className="field-hint" style={{ marginTop: 6 }}>
                      Tap the same button again to undo this record.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <section className="section" style={{ marginTop: 'var(--s2)' }}>
        <div className="section-head">
          <h2 className="section-title">Recorded so far</h2>
          <span className="muted small">{totals.held} classes</span>
        </div>
        <div className="card card-flush list">
          {Object.entries(subjects).map(([code, s]) => (
            <div key={code} className="list-row" style={{ minHeight: 44 }}>
              <span className="grow small truncate">{s.short}</span>
              <span className="small nums muted">{totals.byCode[code] || 0} held</span>
            </div>
          ))}
        </div>
      </section>

      {bulkOpen && (
        <BulkRecordSheet onClose={() => setBulkOpen(false)} onDone={() => setBulkOpen(false)} />
      )}
    </div>
  );
}

/**
 * Record a whole stretch of term in one go.
 *
 * A date range on its own would quietly record every public holiday and every
 * class that was called off, which is exactly the kind of wrong number this
 * whole feature exists to prevent. So the range only proposes: it lists the
 * teaching days it found, each is unticked with one tap, and anything already
 * recorded is skipped rather than duplicated.
 */
function BulkRecordSheet({ onClose, onDone }) {
  const { subjects, timetable, sessions, bulkRecordSessions } = useClassData();
  const report = useCommitToast();

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    // format() works in local time. toISOString() would convert to UTC, which
    // east of Greenwich rolls local midnight back to the previous day.
    return format(d, 'yyyy-MM-dd');
  });
  const [to, setTo] = useState(todayIso());
  const [skipped, setSkipped] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  // Every scheduled class on every day in the range, grouped by day.
  const { days, rangeError, alreadyRecorded } = useMemo(() => {
    if (!from || !to) return { days: [], rangeError: 'Pick both dates.', alreadyRecorded: 0 };
    if (from > to) return { days: [], rangeError: 'The start date is after the end date.', alreadyRecorded: 0 };
    if (daysFromToday(to) > 0) return { days: [], rangeError: 'The end date is in the future.', alreadyRecorded: 0 };

    const spanDays = Math.round(
      (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86_400_000
    ) + 1;
    if (spanDays > 120) return { days: [], rangeError: 'Keep the range under 120 days.', alreadyRecorded: 0 };

    // One lookup key per class already on the register, so re-running a range
    // that overlaps an earlier one cannot double count.
    const existing = new Set(sessions.map((s) => `${s.date}|${s.slotId ?? s.code}`));

    const out = [];
    let dupes = 0;
    const cursor = new Date(`${from}T00:00:00`);
    for (let i = 0; i < spanDays; i++) {
      const date = format(cursor, 'yyyy-MM-dd');
      const weekday = cursor.getDay();
      const slots = timetable.filter((s) => s.day === weekday);
      const fresh = slots.filter((s) => !existing.has(`${date}|${s.id}`));
      dupes += slots.length - fresh.length;
      if (fresh.length) out.push({ date, weekday, slots: fresh });
      cursor.setDate(cursor.getDate() + 1);
    }
    return { days: out, rangeError: null, alreadyRecorded: dupes };
  }, [from, to, timetable, sessions]);

  const included = days.filter((d) => !skipped.has(d.date));
  const total = included.reduce((n, d) => n + d.slots.length, 0);

  const toggleDay = (date) => setSkipped((current) => {
    const next = new Set(current);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });

  const submit = async () => {
    const entries = included.flatMap((d) =>
      d.slots.map((s) => ({ code: s.code, date: d.date, slotId: s.id })));
    if (!entries.length) return;
    setSaving(true);
    const result = await bulkRecordSessions(entries);
    setSaving(false);
    if (report(result, `${result.written} ${result.written === 1 ? 'class' : 'classes'} recorded.`)) {
      onDone();
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Record a date range"
      subtitle="Marks every scheduled class in the range as held."
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={submit} disabled={saving || !total}>
            {saving ? 'Recording…' : total ? `Record ${total}` : 'Nothing to record'}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field-grid">
          <Field label="From" required>
            <input type="date" value={from} max={todayIso()} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" required>
            <input type="date" value={to} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {rangeError ? (
          <p className="field-error"><AlertCircle size={13} aria-hidden="true" />{rangeError}</p>
        ) : (
          <>
            <div className="alert alert-accent">
              <Info size={15} aria-hidden="true" />
              <span className="alert-body">
                {total} {total === 1 ? 'class' : 'classes'} across {included.length}{' '}
                {included.length === 1 ? 'day' : 'days'}.
                {alreadyRecorded > 0 && ` ${alreadyRecorded} already on the register and will be skipped.`}
              </span>
            </div>

            {days.length > 0 && (
              <div>
                <p className="field-label" style={{ marginBottom: 6 }}>
                  Untick any day the class did not happen
                </p>
                <p className="field-hint" style={{ marginBottom: 'var(--s2)' }}>
                  Public holidays, strikes, anything cancelled. Everything left
                  ticked is recorded as held.
                </p>
                <div className="card card-flush list">
                  {days.map((day) => {
                    const on = !skipped.has(day.date);
                    return (
                      <button
                        key={day.date}
                        className="list-row list-row-link"
                        onClick={() => toggleDay(day.date)}
                        role="checkbox"
                        aria-checked={on}
                        style={{ opacity: on ? 1 : 0.45, textAlign: 'left' }}
                      >
                        <span className="task-check-box" style={{ width: 20, height: 20, flexShrink: 0 }}>
                          {on && <Check size={12} aria-hidden="true" strokeWidth={3} />}
                        </span>
                        <span className="grow small nums">
                          {format(new Date(`${day.date}T00:00:00`), 'EEE, d MMM')}
                        </span>
                        <span className="muted tiny truncate" style={{ maxWidth: '48%' }}>
                          {day.slots.map((s) => subjects[s.code]?.short || s.code).join(', ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {days.length === 0 && (
              <p className="field-hint">
                No unrecorded classes in that range. Either nothing was scheduled,
                or it is all on the register already.
              </p>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
