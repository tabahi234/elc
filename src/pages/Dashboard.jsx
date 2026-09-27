import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parse, isAfter, isBefore } from 'date-fns';
import {
  Clock, MapPin, User, ChevronRight, AlertTriangle, Flame, GraduationCap,
  LogOut, Bell, BellOff, Sun, Moon, Monitor, Info, CalendarCheck, PartyPopper,
  Megaphone, ArrowRightLeft, CalendarPlus,
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
import { todayIso } from '../lib/validate';
import { classesOn, nextClass as findNextClass } from '../lib/schedule';
import { liveAnnouncements } from '../lib/announcements';
import { useToast } from '../lib/toastContext';
import { Sheet, EmptyState, CardSkeleton } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const [now, setNow] = useState(new Date());
  const { user } = useAuth();
  const { subjects, timetable, classChanges, announcements, loading } = useClassData();
  const { tasks } = useAllTasks();
  const [book] = useGradeBook();
  const [credits] = useCredits();
  const [log] = useStudyLog();
  const [accountOpen, setAccountOpen] = useState(false);

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

  // ── everything needing attention ─────────────────────────────────────────
  const alerts = useMemo(
    () => buildAlerts({ tasks, subjects, timetable, changes: classChanges }),
    [tasks, subjects, timetable, classChanges]
  );

  useDeadlineNotifications(tasks, subjects);

  const sem = semesterGpa(book, credits, subjects);
  const { all: weekMins } = weekMinutes(log);
  const streak = streakDays(log);

  const dueSoon = tasks.filter((t) => !t.completed).slice(0, 4);
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
            <h2 className="section-title">From your CR</h2>
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

      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2 className="section-title">Next class</h2>
          <Link to="/timetable" className="link-inline">Full week <ChevronRight size={14} aria-hidden="true" /></Link>
        </div>

        {loading ? <CardSkeleton /> : nextClass ? (
          <NextClassCard slot={nextClass} subject={subjects[nextClass.code]} now={now} />
        ) : (
          <div className="card">
            <EmptyState icon={CalendarCheck} title="No classes scheduled">
              Once the timetable is published it shows up here.
            </EmptyState>
          </div>
        )}
      </section>

      {todaysClasses.length > 1 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Rest of today</h2>
            <span className="muted small">{todaysClasses.length} classes</span>
          </div>
          <div className="card card-flush list">
            {todaysClasses.map((c) => {
              const done = isAfter(now, parse(c.end, 'HH:mm', now));
              return (
                <div
                  key={c.id}
                  className={`list-row ${c.cancelled ? 'is-cancelled' : ''}`}
                  style={{ opacity: done && !c.cancelled ? 0.45 : 1, minHeight: 48 }}
                >
                  <span className="nums muted small" style={{ minWidth: 62, flexShrink: 0 }}>{fmt(c.start, now)}</span>
                  <span className="grow truncate">
                    {subjects[c.code]?.short || c.code}{c.type === 'LAB' ? ' lab' : ''}
                  </span>
                  {c.cancelled ? <span className="badge badge-danger">Cancelled</span>
                    : c.extra ? <span className="badge badge-accent">Extra · {c.room}</span>
                    : c.movedFrom ? <span className="badge badge-warning">Moved · {c.room}</span>
                    : <span className="badge">{c.room}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Due soon</h2>
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

      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  );
}

const fmt = (t, ref) => format(parse(t, 'HH:mm', ref), 'h:mm a');

function NextClassCard({ slot, subject, now }) {
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
    <div className="card card-accent" style={{ '--stripe': subject?.color }}>
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
