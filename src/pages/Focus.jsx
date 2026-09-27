import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Coffee, Flame, Plus, Target, ShieldAlert } from 'lucide-react';
import { useClassData } from '../lib/classDataContext';
import { useGradeBook } from '../lib/progress';
import { useStudyLog, weekMinutes, todayMinutes, streakDays, trimLog } from '../lib/study';
import { DEFAULT_COMPONENTS, summarize } from '../lib/grading';
import { useToast } from '../lib/toastContext';
import { LIMITS, vStudySession } from '../lib/validate';
import { Field, Sheet, Tabs } from '../components/ui';

const FOCUS_MIN = 25;
const BREAK_MIN = 5;
const QUICK_LOG = [15, 30, 45, 60];

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.1;
    osc.start(); osc.stop(ctx.currentTime + 0.4);
  } catch { /* audio blocked until the user interacts, not worth reporting */ }
}

export default function Focus() {
  const { subjects } = useClassData();
  const [log, setLog] = useStudyLog();
  const [book] = useGradeBook();
  const toast = useToast();

  const codes = Object.keys(subjects);
  const [subject, setSubject] = useState(codes[0] || '');
  const [mode, setMode] = useState('focus');
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const endAt = useRef(null);

  // The timer's callback fires long after render, so it must read the current
  // subject and log rather than the ones captured when it started.
  const latest = useRef({ subject, log });
  latest.current = { subject, log };

  // If the class list loads after this page, adopt the first real subject.
  useEffect(() => {
    if (!subject && codes.length) setSubject(codes[0]);
  }, [codes, subject]);

  /**
   * The one place study time is written. Every path (the timer finishing, a
   * quick-log chip, the custom entry) goes through here, so the daily caps
   * cannot be dodged by picking a different button.
   */
  const logSession = useCallback((minutes, { silent = false } = {}) => {
    const { subject: code, log: currentLog } = latest.current;
    const entry = { subject: code, minutes: Math.round(minutes), at: new Date().toISOString() };
    const { error, warning } = vStudySession(currentLog, entry);

    if (error) { toast.error(error); return false; }
    setLog((existing) => trimLog([...existing, entry]));
    if (warning) toast.warning(warning);
    else if (!silent) toast.success(`${entry.minutes} min on ${subjects[code]?.short || code} logged.`);
    return true;
  }, [setLog, toast, subjects]);

  useEffect(() => {
    if (!running) return;
    endAt.current = Date.now() + secondsLeft * 1000;

    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left > 0) return;

      clearInterval(id);
      setRunning(false);
      beep();
      if (mode === 'focus') {
        logSession(FOCUS_MIN);
        setMode('break');
        setSecondsLeft(BREAK_MIN * 60);
      } else {
        setMode('focus');
        setSecondsLeft(FOCUS_MIN * 60);
      }
    }, 500);

    return () => clearInterval(id);
    // secondsLeft is deliberately excluded: it changes every tick, and the
    // deadline is already pinned in endAt when the timer starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode, logSession]);

  const reset = () => { setRunning(false); setSecondsLeft((mode === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60); };
  const switchMode = (next) => { setRunning(false); setMode(next); setSecondsLeft((next === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60); };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const total = (mode === 'focus' ? FOCUS_MIN : BREAK_MIN) * 60;
  const pct = ((total - secondsLeft) / total) * 100;

  const { totals, all: weekAll } = weekMinutes(log);
  const today = todayMinutes(log);
  const streak = streakDays(log);
  const todaySubject = today.bySubject[subject] || 0;
  const capPct = Math.min(100, (todaySubject / LIMITS.subjectDay.max) * 100);
  const nearCap = todaySubject >= LIMITS.subjectDay.warn;

  const suggestion = codes
    .map((code) => ({
      code,
      projected: summarize(book[code] || DEFAULT_COMPONENTS).projected,
      minutes: totals[code] || 0,
    }))
    .sort((a, b) => (a.projected ?? 101) - (b.projected ?? 101) || a.minutes - b.minutes)[0];

  const current = subjects[subject];

  return (
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">Pomodoro · 25 on, 5 off</p>
        <h1 className="page-title">Focus</h1>
      </header>

      <div className="card" style={{ textAlign: 'center' }}>
        <Tabs
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'focus', label: 'Focus', icon: Flame },
            { value: 'break', label: 'Break', icon: Coffee },
          ]}
        />

        <div
          className="timer-ring"
          style={{ '--pct': `${pct}%`, '--ring': mode === 'focus' ? 'var(--accent)' : 'var(--success)', margin: 'var(--s5) auto' }}
          role="timer"
          aria-live="off"
        >
          <div className="timer-inner">
            <div className="timer-time">{mm}:{ss}</div>
            <div className="muted small truncate" style={{ maxWidth: '80%' }}>
              {mode === 'focus' ? (current?.short || 'pick a subject') : 'rest your eyes'}
            </div>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{running ? 'Timer running' : 'Timer paused'}</p>

        <div style={{ maxWidth: 320, margin: '0 auto' }}>
          <Field label="Studying">
            <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={running}>
              {codes.length === 0 && <option value="">No subjects yet</option>}
              {Object.entries(subjects).map(([code, s]) => (
                <option key={code} value={code}>{s.title}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--s4)' }}>
          <button
            className="btn btn-primary"
            style={{ minWidth: 132 }}
            onClick={() => setRunning((r) => !r)}
            disabled={!subject}
          >
            {running ? <><Pause size={18} aria-hidden="true" /> Pause</> : <><Play size={18} aria-hidden="true" /> Start</>}
          </button>
          <button className="btn-icon" onClick={reset} aria-label="Reset timer"><RotateCcw size={18} aria-hidden="true" /></button>
        </div>

        {/* The daily cap is shown before it is hit, so being refused later is
            never a surprise. */}
        {subject && (
          <div style={{ marginTop: 'var(--s5)', textAlign: 'left' }}>
            <div className="row-between small" style={{ marginBottom: 5 }}>
              <span className="muted">{current?.short} today</span>
              <span className={`nums ${nearCap ? '' : 'muted'}`} style={{ color: nearCap ? 'var(--warning)' : undefined }}>
                {todaySubject} / {LIMITS.subjectDay.max} min
              </span>
            </div>
            <div className="progress">
              <div style={{ width: `${capPct}%`, background: nearCap ? 'var(--warning)' : current?.color }} />
            </div>
          </div>
        )}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Log time you already did</h2>
        </div>
        <div className="card">
          <div className="row-wrap">
            {QUICK_LOG.map((mins) => (
              <button key={mins} className="btn btn-sm btn-secondary" onClick={() => logSession(mins)} disabled={!subject}>
                +{mins} min
              </button>
            ))}
            <button className="btn btn-sm btn-ghost" onClick={() => setManualOpen(true)} disabled={!subject}>
              <Plus size={14} aria-hidden="true" /> Custom
            </button>
          </div>
          <p className="field-hint row" style={{ marginTop: 'var(--s3)', alignItems: 'flex-start', gap: 6 }}>
            <ShieldAlert size={13} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} />
            Capped at {LIMITS.session.max} minutes a block, {LIMITS.subjectDay.max / 60} hours per subject
            per day and {LIMITS.dayTotal.max / 60} hours overall. A log you cannot trust makes the
            GPA projection and the "study next" suggestion worthless.
          </p>
        </div>
      </section>

      <div className="stat-grid" style={{ marginTop: 'var(--s4)' }}>
        <div className="card stat">
          <span className="stat-label">This week</span>
          <span className="stat-value">{(weekAll / 60).toFixed(1)}<span className="stat-unit">h</span></span>
          <span className="stat-foot">{log.length} sessions all term</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value">{streak}<span className="stat-unit"> days</span></span>
          <span className="stat-foot">{today.all > 0 ? `${today.all} min today` : 'nothing logged today'}</span>
        </div>
      </div>

      {suggestion && (
        <div className="alert alert-warning" style={{ marginTop: 'var(--s4)' }}>
          <Target size={16} aria-hidden="true" />
          <div className="alert-body">
            <strong>Study next: {subjects[suggestion.code]?.title}</strong>
            <p className="small" style={{ marginTop: 2 }}>
              {suggestion.projected != null
                ? `Lowest projected score (${suggestion.projected.toFixed(0)}%)`
                : 'No marks entered yet'} · {suggestion.minutes} min this week
            </p>
          </div>
        </div>
      )}

      <section className="section">
        <div className="section-head"><h2 className="section-title">This week by subject</h2></div>
        <div className="card stack-sm">
          {Object.entries(subjects).map(([code, s]) => {
            const mins = totals[code] || 0;
            const peak = Math.max(...Object.values(totals), 1);
            return (
              <div key={code}>
                <div className="row-between small" style={{ marginBottom: 4 }}>
                  <span className="truncate">{s.short}</span>
                  <span className="muted nums">{mins} min</span>
                </div>
                <div className="progress">
                  <div style={{ width: `${weekAll ? (mins / peak) * 100 : 0}%`, background: s.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {manualOpen && (
        <ManualLogSheet
          subjectName={current?.title}
          onClose={() => setManualOpen(false)}
          onSave={(mins) => { if (logSession(mins)) setManualOpen(false); }}
        />
      )}
    </div>
  );
}

function ManualLogSheet({ subjectName, onClose, onSave }) {
  const [minutes, setMinutes] = useState('');
  const [touched, setTouched] = useState(false);

  const value = Number(minutes);
  let error = null;
  if (minutes === '') error = 'Enter the minutes.';
  else if (!Number.isInteger(value)) error = 'Whole minutes only.';
  else if (value < LIMITS.session.min) error = `At least ${LIMITS.session.min} minutes.`;
  else if (value > LIMITS.session.max) error = `One block maxes out at ${LIMITS.session.max} minutes.`;

  return (
    <Sheet
      open onClose={onClose}
      title="Log a session"
      subtitle={subjectName}
      footer={
        <>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary" type="button"
            onClick={() => { setTouched(true); if (!error) onSave(value); }}
          >
            Log it
          </button>
        </>
      }
    >
      <Field
        label="Minutes studied" required
        error={touched ? error : undefined}
        hint={`Between ${LIMITS.session.min} and ${LIMITS.session.max} for one block.`}
      >
        <input
          type="number" inputMode="numeric"
          min={LIMITS.session.min} max={LIMITS.session.max} step={5}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="45"
        />
      </Field>
    </Sheet>
  );
}
