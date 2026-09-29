import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { format, parse } from 'date-fns';
import {
  Plus, Pencil, Trash2, Megaphone, BookOpen, CalendarDays, Users,
  Link2, ShieldCheck, Info, MapPin, Sparkles, Clock, CalendarClock,
  Share2, CalendarX2, CalendarPlus, ArrowRightLeft, Copy, Ban,
  FileText, Armchair, UserX, Search,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../lib/authContext';
import { useClassData } from '../lib/classDataContext';
import { useToast } from '../lib/toastContext';
import { Field, Sheet, ConfirmButton, EmptyState, Tabs } from '../components/ui';
import {
  LIMITS, SLOT_TYPES, EXAM_KINDS, typeOptions, clean, hasErrors, todayIso, toMinutes,
  vTask, vSubject, vSubjectCode, vSlot, vClassChange, vAnnouncement, vExam, vExamMode,
  dueDateHint, safeLink, daysFromToday,
} from '../lib/validate';
import { friendlyError } from '../lib/errors';
import { settle } from '../lib/writes';
import { classesOn, upcomingChanges, describeChange, changeIsPast } from '../lib/schedule';
import { isLive } from '../lib/announcements';
import {
  examModeActive, examModeDates, upcomingExams, pastExams, examCountdown, examShareText,
} from '../lib/exams';
import {
  shareText, shareSupported,
  deadlineShareText, announcementShareText, changeShareText,
} from '../lib/share';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Harmonised categorical set: every hue sits at roughly the same saturation
// and lightness, so no subject shouts louder than another and the group reads
// as one family. Raw Tailwind 500s do not do this.
const PALETTE = ['#5b93ce', '#45a79f', '#4fa87b', '#88a852', '#cfa153', '#cf7f63', '#ce6e8e', '#9a7fce'];

const prettyTime = (t) => (t ? format(parse(t, 'HH:mm', new Date()), 'h:mm a') : '');
const prettyDate = (iso) => format(new Date(`${iso}T00:00:00`), 'EEE d MMM');

/**
 * A form's starting values, with every listed field that is null or missing
 * turned into an empty string. Older records lack some fields and an undated
 * deadline stores null, and an input given null or undefined as its value
 * silently stops being controlled by React.
 */
const withBlanks = (record, keys) => ({
  ...record,
  ...Object.fromEntries(keys.map((k) => [k, record[k] ?? ''])),
});

/**
 * Push something into the class group chat.
 *
 * The CR has just typed this out once. Retyping it in WhatsApp is where the
 * wording drifts, the date gets transposed, and half the class ends up working
 * from a different deadline to the other half.
 */
function ShareButton({ text, label }) {
  const toast = useToast();

  const go = async () => {
    const result = await shareText(text);
    if (result === 'copied') toast.success('Copied. Paste it into the class group.');
    else if (result === 'failed') toast.error('Could not share or copy that. Select the text and copy it by hand.');
    // 'shared' needs no toast: the share sheet was the feedback.
  };

  return (
    <button className="btn-icon btn-icon-sm" onClick={go} aria-label={label} title={label}>
      {shareSupported() ? <Share2 size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
    </button>
  );
}

/** Turns whatever the write helper returned into the right toast. */
function useCommitToast() {
  const toast = useToast();
  return (result, successMessage) => {
    if (!result || result.ok === false) {
      // The server never says which check failed, so the next best thing is to
      // name the handful of things that actually cause this in practice.
      const message = result?.error?.code === 'permission-denied'
        ? 'That was refused. Check the subject still exists, that any link is a Google Drive or Classroom address, and that you still have manage access.'
        : friendlyError(result?.error);
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
    { value: 'deadlines', label: 'Deadlines', icon: CalendarClock },
    { value: 'notices', label: 'Notices', icon: Megaphone },
    { value: 'exams', label: 'Exams', icon: FileText },
    { value: 'subjects', label: 'Subjects', icon: BookOpen },
    { value: 'timetable', label: 'Timetable', icon: CalendarDays },
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
        {tab === 'notices' && <NoticesTab />}
        {tab === 'exams' && <ExamsTab />}
        {tab === 'subjects' && <SubjectsTab />}
        {tab === 'timetable' && <TimetableTab />}
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

  // A deadline whose date has not been announced yet is still ahead of the
  // class, not behind it, so it belongs at the top of Upcoming.
  const upcoming = globalTasks.filter((t) => !t.dueDate || t.dueDate >= todayIso());
  const past = globalTasks.filter((t) => t.dueDate && t.dueDate < todayIso()).reverse();

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
          {task.dueDate ? (
            <span className="nums">
              {format(new Date(`${task.dueDate}T00:00:00`), 'EEE, MMM d')}
              {task.dueTime ? ` · ${prettyTime(task.dueTime)}` : ''}
            </span>
          ) : (
            <span className="badge badge-warning">
              <CalendarClock size={10} aria-hidden="true" /> Date not announced yet
            </span>
          )}
        </div>
        {task.note && <p className="muted small" style={{ marginTop: 6 }}>{task.note}</p>}
      </div>
      <ShareButton
        text={deadlineShareText(task, subjects)}
        label={`Share "${task.title}" with the class group`}
      />
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
  const [form, setForm] = useState(() => withBlanks(task, ['dueDate', 'dueTime', 'note']));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  // The date is optional on purpose: a teacher often announces an assignment
  // weeks before fixing when it is actually due, and the class needs to know
  // about it from the moment it is mentioned.
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
              {typeOptions(form.type).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>

        <div className="field-grid">
          <Field
            label="Due date" error={show('dueDate')}
            hint={dueDateHint(form.dueDate) || 'Leave empty if it has not been announced.'}
          >
            <input type="date" value={form.dueDate} onChange={set('dueDate')} onBlur={() => setTouched(true)} />
          </Field>
          <Field label="Due time" error={show('dueTime')} hint="Optional, for a submission cut-off.">
            <input type="time" value={form.dueTime} onChange={set('dueTime')} />
          </Field>
        </div>

        {!form.dueDate && (
          <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6, marginTop: -4 }}>
            <CalendarClock size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
            With no date, the class sees this as &ldquo;Date not announced yet&rdquo; and gets no
            countdown or reminder. Come back and add the date once you have it.
          </p>
        )}

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

/* ══ Notices ═════════════════════════════════════════════════════════════════ */

/**
 * Everything the class needs to hear that is not a deadline: bring a
 * calculator, the lab report format changed, Friday's class is in the other
 * block. This is the stuff that currently scrolls away in a WhatsApp group
 * twenty minutes after it is posted.
 *
 * Every notice carries an expiry date, and the form pushes hard for one. A
 * board nobody clears becomes wallpaper, and then the notice that actually
 * matters gets read as wallpaper too.
 */
const blankAnnouncement = () => ({ title: '', body: '', until: '' });

function NoticesTab() {
  const { announcements, saveAnnouncement, deleteAnnouncement } = useClassData();
  const report = useCommitToast();
  const [editing, setEditing] = useState(null);

  const live = announcements.filter(isLive);
  const expired = announcements.filter((a) => !isLive(a));

  const remove = async (announcement) => {
    report(await deleteAnnouncement(announcement.id), 'Notice taken down.');
  };

  return (
    <div className="stack">
      <button className="btn btn-primary btn-block" onClick={() => setEditing(blankAnnouncement())}>
        <Plus size={18} aria-hidden="true" /> Post a notice
      </button>

      <section className="section" style={{ marginTop: 'var(--s2)' }}>
        <div className="section-head">
          <h2 className="section-title">Showing now</h2>
          <span className="muted small">{live.length}</span>
        </div>
        {live.length === 0 ? (
          <div className="card">
            <EmptyState icon={Megaphone} title="Nothing posted">
              Anything you post here sits on every classmate&rsquo;s dashboard until the
              date you set. Use it for what does not belong on a deadline.
            </EmptyState>
          </div>
        ) : (
          <div className="stack-sm">
            {live.map((a) => (
              <NoticeRow key={a.id} announcement={a} onEdit={setEditing} onDelete={remove} />
            ))}
          </div>
        )}
      </section>

      {expired.length > 0 && (
        <details className="card card-tight">
          <summary className="muted small" style={{ cursor: 'pointer' }}>
            Expired notices ({expired.length})
          </summary>
          <p className="field-hint" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
            Nobody sees these any more. Delete them, or change the date to put one back up.
          </p>
          <div className="stack-sm">
            {expired.map((a) => (
              <NoticeRow key={a.id} announcement={a} onEdit={setEditing} onDelete={remove} expired />
            ))}
          </div>
        </details>
      )}

      {editing && (
        <NoticeSheet
          announcement={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const isEdit = Boolean(editing.id);
            const payload = isEdit
              ? { ...data, createdAt: editing.createdAt, createdBy: editing.createdBy }
              : data;
            const ok = report(
              await saveAnnouncement(editing.id ?? null, payload),
              isEdit ? 'Notice updated.' : 'Notice posted to the class.'
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function NoticeRow({ announcement, onEdit, onDelete, expired }) {
  const left = announcement.until ? daysFromToday(announcement.until) : null;

  return (
    <div className="card card-tight row" style={{ alignItems: 'flex-start', opacity: expired ? 0.6 : 1 }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650 }}>{announcement.title}</div>
        {announcement.body && (
          <p className="muted small" style={{ marginTop: 4 }}>{announcement.body}</p>
        )}
        <div className="muted tiny row-wrap" style={{ marginTop: 6 }}>
          {announcement.until ? (
            <span className={`badge ${!expired && left <= 1 ? 'badge-warning' : ''}`}>
              {expired ? `Ended ${prettyDate(announcement.until)}`
                : left === 0 ? 'Last day today'
                : left === 1 ? 'Until tomorrow'
                : `Until ${prettyDate(announcement.until)}`}
            </span>
          ) : (
            <span className="badge">No end date</span>
          )}
        </div>
      </div>
      <ShareButton
        text={announcementShareText(announcement)}
        label={`Share "${announcement.title}" with the class group`}
      />
      <button
        className="btn-icon btn-icon-sm"
        onClick={() => onEdit(announcement)}
        aria-label={`Edit ${announcement.title}`}
      >
        <Pencil size={15} aria-hidden="true" />
      </button>
      <ConfirmButton onConfirm={() => onDelete(announcement)} label={`Delete ${announcement.title}`}>
        <Trash2 size={15} aria-hidden="true" />
      </ConfirmButton>
    </div>
  );
}

function NoticeSheet({ announcement, onClose, onSave }) {
  const [form, setForm] = useState(() => withBlanks(announcement, ['body', 'until']));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = vAnnouncement(form);
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    await onSave({
      title: clean(form.title),
      body: clean(form.body),
      until: form.until || '',
    });
    setSaving(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={announcement.id ? 'Edit notice' : 'Post a notice'}
      subtitle="Sits on every classmate's dashboard until it expires."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
            {saving ? 'Saving…' : announcement.id ? 'Save changes' : 'Post it'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <Field
          label="What do they need to know" required error={show('title')}
          hint="One sentence. This is the part they will actually read."
          counter={{ value: clean(form.title).length, max: 120 }}
        >
          <input
            value={form.title} onChange={set('title')} onBlur={() => setTouched(true)}
            placeholder="Bring your own calculator to Wednesday's lab"
            maxLength={120}
          />
        </Field>

        <Field
          label="Details" error={show('body')}
          hint="Optional. Anything that does not fit in the line above."
          counter={{ value: clean(form.body).length, max: LIMITS.note.max }}
        >
          <textarea value={form.body} onChange={set('body')} maxLength={LIMITS.note.max} rows={3} />
        </Field>

        <Field
          label="Take it down after" error={show('until')}
          hint={untilHint(form.until)}
        >
          <input type="date" value={form.until} onChange={set('until')} min={todayIso()} />
        </Field>

        {!form.until && (
          <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6, marginTop: -4 }}>
            <Info size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
            With no date this stays up until you delete it. A dashboard of notices
            nobody cleared stops being read, including the one that matters, so set
            a date whenever you can.
          </p>
        )}
      </form>
    </Sheet>
  );
}

function untilHint(until) {
  if (!until) return 'Optional, but strongly recommended.';
  const left = daysFromToday(until);
  if (left === 0) return 'Shows today, then disappears by itself.';
  if (left === 1) return 'Shows today and tomorrow.';
  if (left > 0) return `Shows for the next ${left} days, then disappears by itself.`;
  return null;
}

/* ══ Exams ═══════════════════════════════════════════════════════════════════ */

/**
 * The date sheet, and the switch that puts it in front of the timetable.
 *
 * Exams are kept apart from deadlines on purpose. A deadline is something a
 * student works at and hands in; an exam is a room, an hour and a seat, and
 * during the sessionals or the finals it is the only schedule that is true —
 * the weekly timetable is actively misleading, because those classes are not
 * running. So this tab publishes the papers AND owns the switch that suspends
 * the timetable, since publishing one without the other is how half a class
 * ends up in an empty lecture hall on the morning of a final.
 */
const blankExam = (subjects) => ({
  code: Object.keys(subjects)[0] || '',
  kind: 'Mid',
  date: '', start: '09:00', end: '10:30',
  room: '', seat: '', note: '',
});

function ExamsTab() {
  const { subjects, exams, examMode, saveExam, deleteExam, usingDefaults } = useClassData();
  const report = useCommitToast();
  const [editing, setEditing] = useState(null);

  const ahead = upcomingExams(exams);
  const sat = pastExams(exams);

  const remove = async (exam) => {
    report(await deleteExam(exam.id), 'Taken off the date sheet.');
  };

  return (
    <div className="stack">
      {/* Keyed on the saved settings: the form copies them once when it
          mounts, so on a cold open straight to this tab it showed "off" from
          before the real settings arrived, and saving would have switched
          exams off for the whole class. It also picks up another CR's change. */}
      <ExamModeCard
        key={[examMode.active, examMode.label, examMode.from, examMode.to].join('|')}
        config={examMode}
        examCount={ahead.length}
      />

      <hr className="divider" style={{ marginTop: 'var(--s2)' }} />

      <div className="section-head" style={{ marginTop: 'var(--s2)', marginBottom: 0 }}>
        <h2 className="section-title">The date sheet</h2>
      </div>
      <p className="field-hint" style={{ marginTop: -4 }}>
        One entry per paper. Room and seat are what people actually come here for,
        so put them in as soon as they are up, even if the rest is provisional.
      </p>

      <button
        className="btn btn-primary btn-block"
        onClick={() => setEditing(blankExam(subjects))}
        disabled={usingDefaults}
      >
        <Plus size={18} aria-hidden="true" /> Add an exam
      </button>
      {usingDefaults && (
        <p className="field-hint">Publish the timetable first so an exam can be tied to a subject.</p>
      )}

      {ahead.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileText} title="No exams on the schedule">
            Everything you add here shows up on the class&rsquo;s dashboard with a
            countdown, and takes over the Classes screen once you switch exams on.
          </EmptyState>
        </div>
      ) : (
        <div className="stack-sm">
          {ahead.map((exam) => (
            <ExamRow
              key={exam.id}
              exam={exam}
              subjects={subjects}
              onEdit={setEditing}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {sat.length > 0 && (
        <details className="card card-tight">
          <summary className="muted small" style={{ cursor: 'pointer' }}>
            Already sat ({sat.length})
          </summary>
          <p className="field-hint" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
            Still on the class&rsquo;s screen, folded away. Delete them once a term.
          </p>
          <div className="stack-sm">
            {sat.slice(0, 20).map((exam) => (
              <ExamRow
                key={exam.id}
                exam={exam}
                subjects={subjects}
                onEdit={setEditing}
                onDelete={remove}
                past
              />
            ))}
          </div>
        </details>
      )}

      {editing && (
        <ExamSheet
          exam={editing}
          subjects={subjects}
          existing={exams}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const ok = report(
              await saveExam(editing.id ?? null, data),
              editing.id ? 'Date sheet updated for the class.' : 'Added to the class date sheet.'
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * The switch itself.
 *
 * It is a switch somebody throws, not something inferred from the exam dates,
 * because classes carry straight through the sessionals and stop for the
 * finals and no rule the app could invent gets that right every semester. The
 * dates only narrow when it applies, so it can be set up a fortnight ahead and
 * then starts and ends on its own — which matters, because the failure mode
 * here is a CR who forgets to switch it off and hides the timetable for a month.
 */
function ExamModeCard({ config, examCount }) {
  const { saveExamMode } = useClassData();
  const report = useCommitToast();
  const [form, setForm] = useState({
    active: Boolean(config.active),
    label: config.label || 'Mids',
    from: config.from || '',
    to: config.to || '',
  });
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = vExamMode(form);
  const show = (key) => (touched ? errors[key] : undefined);
  const liveNow = examModeActive(config);
  const span = examModeDates(form);

  const save = async () => {
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    const ok = report(
      await saveExamMode({
        active: Boolean(form.active),
        label: clean(form.label),
        from: form.from || '',
        to: form.to || '',
      }),
      form.active ? 'Exam schedule is now what the class sees.' : 'Back to the normal timetable.'
    );
    if (ok) setTouched(false);
    setSaving(false);
  };

  return (
    <div className="card stack">
      <div className="row-between">
        <div className="grow">
          <h2 className="section-title">Exam period</h2>
          <p className="muted small" style={{ marginTop: 2 }}>
            While this is on, the class sees the date sheet instead of the weekly
            timetable, and the dashboard counts down to their next paper.
          </p>
        </div>
        <span className={`badge ${liveNow ? 'badge-warning' : ''}`} style={{ flexShrink: 0 }}>
          {liveNow ? 'On now' : config.active ? 'Scheduled' : 'Off'}
        </span>
      </div>

      <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          style={{ width: 18, height: 18, minHeight: 0, accentColor: 'var(--accent)' }}
        />
        <span className="small">Classes are suspended for exams</span>
      </label>

      <Field label="What to call it" error={show('label')} hint="Shown at the top of their screen.">
        <input
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Mids"
          maxLength={60}
        />
      </Field>

      <div className="field-grid">
        <Field label="First day" error={show('from')} hint="Optional.">
          <input type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
        </Field>
        <Field label="Last day" error={show('to')} hint="It switches itself off after this.">
          <input type="date" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
        </Field>
      </div>

      {form.active && !form.to && (
        <p className="field-warn">
          <Info size={13} aria-hidden="true" />
          With no last day this stays on until you come back and turn it off, and the
          whole class has no timetable until you do. Set the date now while you know it.
        </p>
      )}

      {form.active && form.to && (
        <p className="field-hint">
          The class sees the date sheet{span ? ` ${span}` : ''}, then the timetable comes
          back by itself. {examCount} {examCount === 1 ? 'paper is' : 'papers are'} published.
        </p>
      )}

      <button className="btn btn-primary" onClick={save} disabled={saving} type="button">
        {saving ? 'Saving…' : 'Save exam period'}
      </button>
    </div>
  );
}

function ExamRow({ exam, subjects, onEdit, onDelete, past }) {
  const subject = subjects[exam.code];
  const countdown = examCountdown(exam);

  return (
    <div
      className="card card-tight card-accent row"
      style={{ '--stripe': subject?.color, alignItems: 'flex-start', opacity: past ? 0.6 : 1 }}
    >
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 650 }}>{exam.kind} · {subject?.short || exam.code}</div>
        <div className="muted tiny row-wrap nums" style={{ marginTop: 4, gap: 8 }}>
          <span>{prettyDate(exam.date)}</span>
          <span className="row" style={{ gap: 4 }}>
            <Clock size={11} aria-hidden="true" />{prettyTime(exam.start)}-{prettyTime(exam.end)}
          </span>
          <span className="row" style={{ gap: 4 }}><MapPin size={11} aria-hidden="true" />{exam.room}</span>
          {exam.seat && (
            <span className="row" style={{ gap: 4 }}><Armchair size={11} aria-hidden="true" />{exam.seat}</span>
          )}
        </div>
        {exam.note && <p className="muted small" style={{ marginTop: 6 }}>{exam.note}</p>}
        {!past && countdown && (
          <div className="row-wrap" style={{ marginTop: 6 }}>
            <span className={`badge ${countdown.tone}`}>{countdown.text}</span>
          </div>
        )}
      </div>
      <ShareButton
        text={examShareText(exam, subjects)}
        label={`Share this ${exam.kind} with the class group`}
      />
      <button className="btn-icon btn-icon-sm" onClick={() => onEdit(exam)} aria-label="Edit this exam">
        <Pencil size={15} aria-hidden="true" />
      </button>
      <ConfirmButton onConfirm={() => onDelete(exam)} label="Delete this exam">
        <Trash2 size={15} aria-hidden="true" />
      </ConfirmButton>
    </div>
  );
}

function ExamSheet({ exam, subjects, existing, onClose, onSave }) {
  const [form, setForm] = useState(() => withBlanks(exam, ['room', 'seat', 'note']));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = vExam({ ...form, id: exam.id }, existing);
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    await onSave({
      code: form.code,
      kind: form.kind,
      date: form.date,
      start: form.start,
      end: form.end,
      room: clean(form.room),
      seat: clean(form.seat),
      note: clean(form.note),
    });
    setSaving(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={exam.id ? 'Edit this exam' : 'Add an exam'}
      subtitle="Everyone sees the room, the hour and the countdown straight away."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
            {saving ? 'Saving…' : exam.id ? 'Save changes' : 'Publish it'}
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
          <Field label="Which exam" required error={show('kind')}>
            <select value={form.kind} onChange={set('kind')}>
              {EXAM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Date" required error={show('date')} hint={dueDateHint(form.date)}>
          <input type="date" value={form.date} onChange={set('date')} onBlur={() => setTouched(true)} />
        </Field>

        <div className="field-grid">
          <Field label="Starts" required error={show('start')}>
            <input type="time" value={form.start} onChange={set('start')} onBlur={() => setTouched(true)} step={300} />
          </Field>
          <Field label="Ends" required error={show('end')}>
            <input type="time" value={form.end} onChange={set('end')} onBlur={() => setTouched(true)} step={300} />
          </Field>
        </div>

        <div className="field-grid">
          <Field label="Room" required error={show('room')} hint="The only thing anyone checks in the corridor.">
            <input value={form.room} onChange={set('room')} onBlur={() => setTouched(true)} placeholder="E-1" maxLength={LIMITS.room.max} />
          </Field>
          <Field label="Seat" error={show('seat')} hint="Optional, if seats are numbered.">
            <input value={form.seat} onChange={set('seat')} placeholder="A-14" maxLength={24} />
          </Field>
        </div>

        <Field
          label="Note to the class" error={show('note')}
          hint="What to bring, what is on it, anything they will ask about."
          counter={{ value: clean(form.note).length, max: 140 }}
        >
          <input value={form.note} onChange={set('note')} placeholder="Chapters 1-4. Calculator allowed, no phones." maxLength={140} />
        </Field>

        <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6 }}>
          <Info size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          Nobody ticks an exam off. It counts down, it happens, and then it folds
          itself away on its own once the date has passed.
        </p>
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
  const [form, setForm] = useState(() => ({
    ...withBlanks(subject, ['teacher', 'driveLink', 'classroomLink']),
    code: subject.code || '',
  }));
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
      {/* One-off changes come first because they are the thing a CR opens this
          tab to do on any given week. The recurring pattern below it changes
          maybe twice a semester. */}
      <ChangesSection />

      <hr className="divider" style={{ marginTop: 'var(--s3)' }} />

      <div className="section-head" style={{ marginTop: 'var(--s2)' }}>
        <h2 className="section-title">The weekly pattern</h2>
      </div>
      <p className="field-hint" style={{ marginTop: -8 }}>
        What normally happens, every week. Change this only when the timetable
        itself changes, not for a single cancelled class.
      </p>

      <button className="btn btn-secondary btn-block" onClick={() => setEditing(blankSlot(subjects))}>
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
  const [form, setForm] = useState(() => withBlanks(slot, ['room', 'changeNote', 'changeUntil']));
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

/* ══ One-off class changes ═══════════════════════════════════════════════════ */

/**
 * The timetable says what normally happens. This says what happens instead, on
 * one named date.
 *
 * It is the most expensive thing the app could not previously tell anyone: a
 * student commutes in, sits for an hour, and the class was never on. A rolling
 * "room changed" note on the recurring slot cannot express it, because the
 * change belongs to a date, not to every Wednesday from now on.
 */
const CHANGE_KINDS = [
  { value: 'cancelled', label: 'Cancelled', icon: Ban, blurb: 'It is not happening that day.' },
  { value: 'moved', label: 'Moved', icon: ArrowRightLeft, blurb: 'Same class, different time or room.' },
  { value: 'extra', label: 'Extra class', icon: CalendarPlus, blurb: 'A make-up or additional session.' },
];

const blankChange = (subjects) => ({
  status: 'cancelled',
  date: todayIso(),
  slotId: '',
  code: Object.keys(subjects)[0] || '',
  start: '', end: '', room: '', type: 'Lecture',
  note: '',
});

function ChangesSection() {
  const {
    subjects, timetable, classChanges, saveClassChange, deleteClassChange, usingDefaults,
  } = useClassData();
  const report = useCommitToast();
  const [editing, setEditing] = useState(null);

  // Every change still ahead, however far. A date can be set up to a year out,
  // and a 45-day window here left anything further away in neither list, so
  // there was no way to edit or delete it until it came into range.
  const upcoming = upcomingChanges(classChanges, 366);
  const past = classChanges.filter(changeIsPast).reverse();

  const remove = async (change) => {
    report(await deleteClassChange(change.id), 'Change removed. The class is back to normal.');
  };

  return (
    <>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <h2 className="section-title">This week and beyond</h2>
      </div>
      <p className="field-hint" style={{ marginTop: -4 }}>
        Cancel a class, move it, or add an extra one, for a single date. It shows on
        everyone&rsquo;s dashboard from the moment you save it and clears itself once
        the date passes.
      </p>

      <button
        className="btn btn-primary btn-block"
        onClick={() => setEditing(blankChange(subjects))}
        disabled={usingDefaults || timetable.length === 0}
      >
        <CalendarX2 size={18} aria-hidden="true" /> Change a single class
      </button>

      {upcoming.length === 0 ? (
        <div className="card">
          <EmptyState icon={CalendarDays} title="Nothing changed">
            Every class is running as timetabled.
          </EmptyState>
        </div>
      ) : (
        <div className="stack-sm">
          {upcoming.map((change) => (
            <ChangeRow
              key={change.id}
              change={change}
              subjects={subjects}
              timetable={timetable}
              onEdit={setEditing}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details className="card card-tight">
          <summary className="muted small" style={{ cursor: 'pointer' }}>
            Changes that have passed ({past.length})
          </summary>
          <p className="field-hint" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
            Nobody sees these. Deleting them keeps this list readable.
          </p>
          <div className="stack-sm">
            {past.slice(0, 20).map((change) => (
              <ChangeRow
                key={change.id}
                change={change}
                subjects={subjects}
                timetable={timetable}
                onEdit={setEditing}
                onDelete={remove}
                past
              />
            ))}
          </div>
        </details>
      )}

      {editing && (
        <ChangeSheet
          change={editing}
          subjects={subjects}
          timetable={timetable}
          existing={classChanges}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const ok = report(
              await saveClassChange(editing.id ?? null, data),
              'The class has been told.'
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </>
  );
}

function ChangeRow({ change, subjects, timetable, onEdit, onDelete, past }) {
  const { headline, detail, tone } = describeChange(change, subjects, timetable);
  const away = daysFromToday(change.date);

  return (
    <div
      className="card card-tight card-accent row"
      style={{ '--stripe': subjects[change.code]?.color, alignItems: 'flex-start', opacity: past ? 0.6 : 1 }}
    >
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{headline}</div>
        {detail && <div className="muted tiny" style={{ marginTop: 3 }}>{detail}</div>}
        {change.note && <p className="muted small" style={{ marginTop: 5 }}>{change.note}</p>}
        <div className="row-wrap" style={{ marginTop: 6 }}>
          <span className={`badge badge-${tone}`}>
            {change.status === 'cancelled' ? 'Cancelled'
              : change.status === 'moved' ? 'Moved' : 'Extra class'}
          </span>
          {!past && (
            <span className="badge">
              {away === 0 ? 'Today' : away === 1 ? 'Tomorrow' : `In ${away} days`}
            </span>
          )}
        </div>
      </div>
      <ShareButton
        text={changeShareText(change, subjects, timetable)}
        label="Share this change with the class group"
      />
      <button className="btn-icon btn-icon-sm" onClick={() => onEdit(change)} aria-label="Edit this change">
        <Pencil size={15} aria-hidden="true" />
      </button>
      <ConfirmButton onConfirm={() => onDelete(change)} label="Delete this change">
        <Trash2 size={15} aria-hidden="true" />
      </ConfirmButton>
    </div>
  );
}

function ChangeSheet({ change, subjects, timetable, existing, onClose, onSave }) {
  const [form, setForm] = useState(() =>
    withBlanks(change, ['slotId', 'start', 'end', 'room', 'type', 'note']));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // Which classes are on that day, so a cancellation picks from reality rather
  // than from a free-text field the CR has to get right from memory.
  const scheduled = useMemo(
    () => (form.date ? classesOn(form.date, timetable, []) : []),
    [form.date, timetable]
  );

  const errors = vClassChange({ ...form, id: change.id }, existing);
  const show = (key) => (touched ? errors[key] : undefined);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const needsSlot = form.status === 'cancelled' || form.status === 'moved';
  const needsTime = form.status === 'moved' || form.status === 'extra';

  /**
   * Switching kind rewrites the fields that kind needs, because carrying a
   * half-filled "moved" over to "cancelled" is how a slotId ends up attached to
   * an extra class that has no slot.
   */
  const chooseKind = (status) => setForm((f) => {
    // A cancellation is saved with type '', which is not an option in the type
    // picker: switching an existing one to "extra" left a select showing
    // "Lecture" over a value the validator kept rejecting.
    if (status === 'extra') {
      return {
        ...f, status, slotId: '',
        start: f.start || '', end: f.end || '', room: f.room || '',
        type: SLOT_TYPES.includes(f.type) ? f.type : 'Lecture',
      };
    }
    // Moving a class already picked while on "cancelled" starts from where it
    // normally is, the same as picking it fresh would.
    if (status === 'moved' && f.slotId) {
      const slot = scheduled.find((s) => s.id === f.slotId);
      if (slot) {
        return {
          ...f, status,
          start: f.start || slot.start,
          end: f.end || slot.end,
          room: f.room || slot.room,
          type: SLOT_TYPES.includes(f.type) ? f.type : slot.type,
        };
      }
    }
    return { ...f, status };
  });

  /** Picking the class to change prefills everything from the real slot. */
  const chooseSlot = (slotId) => setForm((f) => {
    const slot = scheduled.find((s) => s.id === slotId);
    if (!slot) return { ...f, slotId };
    return {
      ...f,
      slotId,
      code: slot.code,
      start: f.status === 'moved' ? slot.start : f.start,
      end: f.status === 'moved' ? slot.end : f.end,
      room: f.status === 'moved' ? slot.room : f.room,
      type: slot.type,
    };
  });

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (hasErrors(errors)) return;
    setSaving(true);
    // A cancelled class has no replacement time or place, and the rules reject
    // one that pretends otherwise.
    const blank = form.status === 'cancelled';
    await onSave({
      date: form.date,
      slotId: form.status === 'extra' ? null : form.slotId,
      code: form.code,
      status: form.status,
      start: blank ? '' : form.start,
      end: blank ? '' : form.end,
      room: blank ? '' : clean(form.room),
      type: blank ? '' : form.type,
      note: clean(form.note),
    });
    setSaving(false);
  };

  const kind = CHANGE_KINDS.find((k) => k.value === form.status);

  return (
    <Sheet
      open
      onClose={onClose}
      title={change.id ? 'Edit this change' : 'Change a single class'}
      subtitle="For one date only. The weekly timetable stays as it is."
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving} type="button">
            {saving ? 'Saving…' : change.id ? 'Save changes' : 'Tell the class'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <div>
          <p className="field-label" style={{ marginBottom: 8 }}>What is happening</p>
          <div className="tabs" role="group" aria-label="Kind of change">
            {CHANGE_KINDS.map(({ value, label, icon: Icon }) => (
              <button
                key={value} type="button" role="tab"
                aria-selected={form.status === value}
                onClick={() => chooseKind(value)}
              >
                <Icon size={14} aria-hidden="true" />{label}
              </button>
            ))}
          </div>
          <p className="field-hint" style={{ marginTop: 6 }}>{kind?.blurb}</p>
        </div>

        <Field
          label="Which date" required error={show('date')}
          hint={dateHint(form.date)}
        >
          <input
            type="date" value={form.date} min={todayIso()}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, slotId: '' }))}
            onBlur={() => setTouched(true)}
          />
        </Field>

        {needsSlot && (
          <Field
            label="Which class" required error={show('slotId')}
            hint={scheduled.length === 0 ? undefined : 'Only the classes timetabled for that day.'}
          >
            <select value={form.slotId} onChange={(e) => chooseSlot(e.target.value)}>
              <option value="">Pick one…</option>
              {scheduled.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {subjects[slot.code]?.short || slot.code} · {prettyTime(slot.start)} · {slot.room}
                </option>
              ))}
            </select>
          </Field>
        )}

        {needsSlot && form.date && scheduled.length === 0 && (
          <p className="field-warn">
            <Info size={13} aria-hidden="true" />
            Nothing is timetabled for that day. Pick another date, or add this as an
            extra class instead.
          </p>
        )}

        {form.status === 'extra' && (
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
        )}

        {needsTime && (
          <>
            <div className="field-grid">
              <Field label={form.status === 'moved' ? 'New start' : 'Starts'} required error={show('start')}>
                <input type="time" value={form.start} onChange={set('start')} onBlur={() => setTouched(true)} step={300} />
              </Field>
              <Field label={form.status === 'moved' ? 'New end' : 'Ends'} required error={show('end')}>
                <input type="time" value={form.end} onChange={set('end')} onBlur={() => setTouched(true)} step={300} />
              </Field>
            </div>
            <Field
              label={form.status === 'moved' ? 'New room' : 'Room'} required error={show('room')}
              hint="Where it actually happens that day."
            >
              <input value={form.room} onChange={set('room')} onBlur={() => setTouched(true)} placeholder="D-109" maxLength={LIMITS.room.max} />
            </Field>
          </>
        )}

        <Field
          label="Note to the class" error={show('note')}
          hint="Optional. Why, or anything they should bring."
          counter={{ value: clean(form.note).length, max: 140 }}
        >
          <input
            value={form.note} onChange={set('note')}
            placeholder="Teacher is away at a conference"
            maxLength={140}
          />
        </Field>

        <p className="field-hint row" style={{ alignItems: 'flex-start', gap: 6 }}>
          <Info size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
          This changes one date only. To change the timetable itself from now on,
          edit the weekly slot below instead.
        </p>
      </form>
    </Sheet>
  );
}

function dateHint(date) {
  const away = daysFromToday(date);
  if (away == null) return null;
  if (away === 0) return 'Today. Anyone already on their way will not see this in time.';
  if (away === 1) return 'Tomorrow.';
  if (away < 0) return 'That date has already passed.';
  return `In ${away} days.`;
}

/* ══ People ══════════════════════════════════════════════════════════════════ */

/**
 * Who is in the class, and what each of them can do.
 *
 * This used to be an approval queue. A student signed in, was shown their
 * Firebase user ID in a code block, copied it into a message, and waited for an
 * admin to paste it into a form here — a round trip that decided nothing,
 * because anyone who could sign in was going to be let in. Signing in now makes
 * you a student by itself (see firestore.rules), so this screen is no longer a
 * gate. It is a directory with two decisions left in it, and both are real:
 * who is the class representative, and who should not be here at all.
 *
 * Removing someone sets them to 'blocked' rather than deleting the record,
 * because self-enrolment would immediately let a deleted person back in. A
 * blocked document is the thing standing in their way.
 */
const ROLE_CHOICES = [
  { value: 'student', label: 'Student', blurb: 'Sees everything, changes nothing.' },
  { value: 'cr', label: 'Class rep', blurb: 'Can edit deadlines, notices, exams and the timetable.' },
  { value: 'blocked', label: 'No access', blurb: 'Signed up, then removed. Cannot get back in.' },
];

function PeopleTab() {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => onSnapshot(
    collection(db, 'roles'),
    (snap) => { setRoles(snap.docs.map((d) => ({ uid: d.id, ...d.data() }))); setError(null); },
    (err) => setError(err)
  ), []);

  // Managers first, then blocked last: the two ends of the list are the two
  // things an admin came here to look at.
  const order = { admin: 0, cr: 1, student: 2, blocked: 3 };
  const needle = clean(search).toLowerCase();
  const visible = roles
    .filter((r) => !needle || String(r.email || '').toLowerCase().includes(needle))
    .sort((a, b) =>
      (order[a.role] ?? 9) - (order[b.role] ?? 9)
      || String(a.email || '').localeCompare(String(b.email || '')));

  const counts = {
    cr: roles.filter((r) => r.role === 'cr').length,
    students: roles.filter((r) => r.role === 'student').length,
    blocked: roles.filter((r) => r.role === 'blocked').length,
  };

  return (
    <div className="stack">
      <div className="alert alert-accent">
        <ShieldCheck size={16} aria-hidden="true" />
        <div className="alert-body">
          <strong>How access works.</strong> Anyone who signs in joins as a student,
          so nobody waits on you to be let in. You decide two things: who is a class
          representative, and who is removed. The admin role itself can only be
          granted from the Firebase console, so nobody can promote themselves from
          inside the app even with the developer tools open.
        </div>
      </div>

      {counts.cr === 0 && (
        <div className="alert alert-warning">
          <Info size={16} aria-hidden="true" />
          <span className="alert-body">
            No class representative yet. Until you appoint one, you are the only
            person who can publish a deadline or change the timetable.
          </span>
        </div>
      )}

      <section className="section" style={{ marginTop: 'var(--s2)' }}>
        <div className="section-head">
          <h2 className="section-title">In this class</h2>
          <span className="muted small">
            {counts.students + counts.cr} active{counts.blocked > 0 ? ` · ${counts.blocked} removed` : ''}
          </span>
        </div>

        {roles.length > 8 && (
          <div className="row" style={{ gap: 8, marginBottom: 'var(--s3)' }}>
            <Search size={16} aria-hidden="true" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
            <input
              className="grow"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find by email"
              aria-label="Find a classmate by email"
            />
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            <Info size={15} aria-hidden="true" />{friendlyError(error)}
          </div>
        )}

        {!error && roles.length === 0 && (
          <div className="card">
            <EmptyState icon={Users} title="Nobody has signed in yet">
              The first classmate to open the app appears here by themselves.
            </EmptyState>
          </div>
        )}

        {!error && roles.length > 0 && visible.length === 0 && (
          <p className="field-hint">No email matches &ldquo;{clean(search)}&rdquo;.</p>
        )}

        <div className="stack-sm">
          {visible.map((r) => <RoleRow key={r.uid} role={r} isSelf={r.uid === user.uid} />)}
        </div>
      </section>
    </div>
  );
}

function RoleRow({ role, isSelf }) {
  const { user } = useAuth();
  const report = useCommitToast();
  const [busy, setBusy] = useState(false);

  // An admin is not editable from here by design, and neither is the person
  // doing the editing — that is what makes locking yourself out impossible.
  const fixed = role.role === 'admin' || isSelf;
  const blocked = role.role === 'blocked';

  const change = async (next) => {
    if (next === role.role) return;
    setBusy(true);
    try {
      // settle(): offline, the bare promise never resolves and the row would
      // sit on "Saving…" until the connection came back.
      const { queued } = await settle(setDoc(doc(db, 'roles', role.uid), {
        role: next,
        // Resent unchanged: the rules require an email on every write, and the
        // one already on the document is the one they signed in with.
        email: role.email || '',
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }));
      const said = {
        cr: `${role.email || 'They'} can now edit class content.`,
        student: `${role.email || 'They'} is back to a normal student.`,
        blocked: `${role.email || 'They'} has been removed from the class.`,
      };
      report({ ok: true, queued }, said[next]);
    } catch (error) {
      report({ ok: false, error });
    }
    setBusy(false);
  };

  return (
    <div className="card card-tight" style={{ opacity: blocked ? 0.62 : 1 }}>
      <div className="row">
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 600 }}>
            {role.email || '(no email recorded)'}
          </div>
          <div className="muted tiny truncate">{role.uid}</div>
        </div>
        <span
          className={`badge ${role.role === 'admin' ? 'badge-danger'
            : role.role === 'cr' ? 'badge-accent'
            : blocked ? 'badge-warning' : ''}`}
          style={{ flexShrink: 0 }}
        >
          {blocked && <UserX size={10} aria-hidden="true" />}
          {role.role === 'admin' ? 'admin'
            : role.role === 'cr' ? 'class rep'
            : blocked ? 'removed' : 'student'}
        </span>
      </div>

      {fixed ? (
        <p className="field-hint" style={{ marginTop: 'var(--s2)' }}>
          {isSelf
            ? 'This is you. Change your own role from the Firebase console, so an accidental tap here cannot lock the class out.'
            : 'Admins are set in the Firebase console only.'}
        </p>
      ) : (
        <div style={{ marginTop: 'var(--s3)' }}>
          <label className="sr-only" htmlFor={`role-${role.uid}`}>
            Access for {role.email || role.uid}
          </label>
          <select
            id={`role-${role.uid}`}
            value={role.role}
            disabled={busy}
            onChange={(e) => change(e.target.value)}
          >
            {ROLE_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <p className="field-hint" style={{ marginTop: 6 }}>
            {busy ? 'Saving…' : ROLE_CHOICES.find((c) => c.value === role.role)?.blurb}
          </p>
        </div>
      )}
    </div>
  );
}
