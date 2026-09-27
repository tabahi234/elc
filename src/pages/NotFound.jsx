import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Compass, Home, CalendarDays, CheckSquare, GraduationCap, Timer, ChevronRight,
} from 'lucide-react';

const PLACES = [
  { to: '/', label: 'Home', hint: 'Next class and what needs you today', Icon: Home },
  { to: '/timetable', label: 'Classes', hint: 'Your week, rooms and course links', Icon: CalendarDays },
  { to: '/tasks', label: 'Deadlines', hint: 'Everything due, class-wide and your own', Icon: CheckSquare },
  { to: '/grades', label: 'Progress', hint: 'Marks, GPA and what you need next', Icon: GraduationCap },
  { to: '/focus', label: 'Focus', hint: 'Timer and your study log', Icon: Timer },
];

/**
 * A wrong address used to redirect silently to the dashboard, which looks
 * exactly like the app ignoring the tap. Saying so and offering the five
 * places there are to go is both honest and, on a five-screen app, faster
 * than the back button.
 */
export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">Page not found</p>
        <h1 className="page-title">There is nothing here</h1>
      </header>

      <div className="card recover" style={{ marginBottom: 'var(--s5)' }}>
        <div className="recover-icon"><Compass size={22} aria-hidden="true" /></div>
        <p className="recover-text">
          <span className="nums truncate" style={{ display: 'block', color: 'var(--text)' }}>{pathname}</span>
          is not one of this app&rsquo;s screens. It may be an old link, or the address
          may have a typo.
        </p>
      </div>

      <h2 className="section-title" style={{ marginBottom: 'var(--s3)' }}>Where you can go</h2>
      <div className="card card-flush list">
        {PLACES.map(({ to, label, hint, Icon }) => (
          <Link key={to} to={to} className="list-row list-row-link">
            <Icon size={17} aria-hidden="true" style={{ color: 'var(--accent)' }} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small" style={{ fontWeight: 580 }}>{label}</div>
              <div className="muted tiny truncate">{hint}</div>
            </div>
            <ChevronRight size={15} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
