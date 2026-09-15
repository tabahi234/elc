import React from 'react';
import { timetable, subjects } from '../data/timetable';
import { Clock, MapPin, User, Wifi } from 'lucide-react';
import { format, parse, getDay } from 'date-fns';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmt = (t) => format(parse(t, 'HH:mm', new Date()), 'h:mm a');

export default function Timetable() {
  const today = getDay(new Date());
  const grouped = timetable.reduce((acc, c) => ((acc[c.day] ||= []).push(c), acc), {});
  Object.values(grouped).forEach(list => list.sort((a, b) => a.start.localeCompare(b.start)));

  return (
    <div className="animate-fade-in">
      <header className="mb-4">
        <h1>Weekly Timetable</h1>
        <p className="text-muted">Fall 2026 · FA25-ELC-C</p>
      </header>

      {DAYS.map((dayName, index) => {
        const classes = grouped[index];
        if (!classes) return null;
        return (
          <div key={index} className="mb-4">
            <h2 className="mb-2" style={{ color: index === today ? 'var(--accent-secondary)' : 'var(--accent-primary)', fontSize: '1.1rem', paddingLeft: 10 }}>
              {dayName}{index === today && <span className="badge badge-success" style={{ marginLeft: 8, fontSize: '0.65rem' }}>Today</span>}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {classes.map((cls, i) => {
                const s = subjects[cls.code];
                return (
                  <div key={i} className="card glass" style={{ marginBottom: 0, padding: 15, borderLeft: `3px solid ${s?.color}` }}>
                    <div className="flex-between mb-2">
                      <h3 style={{ fontSize: '1rem', margin: 0 }}>{s?.title}</h3>
                      <span className={`badge ${cls.type === 'LAB' ? 'badge-warning' : 'badge-success'}`}>{cls.type}</span>
                    </div>
                    <div className="text-muted mb-2" style={{ fontSize: '0.8rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{cls.code}</span>·<User size={12} /><span>{s?.teacher}</span>
                    </div>
                    <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                      <div className="icon-row"><Clock size={14} /><span>{fmt(cls.start)} – {fmt(cls.end)}</span></div>
                      <div className="icon-row" style={{ color: 'var(--warning)', fontWeight: 600 }}><MapPin size={14} /><span>{cls.room}</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="card glass" style={{ padding: 15, borderLeft: `3px solid ${subjects.HUM162.color}` }}>
        <div className="flex-between mb-2">
          <h3 style={{ fontSize: '1rem', margin: 0 }}>{subjects.HUM162.title}</h3>
          <span className="badge badge-primary" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Wifi size={11} /> Online</span>
        </div>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>HUM162 · {subjects.HUM162.teacher} · check the LMS for lecture timings</p>
      </div>

      <p className="text-muted text-center mt-4" style={{ fontSize: '0.8rem' }}>No on-campus classes on Tuesday, Friday or Sunday — use them for revision.</p>
    </div>
  );
}
