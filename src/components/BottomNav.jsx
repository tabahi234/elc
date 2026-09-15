import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Calendar, CheckSquare, GraduationCap, Timer } from 'lucide-react';

const items = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/timetable', label: 'Classes', Icon: Calendar },
  { to: '/tasks', label: 'Tasks', Icon: CheckSquare },
  { to: '/grades', label: 'Grades', Icon: GraduationCap },
  { to: '/focus', label: 'Focus', Icon: Timer },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav glass">
      {items.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Icon size={22} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
