import React, { useMemo, useState } from 'react';
import { format, parse, getDay } from 'date-fns';
import {
  Clock, MapPin, User, Wifi, ExternalLink, FolderOpen, GraduationCap,
  CalendarDays, BookOpen, Info, ChevronRight, CalendarOff,
  Ban, ArrowRightLeft, CalendarPlus,
} from 'lucide-react';
import { useClassData } from '../lib/classDataContext';
import { useAllTasks, dueBadge } from '../lib/useTasks';
import { safeLink, todayIso, daysFromToday } from '../lib/validate';
import { upcomingChanges, describeChange } from '../lib/schedule';
import { Sheet, EmptyState, Tabs, CardSkeleton } from '../components/ui';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmt = (t) => format(parse(t, 'HH:mm', new Date()), 'h:mm a');

/** "Tuesday", "Tuesday and Friday", "Tuesday, Friday and Sunday". */
function listDays(days) {
  const names = days.map((d) => DAYS[d]);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function Timetable() {
  const [tab, setTab] = useState('week');
  const [openSubject, setOpenSubject] = useState(null);
  const { subjects, loading } = useClassData();

  return (
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">Fall 2026 · FA25-ELC-C</p>
        <h1 className="page-title">Your week</h1>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'week', label: 'Timetable', icon: CalendarDays },
          { value: 'subjects', label: 'Subjects', icon: BookOpen },
        ]}
      />

      <div style={{ marginTop: 'var(--s4)' }}>
        {loading ? <div className="stack"><CardSkeleton /><CardSkeleton /></div>
          : tab === 'week'
            ? <WeekView onOpenSubject={setOpenSubject} />
            : <SubjectsView onOpenSubject={setOpenSubject} />}
      </div>

      {openSubject && (
        <SubjectSheet
          code={openSubject}
          subject={subjects[openSubject]}
          onClose={() => setOpenSubject(null)}
        />
      )}
    </div>
  );
}

/* ── week view ─────────────────────────────────────────────────────────────── */

function WeekView({ onOpenSubject }) {
  const { subjects, timetable, classChanges } = useClassData();
  const today = getDay(new Date());
  const changes = upcomingChanges(classChanges, 21);

  const byDay = useMemo(() => {
    const groups = {};
    for (const slot of timetable) (groups[slot.day] ??= []).push(slot);
    return groups;
  }, [timetable]);

  const teachingDays = Object.keys(byDay).map(Number);
  const freeDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !teachingDays.includes(d));
  const onlineOnly = Object.entries(subjects).filter(([code, s]) => s.online && !timetable.some((t) => t.code === code));

  if (timetable.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={CalendarOff} title="No timetable published">
          Your class representative has not published the schedule yet.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* The grid below is the pattern. This is where it is not true. It goes
          first because a cancelled class is the one thing on this page that
          changes what a student does today. */}
      {changes.length > 0 && (
        <section className="card card-flush" aria-label="Changes to the normal timetable">
          <div className="row-between" style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)' }}>
            <h2 className="section-title">Not running as usual</h2>
            <span className="badge badge-warning">{changes.length}</span>
          </div>
          <div className="list">
            {changes.map((change) => {
              const { headline, detail, tone } = describeChange(change, subjects, timetable);
              const Icon = change.status === 'cancelled' ? Ban
                : change.status === 'moved' ? ArrowRightLeft : CalendarPlus;
              const away = daysFromToday(change.date);
              return (
                <div key={change.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <Icon size={16} aria-hidden="true" style={{ color: `var(--${tone})`, flexShrink: 0, marginTop: 2 }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 560 }}>{headline}</div>
                    {(change.note || detail) && (
                      <div className="muted tiny" style={{ marginTop: 2 }}>{change.note || detail}</div>
                    )}
                  </div>
                  <span className="badge" style={{ flexShrink: 0 }}>
                    {away === 0 ? 'Today' : away === 1 ? 'Tomorrow' : `${away}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {DAYS.map((dayName, day) => {
        const slots = byDay[day];
        if (!slots?.length) return null;
        const isToday = day === today;
        return (
          <section key={day}>
            <div className="section-head">
              <h2 className="section-title" style={{ color: isToday ? 'var(--accent)' : undefined }}>
                {dayName}
                {isToday && <span className="badge badge-success" style={{ marginLeft: 8 }}>Today</span>}
              </h2>
              <span className="muted small nums">{fmt(slots[0].start)} - {fmt(slots[slots.length - 1].end)}</span>
            </div>
            <div className="stack-sm">
              {slots.map((slot) => (
                <SlotCard key={slot.id} slot={slot} subject={subjects[slot.code]} onOpenSubject={onOpenSubject} />
              ))}
            </div>
          </section>
        );
      })}

      {onlineOnly.map(([code, s]) => (
        <button
          key={code}
          className="card card-accent"
          style={{ '--stripe': s.color }}
          onClick={() => onOpenSubject(code)}
        >
          <div className="row-between">
            <h3>{s.title}</h3>
            <span className="badge badge-accent"><Wifi size={11} aria-hidden="true" /> Online</span>
          </div>
          <p className="muted small" style={{ marginTop: 4 }}>
            {code}{s.teacher ? ` · ${s.teacher}` : ''} · no fixed room, check the course links
          </p>
        </button>
      ))}

      {freeDays.length > 0 && (
        <p className="muted small center" style={{ marginTop: 'var(--s3)' }}>
          No classes on {listDays(freeDays)}. Good days to catch up.
        </p>
      )}
    </div>
  );
}

function SlotCard({ slot, subject, onOpenSubject }) {
  const changeLive = slot.changeNote && (!slot.changeUntil || slot.changeUntil >= todayIso());

  return (
    <button
      className="card card-accent"
      style={{ '--stripe': subject?.color }}
      onClick={() => onOpenSubject(slot.code)}
      aria-label={`${subject?.title || slot.code}, ${fmt(slot.start)} in ${slot.room}. Open course links.`}
    >
      <div className="row-between" style={{ marginBottom: 6 }}>
        <h3 className="truncate">{subject?.title || slot.code}</h3>
        <span className={`badge ${slot.type === 'LAB' ? 'badge-warning' : ''}`}>{slot.type}</span>
      </div>

      <div className="muted tiny row-wrap" style={{ gap: 6, marginBottom: 'var(--s3)' }}>
        <span>{slot.code}</span>
        {subject?.teacher && <><span aria-hidden="true">·</span><User size={11} aria-hidden="true" /><span>{subject.teacher}</span></>}
      </div>

      <div className="row-between">
        <span className="icon-row nums"><Clock size={14} aria-hidden="true" />{fmt(slot.start)} - {fmt(slot.end)}</span>
        <span className={`badge ${changeLive ? 'badge-warning' : ''}`}>
          <MapPin size={11} aria-hidden="true" />{slot.room}
        </span>
      </div>

      {changeLive && (
        <div className="alert alert-warning" style={{ marginTop: 'var(--s3)', padding: 'var(--s2) var(--s3)' }}>
          <Info size={14} aria-hidden="true" />
          <span className="small">
            {slot.changeNote}
            {slot.changeUntil && ` · until ${format(new Date(`${slot.changeUntil}T00:00:00`), 'MMM d')}`}
          </span>
        </div>
      )}
    </button>
  );
}

/* ── subjects view ─────────────────────────────────────────────────────────── */

function SubjectsView({ onOpenSubject }) {
  const { subjects, timetable } = useClassData();

  return (
    <div className="stack-sm">
      <p className="muted small" style={{ marginBottom: 'var(--s2)' }}>
        Tap a subject for its course material, Classroom and upcoming work.
      </p>
      {Object.entries(subjects).map(([code, s]) => {
        const sessions = timetable.filter((t) => t.code === code).length;
        const hasLinks = Boolean(safeLink(s.driveLink, 'drive') || safeLink(s.classroomLink, 'classroom'));
        return (
          <button
            key={code}
            className="card card-tight card-accent row"
            style={{ '--stripe': s.color }}
            onClick={() => onOpenSubject(code)}
          >
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontWeight: 650 }}>{s.title}</div>
              <div className="muted tiny" style={{ marginTop: 3 }}>
                {code} · {s.credits} credit{s.credits === 1 ? '' : 's'}
                {sessions > 0 && ` · ${sessions}×/week`}
                {s.online && ' · online'}
              </div>
            </div>
            {hasLinks && <span className="badge badge-success"><FolderOpen size={11} aria-hidden="true" /> Links</span>}
            <ChevronRight size={17} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          </button>
        );
      })}
    </div>
  );
}

/* ── subject detail ────────────────────────────────────────────────────────── */

function SubjectSheet({ code, subject, onClose }) {
  const { timetable } = useClassData();
  const { tasks } = useAllTasks();

  if (!subject) return null;

  const drive = safeLink(subject.driveLink, 'drive');
  const classroom = safeLink(subject.classroomLink, 'classroom');
  const slots = timetable.filter((t) => t.code === code);
  const upcoming = tasks.filter((t) => t.subject === code && !t.completed).slice(0, 5);

  return (
    <Sheet open onClose={onClose} title={subject.title} subtitle={`${code} · ${subject.credits} credit hours`}>
      <div className="stack">
        {subject.teacher && (
          <div className="icon-row"><User size={15} aria-hidden="true" />{subject.teacher}</div>
        )}

        {/* Not every course has a Drive folder or a Classroom, and plenty
            never will. An empty section with a note telling the student to go
            and ask someone is a chore the app invented; when there is nothing
            to link to, there is simply nothing here. */}
        {(drive || classroom) && (
          <div>
            <p className="field-label" style={{ marginBottom: 8 }}>Course links</p>
            <div className="stack-sm">
              {drive && (
                <a href={drive} target="_blank" rel="noreferrer noopener" className="btn btn-secondary btn-block">
                  <FolderOpen size={16} aria-hidden="true" />
                  Course material on Drive
                  <ExternalLink size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
                </a>
              )}
              {classroom && (
                <a href={classroom} target="_blank" rel="noreferrer noopener" className="btn btn-secondary btn-block">
                  <GraduationCap size={16} aria-hidden="true" />
                  Google Classroom
                  <ExternalLink size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
                </a>
              )}
            </div>
          </div>
        )}

        {slots.length > 0 && (
          <div>
            <p className="field-label" style={{ marginBottom: 8 }}>When it meets</p>
            <div className="card card-flush list">
              {slots.map((slot) => (
                <div key={slot.id} className="list-row" style={{ minHeight: 46 }}>
                  <span className="grow small">{DAYS[slot.day]}</span>
                  <span className="muted small nums">{fmt(slot.start)}-{fmt(slot.end)}</span>
                  <span className="badge">{slot.room}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="field-label" style={{ marginBottom: 8 }}>Coming up</p>
          {upcoming.length === 0 ? (
            <p className="field-hint">Nothing pending for this subject.</p>
          ) : (
            <div className="stack-sm">
              {upcoming.map((t) => {
                const due = dueBadge(t);
                return (
                  <div key={t.id} className="card card-tight row">
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate small" style={{ fontWeight: 600 }}>{t.title}</div>
                      <div className="muted tiny">{t.type}</div>
                    </div>
                    {due && <span className={`badge ${due.tone}`}>{due.text}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
