import React, { useState, useEffect } from 'react';
import { timetable, subjects } from '../data/timetable';
import { Clock, MapPin, User, ChevronRight, AlertTriangle, Flame, GraduationCap, LogOut } from 'lucide-react';
import { format, getDay, parse, isAfter, isBefore } from 'date-fns';
import { Link } from 'react-router-dom';
import { useTasks, sortTasks, daysUntil, dueLabel } from '../lib/useTasks';
import { useGradeBook, useCredits, useAttendance, semesterGpa, attendanceStats } from '../lib/progress';
import { useStudyLog, weekMinutes, streakDays } from '../lib/study';
import { useAuth } from '../lib/authContext';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Dashboard() {
  const [now, setNow] = useState(new Date());
  const { tasks } = useTasks();
  const [book] = useGradeBook();
  const [credits] = useCredits();
  const [att] = useAttendance();
  const [log] = useStudyLog();
  const { user, signOut } = useAuth();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // ---- next class ----
  const today = getDay(now);
  const sorted = [...timetable].sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start));
  const nextClass = sorted.find(c =>
    (c.day === today && isBefore(now, parse(c.end, 'HH:mm', now))) || c.day > today
  ) || sorted[0];
  const todaysClasses = sorted.filter(c => c.day === today);

  const status = (cls) => {
    if (cls.day === today) {
      const s = parse(cls.start, 'HH:mm', now), e = parse(cls.end, 'HH:mm', now);
      if (isAfter(now, s) && isBefore(now, e)) return <span className="badge badge-success">Ongoing</span>;
      const mins = Math.floor((s - now) / 60000);
      if (mins >= 0 && mins < 60) return <span className="badge badge-warning">Starts in {mins}m</span>;
      return <span className="badge badge-primary">Today</span>;
    }
    return <span className="badge badge-primary">{DAYS[cls.day]}</span>;
  };
  const fmt = (t) => format(parse(t, 'HH:mm', now), 'h:mm a');

  // ---- tasks due soon ----
  const dueSoon = sortTasks(tasks).filter(t => !t.completed).slice(0, 4);
  const overdue = tasks.filter(t => !t.completed && daysUntil(t.dueDate) < 0).length;

  // ---- grades / attendance / study ----
  const sem = semesterGpa(book, credits);
  const attRisk = Object.keys(subjects)
    .map(code => ({ code, ...attendanceStats(att, code) }))
    .filter(a => a.held > 0 && (a.pct < 80 || a.skipsLeft <= 1));
  const { all: weekMins } = weekMinutes(log);
  const streak = streakDays(log);

  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="animate-fade-in">
      <header className="mb-4 flex-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <p className="text-muted">{format(now, 'EEEE, MMMM d')}</p>
          <h1>{greeting}{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</h1>
        </div>
        <button className="btn-icon" onClick={signOut} title={`Sign out (${user.email})`} style={{ marginTop: 6 }}>
          {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" style={{ width: 28, height: 28, borderRadius: '50%', display: 'block' }} /> : <LogOut size={18} />}
        </button>
      </header>

      <div className="stat-grid mb-4">
        <Link to="/grades" className="card glass stat" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="stat-label"><GraduationCap size={12} /> Semester GPA</span>
          <span className="stat-value">{sem.gpa != null ? sem.gpa.toFixed(2) : '—'}</span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{sem.gpa != null ? 'projected' : 'add marks to see'}</span>
        </Link>
        <Link to="/focus" className="card glass stat" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="stat-label"><Flame size={12} /> Study this week</span>
          <span className="stat-value">{(weekMins / 60).toFixed(1)}h</span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{streak} day streak</span>
        </Link>
      </div>

      {(overdue > 0 || attRisk.length > 0) && (
        <div className="card glass" style={{ padding: 15, borderLeft: '3px solid var(--danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--danger)' }}>
            <AlertTriangle size={16} /> Needs attention
          </div>
          <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: '0.85rem' }}>
            {overdue > 0 && <li>{overdue} overdue task{overdue > 1 ? 's' : ''}</li>}
            {attRisk.map(a => (
              <li key={a.code}>
                {subjects[a.code].short} attendance {Math.round(a.pct)}% — {a.skipsLeft > 0 ? `${a.skipsLeft} skip left` : 'no skips left'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-between mb-2">
        <h2>Next Class</h2>
        <Link to="/timetable" className="link">Full week <ChevronRight size={16} /></Link>
      </div>
      {nextClass ? (
        <div className="card glass" style={{ borderLeft: `3px solid ${subjects[nextClass.code]?.color}` }}>
          <div className="card-header">
            <span className="badge badge-primary">{nextClass.code} · {nextClass.type}</span>
            {status(nextClass)}
          </div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: 15 }}>{subjects[nextClass.code]?.title}</h3>
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <div className="icon-row"><Clock size={16} /><span>{fmt(nextClass.start)} – {fmt(nextClass.end)}</span></div>
            <div className="icon-row" style={{ fontWeight: 700, color: 'var(--warning)' }}><MapPin size={16} /><span>{nextClass.room}</span></div>
          </div>
          <div className="icon-row"><User size={16} /><span>{subjects[nextClass.code]?.teacher}</span></div>
        </div>
      ) : (
        <div className="card glass"><p className="text-muted">No upcoming classes.</p></div>
      )}

      {todaysClasses.length > 1 && (
        <div className="card glass" style={{ padding: 15 }}>
          <p className="text-muted mb-2" style={{ fontSize: '0.8rem' }}>Today · {todaysClasses.length} classes</p>
          {todaysClasses.map((c, i) => (
            <div key={i} className="flex-between" style={{ fontSize: '0.85rem', padding: '4px 0', opacity: isAfter(now, parse(c.end, 'HH:mm', now)) ? 0.45 : 1 }}>
              <span>{fmt(c.start)} · {subjects[c.code]?.short}{c.type === 'LAB' ? ' Lab' : ''}</span>
              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{c.room}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex-between mt-4 mb-2">
        <h2>Due Soon</h2>
        <Link to="/tasks" className="link">All tasks <ChevronRight size={16} /></Link>
      </div>
      <div className="card glass" style={{ padding: dueSoon.length ? 8 : 20 }}>
        {dueSoon.length === 0 ? (
          <p className="text-muted text-center">Nothing pending. Add assignments and quizzes as they're announced.</p>
        ) : dueSoon.map(t => {
          const due = dueLabel(t.dueDate, false);
          return (
            <div key={t.id} className="flex-between" style={{ padding: '8px 10px', borderLeft: `3px solid ${subjects[t.subject]?.color}`, marginBottom: 4 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>{subjects[t.subject]?.short} · {t.type || 'Task'}</div>
              </div>
              {due && <span className={`badge ${due.cls}`} style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{due.text}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
