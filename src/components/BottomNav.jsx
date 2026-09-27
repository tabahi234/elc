import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CalendarDays, CheckSquare, GraduationCap, Timer, Settings2 } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { useAllTasks, daysUntil } from '../lib/useTasks';

export default function BottomNav() {
  const { canManage } = useAuth();
  const { tasks } = useAllTasks();

  // Only what is actually on fire. A badge that is always lit gets ignored.
  const urgent = tasks.filter((t) => !t.completed && t.dueDate && daysUntil(t.dueDate) <= 0).length;

  const items = [
    { to: '/', label: 'Home', Icon: Home, end: true },
    { to: '/timetable', label: 'Classes', Icon: CalendarDays },
    { to: '/tasks', label: 'Tasks', Icon: CheckSquare, count: urgent },
    { to: '/grades', label: 'Progress', Icon: GraduationCap },
    { to: '/focus', label: 'Focus', Icon: Timer },
    ...(canManage ? [{ to: '/admin', label: 'Manage', Icon: Settings2 }] : []),
  ];

  return (
    <nav className="nav" aria-label="Main">
      {items.map(({ to, label, Icon, end, count }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
          {count > 0 && (
            <span className="nav-count" aria-hidden="true">{count > 9 ? '9+' : count}</span>
          )}
          {count > 0 && <span className="sr-only">, {count} needing attention</span>}
        </NavLink>
      ))}
    </nav>
  );
}
