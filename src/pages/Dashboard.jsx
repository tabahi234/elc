import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, getDay, parse, isAfter, isBefore } from 'date-fns';
import {
  Clock, MapPin, User, ChevronRight, AlertTriangle, Flame, GraduationCap,
  LogOut, Bell, BellOff, Sun, Moon, Monitor, Info, CalendarCheck, PartyPopper, ShieldAlert, Copy,
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useClassData } from '../lib/classDataContext';
import { useAllTasks, dueLabel } from '../lib/useTasks';
import { useGradeBook, useCredits, useAttendanceMarks, semesterGpa } from '../lib/progress';
import { useStudyLog, weekMinutes, streakDays } from '../lib/study';
import {
  buildAlerts, alertTone, useDeadlineNotifications,
  notificationPermission, requestNotifications, notificationsSupported,
} from '../lib/alerts';
import { todayIso } from '../lib/validate';
import { PROJECT_ID } from '../firebase';
import { useToast } from '../lib/toastContext';
import { Sheet, EmptyState, CardSkeleton } from '../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const [now, setNow] = useState(new Date());
  const { user, roleError } = useAuth();
  const { subjects, timetable, weeklySessions, SEMESTER_WEEKS, sessions, loading } = useClassData();
  const { tasks } = useAllTasks();
  const [book] = useGradeBook();
  const [credits] = useCredits();
  const [marks] = useAttendanceMarks();
  const [log] = useStudyLog();
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── next class ───────────────────────────────────────────────────────────
  const today = getDay(now);
  const todaysClasses = useMemo(
    () => timetable.filter((c) => c.day === today),
    [timetable, today]
  );

  const nextClass = useMemo(() => {
    const laterToday = timetable.find((c) => c.day === today && isBefore(now, parse(c.end, 'HH:mm', now)));
    return laterToday
      ?? timetable.find((c) => c.day > today)
      ?? timetable[0];
  }, [timetable, today, now]);

  // ── everything needing attention ─────────────────────────────────────────
  const alerts = useMemo(() => buildAlerts({
    tasks, subjects, marks, sessions, weeklySessions, semesterWeeks: SEMESTER_WEEKS, timetable,
  }), [tasks, subjects, marks, sessions, weeklySessions, SEMESTER_WEEKS, timetable]);

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
          style={{ marginTop: 4 }}
        >
          {user.photoURL ? (
            <img
              src={user.photoURL} alt="" referrerPolicy="no-referrer"
              style={{ width: 30, height: 30, borderRadius: '50%' }}
            />
          ) : <User size={19} aria-hidden="true" />}
        </button>
      </header>

      {/* If the role document cannot be read at all, the app has no idea who
          this person is. Saying nothing makes a broken deployment look like a
          working one, so it says so here, on the first screen. */}
      {roleError && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--s5)' }}>
          <ShieldAlert size={16} aria-hidden="true" />
          <div className="alert-body">
            <strong>Cannot check your access level.</strong>
            <p className="small" style={{ marginTop: 3 }}>
              {roleError.code === 'permission-denied'
                ? 'The security rules have not been deployed to this Firebase project yet. Run firebase deploy --only firestore:rules, then reload.'
                : roleError.message}
            </p>
          </div>
        </div>
      )}

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
                  ? <Info size={16} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                  : <AlertTriangle size={16} aria-hidden="true" style={{ color: `var(--${alertTone(a.severity)})` }} />}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 560 }}>{a.title}</div>
                  {a.detail && <div className="muted tiny truncate" style={{ marginTop: 1 }}>{a.detail}</div>}
                </div>
                <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
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
          <NextClassCard slot={nextClass} subject={subjects[nextClass.code]} now={now} today={today} />
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
                <div key={c.id} className="list-row" style={{ opacity: done ? 0.45 : 1, minHeight: 48 }}>
                  <span className="nums muted small" style={{ minWidth: 62 }}>{fmt(c.start, now)}</span>
                  <span className="grow truncate">{subjects[c.code]?.short || c.code}{c.type === 'LAB' ? ' lab' : ''}</span>
                  <span className="badge">{c.room}</span>
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
              const due = dueLabel(t.dueDate, false);
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

function NextClassCard({ slot, subject, now, today }) {
  const isToday = slot.day === today;
  const start = parse(slot.start, 'HH:mm', now);
  const end = parse(slot.end, 'HH:mm', now);
  const changeLive = slot.changeNote && (!slot.changeUntil || slot.changeUntil >= todayIso());

  let status = { text: DAYS[slot.day], tone: '' };
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
      <div className="row-between" style={{ marginBottom: 'var(--s3)' }}>
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

      {changeLive && (
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
  const { user, role, roleError, roleRaw, roleDocExists, signOut } = useAuth();
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
          <div className="grow">
            <div style={{ fontWeight: 650 }}>{user.displayName || 'Signed in'}</div>
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

        <AccessDiagnostics
          user={user}
          role={role}
          roleRaw={roleRaw}
          roleDocExists={roleDocExists}
          roleError={roleError}
        />

        <hr className="divider" />

        <button className="btn btn-danger btn-block" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </div>
    </Sheet>
  );
}

/* ---- access diagnostics --------------------------------------------------- */
/**
 * Shows exactly what the app sees when it looks up your role. Every step that
 * can silently go wrong (wrong document id, wrong field name, wrong casing,
 * rules not published) produces a different line here, so the failure is
 * readable instead of "the tab just is not there".
 *
 * The uid is copyable because the single most common mistake is creating the
 * role document with the console's auto-generated id instead of the uid.
 */
function AccessDiagnostics({ user, role, roleRaw, roleDocExists, roleError }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const copyUid = async () => {
    try {
      await navigator.clipboard.writeText(user.uid);
      toast.success('User ID copied.');
    } catch {
      toast.error('Could not copy. Select the ID and copy it by hand.');
    }
  };

  let verdict;
  if (roleError) {
    verdict = roleError.code === 'permission-denied'
      ? { tone: 'danger', text: 'Firestore refused the read. The rules in firestore.rules are not published on this project yet.' }
      : { tone: 'danger', text: `Read failed: ${roleError.message}` };
  } else if (roleDocExists === false) {
    verdict = { tone: 'warning', text: 'Rules are fine, but there is no document at roles/<your uid>. Check the document id is the uid below, not an auto-generated one.' };
  } else if (roleDocExists && !roleRaw) {
    verdict = { tone: 'warning', text: 'The document exists but has no "role" field. The field name must be exactly role, lowercase.' };
  } else if (roleDocExists && role !== 'admin' && role !== 'cr') {
    verdict = { tone: 'warning', text: `The role field says "${roleRaw}". It has to be admin or cr.` };
  } else if (role === 'admin' || role === 'cr') {
    verdict = { tone: 'success', text: 'Access confirmed. The Manage tab is in the bottom bar.' };
  } else {
    verdict = { tone: 'accent', text: 'Signed in as a student.' };
  }

  return (
    <div>
      <button
        className="btn btn-ghost btn-block"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ShieldAlert size={15} aria-hidden="true" />
        {open ? 'Hide access details' : 'Why can I not see Manage?'}
      </button>

      {open && (
        <div className="stack-sm" style={{ marginTop: 'var(--s3)' }}>
          <div className={`alert alert-${verdict.tone}`}>
            <Info size={15} aria-hidden="true" />
            <span className="alert-body">{verdict.text}</span>
          </div>

          <div className="card card-flush list">
            <div className="list-row" style={{ minHeight: 44 }}>
              <span className="grow small muted">Project</span>
              <span className="small nums">{PROJECT_ID}</span>
            </div>
            <div className="list-row" style={{ minHeight: 44 }}>
              <span className="grow small muted">Role read</span>
              <span className="small">{roleError ? roleError.code || 'failed' : 'ok'}</span>
            </div>
            <div className="list-row" style={{ minHeight: 44 }}>
              <span className="grow small muted">roles document</span>
              <span className="small">
                {roleError ? 'unknown' : roleDocExists ? 'found' : 'not found'}
              </span>
            </div>
            <div className="list-row" style={{ minHeight: 44 }}>
              <span className="grow small muted">role field</span>
              <span className="small">{roleRaw === undefined ? 'none' : JSON.stringify(roleRaw)}</span>
            </div>
            <div className="list-row" style={{ minHeight: 44 }}>
              <span className="grow small muted">Signed in as</span>
              <span className="small truncate" style={{ maxWidth: '55%' }}>{user.email}</span>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Your user ID</span>
            <div className="row" style={{ gap: 'var(--s2)' }}>
              <input readOnly value={user.uid} onFocus={(e) => e.target.select()} spellCheck={false} />
              <button className="btn btn-secondary btn-sm" onClick={copyUid} style={{ flexShrink: 0 }}>
                <Copy size={14} aria-hidden="true" /> Copy
              </button>
            </div>
            <p className="field-hint">
              In the Firebase console this must be the document id under the roles
              collection, with a single field: role = admin.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
