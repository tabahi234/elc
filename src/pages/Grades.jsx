import React, { useState } from 'react';
import { subjects } from '../data/timetable';
import { DEFAULT_COMPONENTS, summarize, GRADE_SCALE } from '../lib/grading';
import { ATTENDANCE_MIN, useGradeBook, useAttendance, useCredits, useProfile, semesterGpa, attendanceStats, gradeColor } from '../lib/progress';
import { ChevronDown, ChevronUp, Plus, Trash2, RotateCcw, UserCheck, UserX } from 'lucide-react';

export default function Grades() {
  const [tab, setTab] = useState('grades');
  return (
    <div className="animate-fade-in">
      <header className="mb-4">
        <h1>Progress</h1>
        <p className="text-muted">Track marks, project your GPA, protect your attendance</p>
      </header>
      <div className="tabs mb-4">
        <button className={tab === 'grades' ? 'active' : ''} onClick={() => setTab('grades')}>Grades & GPA</button>
        <button className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}>Attendance</button>
      </div>
      {tab === 'grades' ? <GradesTab /> : <AttendanceTab />}
    </div>
  );
}

function GradesTab() {
  const [book, setBook] = useGradeBook();
  const [credits, setCredits] = useCredits();
  const [profile, setProfile] = useProfile();
  const [open, setOpen] = useState(null);

  const sem = semesterGpa(book, credits);
  const prevC = Number(profile.prevCgpa), prevCr = Number(profile.prevCredits);
  const hasPrev = prevC > 0 && prevCr > 0;
  const cgpa = hasPrev && sem.gpa != null
    ? (prevC * prevCr + sem.gpa * sem.credits) / (prevCr + sem.credits)
    : (hasPrev ? prevC : sem.gpa);

  const updateSubject = (code, comps) => setBook({ ...book, [code]: comps });

  return (
    <>
      <div className="stat-grid mb-4">
        <div className="card glass stat">
          <span className="stat-label">Semester GPA</span>
          <span className="stat-value">{sem.gpa != null ? sem.gpa.toFixed(2) : '—'}</span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{sem.credits} credit hrs graded</span>
        </div>
        <div className="card glass stat">
          <span className="stat-label">Projected CGPA</span>
          <span className="stat-value">{cgpa != null ? cgpa.toFixed(2) : '—'}</span>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>{hasPrev ? 'incl. previous semesters' : 'enter previous CGPA below'}</span>
        </div>
      </div>

      <div className="card glass" style={{ padding: 15 }}>
        <p className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>Previous semesters (from your transcript)</p>
        <div className="form-row">
          <input type="number" step="0.01" min="0" max="4" placeholder="CGPA so far (e.g. 3.20)"
            value={profile.prevCgpa} onChange={(e) => setProfile({ ...profile, prevCgpa: e.target.value })} />
          <input type="number" min="0" placeholder="Credit hrs done (e.g. 34)"
            value={profile.prevCredits} onChange={(e) => setProfile({ ...profile, prevCredits: e.target.value })} />
        </div>
      </div>

      {Object.entries(subjects).map(([code, s]) => {
        const comps = book[code] || DEFAULT_COMPONENTS;
        const sum = summarize(comps);
        const isOpen = open === code;
        return (
          <div key={code} className="card glass" style={{ padding: 15, borderLeft: `3px solid ${s.color}` }}>
            <div className="flex-between" onClick={() => setOpen(isOpen ? null : code)} style={{ cursor: 'pointer' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{s.title}</div>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {code} · {credits[code]} cr · {sum.weightDone}% of marks graded
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="grade-summary">
                  <div className="grade-letter" style={{ color: gradeColor(sum.grade) }}>{sum.grade ? sum.grade.letter : '—'}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>{sum.projected != null ? `${sum.projected.toFixed(1)}% proj.` : 'no marks yet'}</div>
                </div>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
            </div>

            {isOpen && (
              <div className="mt-4">
                <div className="comp-row comp-head">
                  <span>Component</span><span>Weight%</span><span>Got</span><span>Out of</span><span></span>
                </div>
                {comps.map((c, i) => (
                  <div className="comp-row" key={i}>
                    <input value={c.name} onChange={(e) => updateSubject(code, edit(comps, i, 'name', e.target.value))} />
                    <input type="number" inputMode="decimal" value={c.weight} onChange={(e) => updateSubject(code, edit(comps, i, 'weight', e.target.value))} />
                    <input type="number" inputMode="decimal" placeholder="–" value={c.obtained} onChange={(e) => updateSubject(code, edit(comps, i, 'obtained', e.target.value))} />
                    <input type="number" inputMode="decimal" placeholder="–" value={c.total} onChange={(e) => updateSubject(code, edit(comps, i, 'total', e.target.value))} />
                    <button className="btn-icon" style={{ background: 'transparent', color: 'var(--danger)' }}
                      onClick={() => updateSubject(code, comps.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                  </div>
                ))}
                {sum.totalWeight !== 100 && (
                  <p style={{ color: 'var(--warning)', fontSize: '0.8rem', marginTop: 6 }}>Weights add up to {sum.totalWeight}%, not 100%.</p>
                )}
                <div className="flex-between mt-2" style={{ gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => updateSubject(code, [...comps, { name: 'New', weight: 0, obtained: '', total: '' }])}><Plus size={14} /> Component</button>
                  <button className="btn btn-ghost" onClick={() => updateSubject(code, DEFAULT_COMPONENTS)}><RotateCcw size={14} /> Reset</button>
                  <label className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Credits <input type="number" min="0" max="6" style={{ width: 56, padding: '6px 8px' }} value={credits[code]}
                      onChange={(e) => setCredits({ ...credits, [code]: e.target.value })} />
                  </label>
                </div>

                {sum.remaining > 0 && sum.weightDone > 0 && (
                  <div className="mt-4">
                    <p className="text-muted mb-2" style={{ fontSize: '0.85rem' }}>
                      Secured <b style={{ color: 'var(--text-primary)' }}>{sum.secured.toFixed(1)}</b>/100 so far. To finish with…
                    </p>
                    <div className="need-grid">
                      {sum.needed.filter(g => g.need <= 100 && g.need > -50).slice(0, 6).map(g => (
                        <div key={g.letter} className="need-chip" style={{ opacity: g.need <= 0 ? 0.6 : 1 }}>
                          <b>{g.letter}</b>
                          <span>{g.need <= 0 ? 'secured ✓' : `${Math.ceil(g.need)}% on the rest`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <details className="card glass" style={{ padding: 15 }}>
        <summary className="text-muted" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Grading scale used (COMSATS absolute)</summary>
        <div className="scale-grid mt-2">
          {GRADE_SCALE.map(g => <span key={g.letter}><b>{g.letter}</b> {g.min}+ → {g.points.toFixed(2)}</span>)}
        </div>
      </details>
    </>
  );
}

function edit(comps, i, key, value) {
  return comps.map((c, j) => (j === i ? { ...c, [key]: value } : c));
}

function AttendanceTab() {
  const [att, setAtt] = useAttendance();

  const mark = (code, present) => {
    const cur = att[code] || { attended: 0, held: 0 };
    setAtt({ ...att, [code]: { attended: cur.attended + (present ? 1 : 0), held: cur.held + 1 } });
  };
  const undo = (code) => {
    const cur = att[code];
    if (!cur || !cur.held) return;
    // we don't track which entry was last, so drop one held and clamp attended
    setAtt({ ...att, [code]: { held: cur.held - 1, attended: Math.min(cur.attended, cur.held - 1) } });
  };

  return (
    <>
      <p className="text-muted mb-4" style={{ fontSize: '0.85rem' }}>
        Tap <b>Present</b> or <b>Absent</b> after each class. Below {ATTENDANCE_MIN}% you can be barred from the final — the fastest way to wreck a CGPA.
      </p>
      {Object.entries(subjects).map(([code, s]) => {
        const st = attendanceStats(att, code);
        const danger = st.pct != null && st.pct < ATTENDANCE_MIN;
        const warn = !danger && st.skipsLeft <= 2;
        return (
          <div key={code} className="card glass" style={{ padding: 15, borderLeft: `3px solid ${s.color}` }}>
            <div className="flex-between mb-2">
              <div>
                <div style={{ fontWeight: 700 }}>{s.title}</div>
                <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {st.attended}/{st.held} attended · {st.totalSessions} sessions expected
                </div>
              </div>
              <div className="grade-summary">
                <div className="grade-letter" style={{ color: danger ? 'var(--danger)' : warn ? 'var(--warning)' : 'var(--success)' }}>
                  {st.pct != null ? `${Math.round(st.pct)}%` : '—'}
                </div>
                <div style={{ fontSize: '0.75rem', color: st.skipsLeft <= 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                  {st.skipsLeft > 0 ? `${st.skipsLeft} safe skips left` : 'no skips left!'}
                </div>
              </div>
            </div>
            <div className="progress"><div style={{ width: `${st.pct ?? 0}%`, background: danger ? 'var(--danger)' : 'var(--success)' }} /></div>
            <div className="form-row mt-2">
              <button className="btn btn-ghost" style={{ color: 'var(--success)' }} onClick={() => mark(code, true)}><UserCheck size={16} /> Present</button>
              <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => mark(code, false)}><UserX size={16} /> Absent</button>
              <button className="btn-icon" title="Undo last" onClick={() => undo(code)}><RotateCcw size={16} /></button>
            </div>
          </div>
        );
      })}
    </>
  );
}
