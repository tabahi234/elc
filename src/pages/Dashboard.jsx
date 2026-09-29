import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parse, isAfter, isBefore } from 'date-fns';
import {
  Clock, MapPin, User, ChevronRight, AlertTriangle, Flame, GraduationCap,
  LogOut, Bell, BellOff, Sun, Moon, Monitor, Info, CalendarCheck, PartyPopper,
  Megaphone, ArrowRightLeft, CalendarPlus, Coffee, FileText, Armchair,
  ExternalLink, Building2, CheckCheck, FolderOpen,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useClassData } from '../lib/classDataContext';
import { useAllTasks, dueBadge } from '../lib/useTasks';
import { useGradeBook, useCredits, semesterGpa } from '../lib/progress';
import { useStudyLog, weekMinutes, streakDays } from '../lib/study';
import {
  buildAlerts, alertTone, useDeadlineNotifications,
  notificationPermission, requestNotifications, notificationsSupported,
} from '../lib/alerts';
import { todayIso, safeLink, isEventType } from '../lib/validate';
import {
  classesOn, nextClass as findNextClass, remainingOn, todayShape,
} from '../lib/schedule';
import { liveAnnouncements } from '../lib/announcements';
import {
  examModeActive, examModeDates, examsOn, nextExam as findNextExam,
  upcomingExams, examCountdown,
} from '../lib/exams';
import { restDayAdvice } from '../lib/restday';
import { CAMPUS_LINKS, EXTERNAL_LINK_PROPS } from '../lib/links';
import { useToast } from '../lib/toastContext';
import { Sheet, EmptyState, CardSkeleton } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const [now, setNow] = useState(new Date());
  const { user } = useAuth();
  const { subjects, timetable, classChanges, announcements, exams, examMode, loading } = useClassData();
  const { tasks } = useAllTasks();
  const [book] = useGradeBook();
  const [credits] = useCredits();
  const [log] = useStudyLog();
  const [accountOpen, setAccountOpen] = useState(false);
  // The class whose full details are open, or null. Holds the resolved slot
  // rather than an id, because a one-off move or an extra session exists only
  // in the merged view that classesOn() builds — there is no document to look
  // it up in afterwards.
  const [openClass, setOpenClass] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── next class ───────────────────────────────────────────────────────────
  // Both of these run through the schedule helper, so a class the CR called
  // off is never offered as "next" and never sends anyone to an empty room.
  const todayDate = format(now, 'yyyy-MM-dd');
  const todaysClasses = useMemo(
    () => classesOn(todayDate, timetable, classChanges),
    [todayDate, timetable, classChanges]
  );

  const nextClass = useMemo(
    () => findNextClass(now, timetable, classChanges),
    [now, timetable, classChanges]
  );

  const notices = useMemo(() => liveAnnouncements(announcements), [announcements]);

  // ── exams ────────────────────────────────────────────────────────────────
  // During an exam period the weekly timetable is not what is happening, so
  // this screen stops answering "what is your next class" and starts answering
  // "where is your next paper".
  const inExams = examModeActive(examMode, todayDate);
  const nextExam = useMemo(() => findNextExam(now, exams), [now, exams]);
  const examsToday = useMemo(() => examsOn(todayDate, exams), [todayDate, exams]);
  const examsAhead = useMemo(() => upcomingExams(exams, 30), [exams]);

  // ── everything needing attention ─────────────────────────────────────────
  const alerts = useMemo(
    () => buildAlerts({ tasks, subjects, timetable, changes: classChanges, exams }),
    [tasks, subjects, timetable, classChanges, exams]
  );

  useDeadlineNotifications(tasks, subjects);

  const sem = semesterGpa(book, credits, subjects);
  const { all: weekMins } = weekMinutes(log);
  const streak = streakDays(log);

  const dueSoon = tasks.filter((t) => !t.completed).slice(0, 4);

  // What today is — nothing on, all behind you, or still to come — and what is
  // left of it. Both live in lib/schedule.js with the rest of "what actually
  // happens on a date", so this screen and the week view cannot drift apart.
  const remainingToday = useMemo(
    () => remainingOn(now, todaysClasses),
    [now, todaysClasses]
  );
  const shape = todayShape({
    now, timetable, classesToday: todaysClasses, ready: !loading,
  });
  const stillDueToday = tasks.filter(
    (t) => !t.completed && !t.isEvent && t.dueDate === todayDate
  );
  const advice = useMemo(
    () => restDayAdvice({ tasks, exams, subjects, weekTotals: weekMinutes(log).totals }),
    [tasks, exams, subjects, log]
  );

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user.displayName?.split(' ')[0];

  return (
    <div className="animate-in">
      <header className="page-header row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <p className="page-eyebrow">{format(now, 'EEEE, d MMMM')}</p>
          <h1 className="page-title">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        </div>
        <button
          className="btn-icon"
          onClick={() => setAccountOpen(true)}
          aria-label="Account and settings"
          style={{ marginTop: 4, flexShrink: 0 }}
        >
          {user.photoURL ? (
            <img
              src={user.photoURL} alt="" referrerPolicy="no-referrer"
              style={{ width: 30, height: 30, borderRadius: '50%' }}
            />
          ) : <User size={19} aria-hidden="true" />}
        </button>
      </header>

      {/* One panel, not one tinted card per alert. Four stacked full-bleed
          cards in four different tints is a lot of chrome for what is a single
          idea, and the colour stops meaning anything. Severity now rides on the
          icon, and the rows scan in one pass. */}
      {alerts.length > 0 && (
        <section
          className="card card-flush"
          aria-label="Needs attention"
          style={{ marginBottom: 'var(--s5)' }}
        >
          <div className="row-between" style={{ padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--border)' }}>
            <h2 className="section-title">Needs attention</h2>
            <span className={`badge badge-${alertTone(alerts[0].severity)}`}>{alerts.length}</span>
          </div>
          <div className="list">
            {alerts.slice(0, 5).map((a) => (
              <Link key={a.id} to={a.to} className="list-row list-row-link">
                {a.severity === 'info'
                  ? <Info size={16} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  : <AlertTriangle size={16} aria-hidden="true" style={{ color: `var(--${alertTone(a.severity)})`, flexShrink: 0 }} />}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 560 }}>{a.title}</div>
                  {a.detail && <div className="muted tiny truncate" style={{ marginTop: 1 }}>{a.detail}</div>}
                </div>
                <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
              </Link>
            ))}
            {alerts.length > 5 && (
              <Link to="/tasks" className="list-row list-row-link muted tiny">
                {alerts.length - 5} more
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Notices sit above the numbers because they are the only thing here
          that someone else wrote today, and they expire on their own. */}
      {notices.length > 0 && (
        <section className="section" style={{ marginTop: 0, marginBottom: 'var(--s5)' }}>
          <div className="section-head">
            <h2 className="section-title">{notices.length === 1 ? 'Note from CR' : 'Notes from CR'}</h2>
            <span className="muted small">{notices.length}</span>
          </div>
          <div className="stack-sm">
            {notices.slice(0, 4).map((notice) => (
              <div key={notice.id} className="card card-tight notice row">
                <Megaphone size={16} aria-hidden="true" className="notice-icon" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600 }}>{notice.title}</div>
                  {notice.body && (
                    <p className="muted small" style={{ marginTop: 3 }}>{notice.body}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The university's own systems. This app is a helper, not a
          replacement: registration, the fee voucher and the official grade
          sheet all live over there, and hunting for the address in a bookmark
          bar or a group chat is how people end up on the wrong one.

          Near the top, not at the foot of the page. It was below five sections
          that each grow with the semester, so on a real account it sat off the
          bottom of the screen — which for a link whose whole job is to save
          somebody searching for it is the same as not being there. */}
      <div className="card card-flush list" style={{ marginBottom: 'var(--s5)' }}>
        {CAMPUS_LINKS.map((link) => (
          <a key={link.id} href={link.href} {...EXTERNAL_LINK_PROPS} className="list-row list-row-link">
            <Building2 size={16} aria-hidden="true" style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small" style={{ fontWeight: 560 }}>{link.label}</div>
              <div className="muted tiny truncate" style={{ marginTop: 1 }}>{link.detail}</div>
            </div>
            <ExternalLink size={14} aria-hidden="true" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          </a>
        ))}
      </div>

      <div className="stat-grid" style={{ marginBottom: 'var(--s5)' }}>
        <Link to="/grades" className="card stat">
          <span className="stat-label"><GraduationCap size={12} aria-hidden="true" /> Semester GPA</span>
          <span className={`stat-value ${sem.gpa == null ? 'stat-value-empty' : ''}`}>{sem.gpa != null ? sem.gpa.toFixed(2) : '-'}</span>
          <span className="stat-foot">{sem.gpa != null ? `estimate, ${sem.credits} credits` : 'add your marks'}</span>
        </Link>
        <Link to="/focus" className="card stat">
          <span className="stat-label"><Flame size={12} aria-hidden="true" /> Studied this week</span>
          <span className="stat-value">{(weekMins / 60).toFixed(1)}<span className="stat-unit">h</span></span>
          <span className="stat-foot">{streak > 0 ? `${streak} day streak` : 'start a session'}</span>
        </Link>
      </div>

      {/* Exam period. The weekly timetable is not what is happening, so it is
          not what this card answers; the only useful question left is which
          room, at what time, in which seat. */}
      {inExams ? (
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <h2 className="section-title">Next exam</h2>
            <Link to="/timetable" className="link-inline">
              Full schedule <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="alert alert-warning" style={{ marginBottom: 'var(--s3)' }}>
            <Armchair size={16} aria-hidden="true" />
            <span className="alert-body">
              {examMode.label || 'Exams'} are on{examModeDates(examMode) ? `, ${examModeDates(examMode)}` : ''}.
              Normal classes are suspended.
            </span>
          </div>
          {loading ? <CardSkeleton /> : nextExam ? (
            <NextExamCard exam={nextExam} subject={subjects[nextExam.code]} now={now} />
          ) : (
            <div className="card">
              <EmptyState icon={FileText} title="No papers left on the schedule">
                Nothing else has been published for this exam period.
              </EmptyState>
            </div>
          )}

          {examsToday.length > 1 && (
            <div className="card card-flush list" style={{ marginTop: 'var(--s3)' }}>
              {examsToday.map((e) => (
                <div key={e.id} className="list-row" style={{ minHeight: 48 }}>
                  <span className="nums muted small" style={{ minWidth: 62, flexShrink: 0 }}>{fmt(e.start, now)}</span>
                  <span className="grow truncate">{subjects[e.code]?.short || e.code} · {e.kind}</span>
                  <span className="badge badge-warning">{e.room}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : shape === 'free' ? (
        // No classes today. "Next class: Wednesday" is true and useless; the
        // question actually being asked is what to do with the day.
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <h2 className="section-title">Today</h2>
            <Link to="/timetable" className="link-inline">Full week <ChevronRight size={14} aria-hidden="true" /></Link>
          </div>
          <RestDayCard advice={advice} nextClass={nextClass} subjects={subjects} now={now} />
        </section>
      ) : shape === 'done' ? (
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <h2 className="section-title">Today</h2>
            <Link to="/timetable" className="link-inline">Full week <ChevronRight size={14} aria-hidden="true" /></Link>
          </div>
          <DayDoneCard
            nextClass={nextClass}
            stillDue={stillDueToday}
            subjects={subjects}
            now={now}
          />
        </section>
      ) : (
        <section className="section" style={{ marginTop: 0 }}>
          <div className="section-head">
            <h2 className="section-title">Next class</h2>
            <Link to="/timetable" className="link-inline">Full week <ChevronRight size={14} aria-hidden="true" /></Link>
          </div>

          {loading ? <CardSkeleton /> : nextClass ? (
            <NextClassCard
              slot={nextClass}
              subject={subjects[nextClass.code]}
              now={now}
              onOpen={() => setOpenClass(nextClass)}
            />
          ) : (
            <div className="card">
              <EmptyState icon={CalendarCheck} title="No classes scheduled">
                Once the timetable is published it shows up here.
              </EmptyState>
            </div>
          )}
        </section>
      )}

      {!inExams && remainingToday.length > 1 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Rest of today</h2>
            <span className="muted small">
              {remainingToday.length} {remainingToday.length === 1 ? 'class' : 'classes'} left
            </span>
          </div>
          <div className="card card-flush list">
            {remainingToday.map((c) => {
              const live = isAfter(now, parse(c.start, 'HH:mm', now));
              return (
                <button
                  key={c.id}
                  className={`list-row list-row-link ${c.cancelled ? 'is-cancelled' : ''}`}
                  style={{ minHeight: 48, width: '100%', textAlign: 'left' }}
                  onClick={() => setOpenClass({ ...c, date: todayDate, daysAway: 0 })}
                >
                  <span className="nums muted small" style={{ minWidth: 62, flexShrink: 0 }}>{fmt(c.start, now)}</span>
                  <span className="grow truncate">
                    {subjects[c.code]?.short || c.code}{c.type === 'LAB' ? ' lab' : ''}
                  </span>
                  {c.cancelled ? <span className="badge badge-danger">Cancelled</span>
                    : live ? <span className="badge badge-success">Now · {c.room}</span>
                    : c.extra ? <span className="badge badge-accent">Extra · {c.room}</span>
                    : c.movedFrom ? <span className="badge badge-warning">Moved · {c.room}</span>
                    : <span className="badge">{c.room}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Published papers, separate from the deadline list underneath. An exam
          is a place and a time, not something anybody hands in, so it gets a
          room instead of a tick box. */}
      {!inExams && examsAhead.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Exams coming up</h2>
            <Link to="/timetable" className="link-inline">
              Full schedule <ChevronRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="card card-flush list">
            {examsAhead.slice(0, 4).map((exam) => {
              const countdown = examCountdown(exam);
              return (
                <Link key={exam.id} to="/timetable" className="list-row list-row-link" style={{ alignItems: 'flex-start' }}>
                  <FileText size={16} aria-hidden="true" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="small" style={{ fontWeight: 560 }}>
                      {exam.kind} · {subjects[exam.code]?.short || exam.code}
                    </div>
                    <div className="muted tiny truncate" style={{ marginTop: 2 }}>
                      {format(new Date(`${exam.date}T00:00:00`), 'EEE d MMM')} · {fmt(exam.start, now)} · {exam.room}
                      {exam.seat ? ` · seat ${exam.seat}` : ''}
                    </div>
                  </div>
                  {countdown && <span className={`badge ${countdown.tone}`} style={{ flexShrink: 0 }}>{countdown.text}</span>}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Coming up</h2>
          <Link to="/tasks" className="link-inline">All tasks <ChevronRight size={14} aria-hidden="true" /></Link>
        </div>
        {dueSoon.length === 0 ? (
          <div className="card">
            <EmptyState icon={PartyPopper} title="Nothing pending">
              When your CR announces an assignment or quiz it appears here automatically.
            </EmptyState>
          </div>
        ) : (
          <div className="stack-sm">
            {dueSoon.map((t) => {
              const due = dueBadge(t);
              return (
                <Link
                  key={t.id} to="/tasks"
                  className="card card-tight card-accent row"
                  style={{ '--stripe': subjects[t.subject]?.color, textDecoration: 'none' }}
                >
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="muted tiny" style={{ marginTop: 2 }}>
                      {subjects[t.subject]?.short || t.subject} · {t.type}
                      {isEventType(t.type) && ' · sat, not submitted'}
                      {t.source === 'class' && ' · class-wide'}
                    </div>
                  </div>
                  {due && <span className={`badge ${due.tone}`}>{due.text}</span>}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {openClass && (
        <ClassSheet
          slot={openClass}
          subject={subjects[openClass.code]}
          tasks={tasks}
          now={now}
          onClose={() => setOpenClass(null)}
        />
      )}

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

const fmt = (t, ref) => format(parse(t, 'HH:mm', ref), 'h:mm a');

function NextClassCard({ slot, subject, now, onOpen }) {
  const isToday = slot.daysAway === 0;
  const start = parse(slot.start, 'HH:mm', now);
  const end = parse(slot.end, 'HH:mm', now);
  // The rolling note on the recurring slot, which is a different thing from a
  // one-off change to this particular date.
  const standingNote = slot.changeNote && (!slot.changeUntil || slot.changeUntil >= todayIso());

  let status = { text: slot.daysAway === 1 ? 'Tomorrow' : DAYS[slot.day], tone: '' };
  if (isToday) {
    if (isAfter(now, start) && isBefore(now, end)) status = { text: 'Happening now', tone: 'badge-success' };
    else {
      const mins = Math.floor((start - now) / 60_000);
      status = mins >= 0 && mins < 90
        ? { text: `Starts in ${mins} min`, tone: 'badge-warning' }
        : { text: 'Today', tone: 'badge-accent' };
    }
  }

  return (
    <button
      className="card card-accent"
      style={{ '--stripe': subject?.color, width: '100%', textAlign: 'left' }}
      onClick={onOpen}
      aria-label={`${subject?.title || slot.code}, ${fmt(slot.start, now)} in ${slot.room}. Open course links and what is due.`}
    >
      <div className="row-between row-wrap" style={{ marginBottom: 'var(--s3)' }}>
        <span className="badge badge-accent">{slot.code} · {slot.type}</span>
        <span className={`badge ${status.tone}`}>{status.text}</span>
      </div>

      <h3 style={{ marginBottom: 'var(--s3)' }}>{subject?.title || slot.code}</h3>

      <div className="row-between" style={{ marginBottom: 'var(--s2)' }}>
        <span className="icon-row nums"><Clock size={15} aria-hidden="true" />{fmt(slot.start, now)} - {fmt(slot.end, now)}</span>
        <span className="badge badge-warning" style={{ fontSize: 'var(--fs-sm)', padding: '5px 11px' }}>
          <MapPin size={13} aria-hidden="true" />{slot.room}
        </span>
      </div>
      {subject?.teacher && <span className="icon-row"><User size={15} aria-hidden="true" />{subject.teacher}</span>}

      {/* A one-off move or an extra session has to be unmissable here: this
          card is the single thing most students look at before leaving. */}
      {slot.movedFrom && (
        <div className="alert alert-warning" style={{ marginTop: 'var(--s3)' }}>
          <ArrowRightLeft size={15} aria-hidden="true" />
          <span className="alert-body">
            Moved for this date only. It was {fmt(slot.movedFrom.start, now)} in {slot.movedFrom.room}.
            {slot.change?.note ? ` ${slot.change.note}` : ''}
          </span>
        </div>
      )}
      {slot.extra && (
        <div className="alert alert-accent" style={{ marginTop: 'var(--s3)' }}>
          <CalendarPlus size={15} aria-hidden="true" />
          <span className="alert-body">
            Extra class, not on the usual timetable.
            {slot.change?.note ? ` ${slot.change.note}` : ''}
          </span>
        </div>
      )}

      {standingNote && (
        <div className="alert alert-warning" style={{ marginTop: 'var(--s3)' }}>
          <Info size={15} aria-hidden="true" />
          <span>{slot.changeNote}</span>
        </div>
      )}

      {/* The card is the single thing most students look at before leaving, so
          the things they go looking for next — the Drive folder, the Classroom,
          what is due for this subject — are one tap away rather than three
          screens away. */}
      <div
        className="row-between muted tiny"
        style={{ marginTop: 'var(--s3)', paddingTop: 'var(--s3)', borderTop: '1px solid var(--border)' }}
      >
        <span>Course material and what is due</span>
        <ChevronRight size={15} aria-hidden="true" />
      </div>
    </button>
  );
}

/**
 * Everything attached to one class, opened from the card.
 *
 * Same idea as tapping a subject on Classes, but anchored to this particular
 * sitting: the time and room are the ones actually in effect for this date,
 * including a one-off move, rather than the recurring pattern's.
 */
function ClassSheet({ slot, subject, tasks, now, onClose }) {
  const drive = safeLink(subject?.driveLink, 'drive');
  const classroom = safeLink(subject?.classroomLink, 'classroom');
  const pending = tasks.filter((t) => t.subject === slot.code && !t.completed).slice(0, 5);
  const standingNote = slot.changeNote && (!slot.changeUntil || slot.changeUntil >= todayIso());

  const when = slot.date
    ? format(new Date(`${slot.date}T00:00:00`), 'EEEE d MMMM')
    : DAYS[slot.day];

  return (
    <Sheet
      open
      onClose={onClose}
      title={subject?.title || slot.code}
      subtitle={`${slot.code} · ${slot.type}`}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
          <Link to="/timetable" className="btn btn-primary" onClick={onClose}>
            See the full week
          </Link>
        </>
      }
    >
      <div className="stack">
        <div className="card card-flush list">
          <div className="list-row">
            <span className="muted small grow">When</span>
            <span className="small nums">{when}, {fmt(slot.start, now)} - {fmt(slot.end, now)}</span>
          </div>
          <div className="list-row">
            <span className="muted small grow">Room</span>
            <span className="badge badge-warning"><MapPin size={11} aria-hidden="true" />{slot.room}</span>
          </div>
          {subject?.teacher && (
            <div className="list-row">
              <span className="muted small grow">Teacher</span>
              <span className="small">{subject.teacher}</span>
            </div>
          )}
        </div>

        {slot.movedFrom && (
          <div className="alert alert-warning">
            <ArrowRightLeft size={15} aria-hidden="true" />
            <span className="alert-body">
              Moved for this date only. It was {fmt(slot.movedFrom.start, now)} in {slot.movedFrom.room}.
              {slot.change?.note ? ` ${slot.change.note}` : ''}
            </span>
          </div>
        )}
        {slot.cancelled && (
          <div className="alert alert-danger">
            <Info size={15} aria-hidden="true" />
            <span className="alert-body">
              Cancelled for this date. {slot.change?.note || 'No reason was given.'}
            </span>
          </div>
        )}
        {slot.extra && (
          <div className="alert alert-accent">
            <CalendarPlus size={15} aria-hidden="true" />
            <span className="alert-body">
              Extra class, not on the usual timetable.
              {slot.change?.note ? ` ${slot.change.note}` : ''}
            </span>
          </div>
        )}
        {standingNote && (
          <div className="alert alert-warning">
            <Info size={15} aria-hidden="true" />
            <span className="alert-body">{slot.changeNote}</span>
          </div>
        )}

        {/* Plenty of courses have neither, and some never will. An empty
            section telling a student to go and ask somebody is a chore the app
            invented, so when there is nothing to link to there is nothing here. */}
        {(drive || classroom) && (
          <div>
            <p className="field-label" style={{ marginBottom: 8 }}>Course links</p>
            <div className="stack-sm">
              {drive && (
                <a href={drive} {...EXTERNAL_LINK_PROPS} className="btn btn-secondary btn-block">
                  <FolderOpen size={16} aria-hidden="true" />
                  Course material on Drive
                  <ExternalLink size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
                </a>
              )}
              {classroom && (
                <a href={classroom} {...EXTERNAL_LINK_PROPS} className="btn btn-secondary btn-block">
                  <GraduationCap size={16} aria-hidden="true" />
                  Google Classroom
                  <ExternalLink size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
                </a>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="field-label" style={{ marginBottom: 8 }}>Coming up for this subject</p>
          {pending.length === 0 ? (
            <p className="field-hint">Nothing pending.</p>
          ) : (
            <div className="stack-sm">
              {pending.map((t) => {
                const due = dueBadge(t);
                return (
                  <Link
                    key={t.id} to="/tasks" onClick={onClose}
                    className="card card-tight row"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="truncate small" style={{ fontWeight: 600 }}>{t.title}</div>
                      <div className="muted tiny">{t.type}</div>
                    </div>
                    {due && <span className={`badge ${due.tone}`}>{due.text}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/**
 * Every class today is behind you.
 *
 * Deliberately not the same card as a free day. "Nothing was ever on" and "you
 * have done all of it" are different facts and deserve different words, and
 * this one is the only place in the app that gets to say well done.
 *
 * It still checks before doing so: a deadline due tonight makes "go and rest"
 * actively bad advice, so when there is one it says that instead.
 */
function DayDoneCard({ nextClass, stillDue, subjects, now }) {
  const resting = stillDue.length === 0;

  return (
    <div className="card card-accent" style={{ '--stripe': 'var(--success)' }}>
      <div className="row-between row-wrap" style={{ marginBottom: 'var(--s3)' }}>
        <span className="badge badge-success">
          <CheckCheck size={11} aria-hidden="true" /> Classes done for today
        </span>
      </div>

      {resting ? (
        <>
          <h3 style={{ marginBottom: 'var(--s2)' }}>That is everything. Go and get some rest.</h3>
          <p className="muted small">
            Nothing else is timetabled and nothing is due tonight.
          </p>
        </>
      ) : (
        <>
          <h3 style={{ marginBottom: 'var(--s2)' }}>
            Classes are done, but {stillDue.length} {stillDue.length === 1 ? 'thing is' : 'things are'} due today
          </h3>
          <p className="muted small">
            {stillDue.slice(0, 2).map((t) => `${subjects[t.subject]?.short || t.subject}: ${t.title}`).join(' · ')}
          </p>
          <Link to="/tasks" className="btn btn-secondary btn-block" style={{ marginTop: 'var(--s4)' }}>
            Finish them off <ChevronRight size={15} aria-hidden="true" />
          </Link>
        </>
      )}

      {nextClass && (
        <p className="field-hint" style={{ marginTop: 'var(--s3)' }}>
          Back {nextClass.daysAway === 1 ? 'tomorrow' : `on ${DAYS[nextClass.day]}`} at
          {' '}{fmt(nextClass.start, now)} — {subjects[nextClass.code]?.short || nextClass.code} in {nextClass.room}.
        </p>
      )}
    </div>
  );
}

/**
 * A day with no classes.
 *
 * This replaces a card that said "Next class: Wed" and nothing else. That is a
 * correct answer to a question nobody asked: somebody who has already worked
 * out there is nothing on today wants to know what to do with the day, and a
 * free day is both the largest block of study time in a week and the one most
 * reliably spent not studying.
 *
 * The suggestion is ranked in lib/restday.js and always names something real —
 * a paper, a deadline, a neglected subject — so it cannot rot into a slogan.
 * When classes resume is kept, in one line at the bottom, because it is still
 * worth knowing; it is just not the headline.
 */
function RestDayCard({ advice, nextClass, subjects, now }) {
  return (
    <div className="card card-accent" style={{ '--stripe': 'var(--success)' }}>
      <div className="row-between row-wrap" style={{ marginBottom: 'var(--s3)' }}>
        <span className="badge badge-success"><Coffee size={11} aria-hidden="true" /> No classes today</span>
      </div>

      <h3 style={{ marginBottom: 'var(--s2)' }}>{advice.headline}</h3>
      <p className="muted small">{advice.detail}</p>

      <Link to={advice.to} className="btn btn-secondary btn-block" style={{ marginTop: 'var(--s4)' }}>
        {advice.action} <ChevronRight size={15} aria-hidden="true" />
      </Link>

      {nextClass && (
        <p className="field-hint" style={{ marginTop: 'var(--s3)' }}>
          Classes resume {nextClass.daysAway === 1 ? 'tomorrow' : DAYS[nextClass.day]},
          {' '}{fmt(nextClass.start, now)} — {subjects[nextClass.code]?.short || nextClass.code} in {nextClass.room}.
        </p>
      )}
    </div>
  );
}

/**
 * The exam equivalent of the next-class card.
 *
 * Deliberately shorter. Before a paper nobody wants a teacher's name or a
 * course title; they want the room, the hour and the seat, in that order, at a
 * size readable while walking.
 */
function NextExamCard({ exam, subject, now }) {
  const countdown = examCountdown(exam);
  const start = parse(exam.start, 'HH:mm', now);
  const end = parse(exam.end, 'HH:mm', now);
  const today = format(now, 'yyyy-MM-dd') === exam.date;
  const live = today && isAfter(now, start) && isBefore(now, end);

  return (
    <div className="card card-accent" style={{ '--stripe': subject?.color }}>
      <div className="row-between row-wrap" style={{ marginBottom: 'var(--s3)' }}>
        <span className="badge badge-accent">{exam.code} · {exam.kind}</span>
        <span className={`badge ${live ? 'badge-success' : countdown?.tone || ''}`}>
          {live ? 'In progress' : countdown?.text}
        </span>
      </div>

      <h3 style={{ marginBottom: 'var(--s3)' }}>{subject?.title || exam.code}</h3>

      <div className="row-between" style={{ marginBottom: 'var(--s2)' }}>
        <span className="icon-row nums">
          <Clock size={15} aria-hidden="true" />{fmt(exam.start, now)} - {fmt(exam.end, now)}
        </span>
        <span className="badge badge-warning" style={{ fontSize: 'var(--fs-sm)', padding: '5px 11px' }}>
          <MapPin size={13} aria-hidden="true" />{exam.room}
        </span>
      </div>

      <div className="row-between">
        <span className="icon-row">
          {format(new Date(`${exam.date}T00:00:00`), 'EEEE d MMMM')}
        </span>
        {exam.seat && (
          <span className="badge"><Armchair size={12} aria-hidden="true" /> Seat {exam.seat}</span>
        )}
      </div>

      {exam.note && (
        <div className="alert alert-accent" style={{ marginTop: 'var(--s3)' }}>
          <Info size={15} aria-hidden="true" />
          <span className="alert-body">{exam.note}</span>
        </div>
      )}
    </div>
  );
}

/* ── account sheet ─────────────────────────────────────────────────────────── */

const THEME_KEY = 'unihelper:theme';
const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } };

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
}

function AccountSheet({ open, onClose }) {
  const { user, role, signOut } = useAuth();
  const toast = useToast();
  const [theme, setTheme] = useState(readTheme);
  const [permission, setPermission] = useState(notificationPermission());

  const chooseTheme = (next) => { setTheme(next); applyTheme(next); };

  const enableNotifications = async () => {
    const result = await requestNotifications();
    setPermission(result);
    if (result === 'granted') toast.success('You will get one summary a day when something is due.');
    else if (result === 'denied') toast.warning('Blocked. Turn notifications back on in your browser site settings.');
    // 'default' means the prompt was closed without an answer. Saying the
    // browser cannot do notifications would be false.
    else if (result === 'default') toast.info('Nothing was chosen. Tap again when you want alerts.');
    else toast.info('This browser does not support notifications.');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Account" subtitle={user.email}>
      <div className="stack">
        <div className="card card-tight row">
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 650 }}>{user.displayName || 'Signed in'}</div>
            <div className="muted tiny truncate">{user.email}</div>
          </div>
          <span className="badge badge-accent">{role || 'student'}</span>
        </div>

        <div>
          <p className="field-label" style={{ marginBottom: 8 }}>Appearance</p>
          <div className="tabs" role="group" aria-label="Theme">
            {[
              { value: 'system', label: 'System', Icon: Monitor },
              { value: 'light', label: 'Light', Icon: Sun },
              { value: 'dark', label: 'Dark', Icon: Moon },
            ].map(({ value, label, Icon }) => (
              <button
                key={value} type="button"
                aria-selected={theme === value} role="tab"
                onClick={() => chooseTheme(value)}
              >
                <Icon size={14} aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label" style={{ marginBottom: 8 }}>Deadline alerts</p>
          {permission === 'granted' ? (
            <div className="alert alert-success">
              <Bell size={15} aria-hidden="true" />
              <span className="alert-body">On. One summary a day when something is due today or tomorrow.</span>
            </div>
          ) : (
            <>
              <button className="btn btn-secondary btn-block" onClick={enableNotifications} disabled={!notificationsSupported() || permission === 'denied'}>
                {permission === 'denied' ? <BellOff size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
                {permission === 'denied' ? 'Blocked in browser settings' : 'Turn on deadline alerts'}
              </button>
              <p className="field-hint" style={{ marginTop: 6 }}>
                At most one notification a day, only when a deadline is inside 24 hours.
                In-app alerts on this page work either way.
              </p>
            </>
          )}
        </div>

        <hr className="divider" />

        <button className="btn btn-danger btn-block" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </div>
    </Sheet>
  );
}
