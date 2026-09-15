import React, { useEffect, useRef, useState } from 'react';
import { subjects } from '../data/timetable';
import { useGradeBook } from '../lib/progress';
import { useStudyLog, weekMinutes, streakDays } from '../lib/study';
import { DEFAULT_COMPONENTS, summarize } from '../lib/grading';
import { Play, Pause, RotateCcw, Coffee, Flame, Plus } from 'lucide-react';

const FOCUS_MIN = 25;
const BREAK_MIN = 5;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.1;
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch { /* no audio */ }
}

export default function Focus() {
  const [log, setLog] = useStudyLog();
  const [book] = useGradeBook();
  const [subject, setSubject] = useState(Object.keys(subjects)[0]);
  const [mode, setMode] = useState('focus');
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const endAt = useRef(null);

  const addSession = (minutes) => setLog(l => [...l, { subject, minutes, at: new Date().toISOString() }]);

  useEffect(() => {
    if (!running) return;
    endAt.current = Date.now() + secondsLeft * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(id);
        setRunning(false);
        beep();
        if (mode === 'focus') {
          addSession(FOCUS_MIN);
          setMode('break'); setSecondsLeft(BREAK_MIN * 60);
        } else {
          setMode('focus'); setSecondsLeft(FOCUS_MIN * 60);
        }
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const reset = () => { setRunning(false); setSecondsLeft((mode === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60); };
  const switchMode = (m) => { setRunning(false); setMode(m); setSecondsLeft((m === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60); };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const total = (mode === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60;
  const pct = ((total - secondsLeft) / total) * 100;

  const { totals, all } = weekMinutes(log);
  const streak = streakDays(log);

  // Suggest where time should go: weakest projected grade, then least studied this week
  const suggestion = Object.keys(subjects)
    .map(code => ({ code, proj: summarize(book[code] || DEFAULT_COMPONENTS).projected, mins: totals[code] || 0 }))
    .sort((a, b) => (a.proj ?? 101) - (b.proj ?? 101) || a.mins - b.mins)[0];

  return (
    <div className="animate-fade-in">
      <header className="mb-4">
        <h1>Focus</h1>
        <p className="text-muted">25 min deep work, 5 min break. Every session is logged.</p>
      </header>

      <div className="card glass" style={{ textAlign: 'center', padding: 25 }}>
        <div className="tabs mb-4" style={{ maxWidth: 260, margin: '0 auto 20px' }}>
          <button className={mode === 'focus' ? 'active' : ''} onClick={() => switchMode('focus')}><Flame size={14} /> Focus</button>
          <button className={mode === 'break' ? 'active' : ''} onClick={() => switchMode('break')}><Coffee size={14} /> Break</button>
        </div>

        <div className="timer-ring" style={{ '--pct': `${pct}%`, '--ring': mode === 'focus' ? 'var(--accent-primary)' : 'var(--success)' }}>
          <div className="timer-inner">
            <div className="timer-time">{mm}:{ss}</div>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{mode === 'focus' ? subjects[subject].short : 'rest your eyes'}</div>
          </div>
        </div>

        <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={running} className="mt-4" style={{ maxWidth: 320, margin: '16px auto 0' }}>
          {Object.entries(subjects).map(([code, s]) => <option key={code} value={code}>{s.title}</option>)}
        </select>

        <div className="mt-4" style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => setRunning(r => !r)} style={{ minWidth: 120 }}>
            {running ? <><Pause size={18} /> Pause</> : <><Play size={18} /> Start</>}
          </button>
          <button className="btn-icon" onClick={reset} title="Reset"><RotateCcw size={18} /></button>
        </div>
        <button className="btn btn-ghost mt-4" style={{ fontSize: '0.8rem' }} onClick={() => addSession(30)}>
          <Plus size={14} /> Log 30 min manually
        </button>
      </div>

      <div className="stat-grid mb-4">
        <div className="card glass stat">
          <span className="stat-label">This week</span>
          <span className="stat-value">{(all / 60).toFixed(1)}h</span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{log.length} sessions total</span>
        </div>
        <div className="card glass stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value">{streak}<span style={{ fontSize: '1rem' }}> days</span></span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>study daily, even 25 min</span>
        </div>
      </div>

      {suggestion && (
        <div className="card glass" style={{ padding: 15, borderLeft: '3px solid var(--warning)' }}>
          <b>Study next:</b> {subjects[suggestion.code].title}
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
            {suggestion.proj != null ? `Lowest projected score (${suggestion.proj.toFixed(0)}%)` : 'No marks entered yet'} · {suggestion.mins} min this week
          </p>
        </div>
      )}

      <h2 className="mb-2" style={{ fontSize: '1.1rem' }}>This week by subject</h2>
      <div className="card glass" style={{ padding: 15 }}>
        {Object.entries(subjects).map(([code, s]) => {
          const m = totals[code] || 0;
          const w = all ? (m / Math.max(...Object.values(totals), 1)) * 100 : 0;
          return (
            <div key={code} className="mb-2">
              <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                <span>{s.title}</span><span className="text-muted">{m} min</span>
              </div>
              <div className="progress"><div style={{ width: `${w}%`, background: s.color }} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
