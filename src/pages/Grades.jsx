import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  ChevronDown, ChevronUp, Plus, Trash2, RotateCcw, UserCheck, UserX,
  AlertTriangle, GraduationCap, CalendarCheck, ClipboardList,
} from 'lucide-react';
import { useClassData } from '../lib/classDataContext';
import { DEFAULT_COMPONENTS, summarize, GRADE_SCALE } from '../lib/grading';
import {
  ATTENDANCE_MIN, useGradeBook, useAttendanceMarks, useCredits, useProfile,
  semesterGpa, attendanceStats, sessionsFor, gradeColor,
} from '../lib/progress';
import { Field, Tabs, EmptyState } from '../components/ui';
import { vGradebook, vCredits, vPrevCgpa, vPrevCredits } from '../lib/validate';

export default function Grades() {
  const [tab, setTab] = useState('grades');

  return (
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">Marks, GPA and attendance</p>
        <h1 className="page-title">Progress</h1>
      </header>

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'grades', label: 'Grades & GPA', icon: GraduationCap },
          { value: 'attendance', label: 'Attendance', icon: CalendarCheck },
        ]}
      />

      <div style={{ marginTop: 'var(--s4)' }}>
        {tab === 'grades' ? <GradesTab /> : <AttendanceTab />}
      </div>
    </div>
  );
}

/* ══ grades ══════════════════════════════════════════════════════════════════ */

function GradesTab() {
  const { subjects } = useClassData();
  const [book, setBook] = useGradeBook();
  const [credits, setCredits] = useCredits();
  const [profile, setProfile] = useProfile();
  const [open, setOpen] = useState(null);

  const sem = semesterGpa(book, credits, subjects);
  const prevCgpaError = vPrevCgpa(profile.prevCgpa);
  const prevCreditsError = vPrevCredits(profile.prevCredits);

  const prevCgpa = Number(profile.prevCgpa);
  const prevCredits = Number(profile.prevCredits);
  const hasPrev = !prevCgpaError && !prevCreditsError && prevCgpa > 0 && prevCredits > 0;

  const cgpa = hasPrev && sem.gpa != null
    ? (prevCgpa * prevCredits + sem.gpa * sem.credits) / (prevCredits + sem.credits)
    : (hasPrev ? prevCgpa : sem.gpa);

  return (
    <div className="stack">
      {/* The numbers below are only as good as the scale they are computed
          against, and that scale is an assumption this app shipped with. Saying
          so once, at the top, is the difference between a useful estimate and a
          number someone plans their semester around. */}
      <div className="alert alert-warning">
        <AlertTriangle size={16} aria-hidden="true" />
        <div className="alert-body">
          <strong className="small">Estimate only. Check it against your handbook.</strong>
          <p className="small" style={{ marginTop: 3 }}>
            This assumes <b>absolute</b> grading on the scale shown at the bottom
            of this page. If your department grades <b>relatively</b>, on a curve,
            your grade depends on how the whole class did and no projection here
            can predict it. The boundaries and the default component weights came
            with this app and have not been checked against an official document.
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <span className="stat-label">Semester GPA</span>
          <span className={`stat-value ${sem.gpa == null ? 'stat-value-empty' : ''}`}>{sem.gpa != null ? sem.gpa.toFixed(2) : '-'}</span>
          <span className="stat-foot">{sem.credits} credit hours graded</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Projected CGPA</span>
          <span className={`stat-value ${cgpa == null ? 'stat-value-empty' : ''}`}>{cgpa != null ? cgpa.toFixed(2) : '-'}</span>
          <span className="stat-foot">{hasPrev ? 'including previous semesters' : 'add your transcript below'}</span>
        </div>
      </div>

      <div className="card">
        <p className="field-label" style={{ marginBottom: 'var(--s3)' }}>From your transcript</p>
        <div className="field-grid">
          <Field label="CGPA so far" error={prevCgpaError} hint="0.00 to 4.00">
            <input
              type="number" inputMode="decimal" step="0.01" min="0" max="4"
              placeholder="3.20"
              value={profile.prevCgpa}
              onChange={(e) => setProfile({ ...profile, prevCgpa: e.target.value })}
            />
          </Field>
          <Field label="Credit hours done" error={prevCreditsError}>
            <input
              type="number" inputMode="numeric" min="0" max="300"
              placeholder="34"
              value={profile.prevCredits}
              onChange={(e) => setProfile({ ...profile, prevCredits: e.target.value })}
            />
          </Field>
        </div>
      </div>

      {Object.keys(subjects).length === 0 && (
        <div className="card"><EmptyState icon={GraduationCap} title="No subjects yet" /></div>
      )}

      {Object.entries(subjects).map(([code, s]) => (
        <SubjectGrades
          key={code}
          code={code}
          subject={s}
          components={book[code] || DEFAULT_COMPONENTS}
          credits={credits[code] ?? s.credits}
          isOpen={open === code}
          onToggleOpen={() => setOpen(open === code ? null : code)}
          onChange={(next) => setBook({ ...book, [code]: next })}
          onCredits={(value) => setCredits({ ...credits, [code]: value })}
        />
      ))}

      <details className="card">
        <summary className="muted small" style={{ cursor: 'pointer' }}>
          Grading scale this app assumes
        </summary>
        <p className="field-hint" style={{ marginTop: 'var(--s2)' }}>
          Unverified. If these boundaries do not match your handbook, every
          letter and GPA on this page is wrong. They live in src/lib/grading.js.
        </p>
        <div className="scale-grid" style={{ marginTop: 'var(--s3)' }}>
          {GRADE_SCALE.map((g) => (
            <span key={g.letter}><b style={{ color: 'var(--text)' }}>{g.letter}</b> {g.min}+ → {g.points.toFixed(2)}</span>
          ))}
        </div>
      </details>
    </div>
  );
}

function SubjectGrades({ code, subject, components, credits, isOpen, onToggleOpen, onChange, onCredits }) {
  const summary = summarize(components);
  const { rows, warning } = vGradebook(components);
  const creditsError = vCredits(credits);
  const rowsInvalid = rows.some((r) => Object.keys(r).length > 0);

  const edit = (index, key, value) =>
    onChange(components.map((c, i) => (i === index ? { ...c, [key]: value } : c)));

  return (
    <div className="card card-accent" style={{ '--stripe': subject.color }}>
      <button
        className="row-between"
        style={{ width: '100%', textAlign: 'left' }}
        onClick={onToggleOpen}
        aria-expanded={isOpen}
      >
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="truncate" style={{ fontWeight: 650 }}>{subject.title}</div>
          <div className="muted tiny" style={{ marginTop: 3 }}>
            {code} · {credits} cr · {summary.weightDone}% of the marks graded
            {rowsInvalid && <span style={{ color: 'var(--danger)' }}> · check the numbers</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 780, color: gradeColor(summary.grade), lineHeight: 1.1 }}>
            {summary.grade ? summary.grade.letter : '-'}
          </div>
          <div className="muted tiny nums">
            {summary.projected != null ? `${summary.projected.toFixed(1)}%` : 'no marks'}
          </div>
        </div>
        {isOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>

      {isOpen && (
        <div style={{ marginTop: 'var(--s4)' }}>
          <div className="comp-row comp-head" style={{ marginBottom: 6 }}>
            <span>Component</span><span>Weight</span><span>Got</span><span>Of</span><span />
          </div>

          <div className="stack-sm">
            {components.map((component, i) => {
              const rowErrors = rows[i];
              return (
                <div key={i}>
                  <div className="comp-row">
                    <input
                      value={component.name}
                      onChange={(e) => edit(i, 'name', e.target.value)}
                      aria-label={`Component ${i + 1} name`}
                      aria-invalid={rowErrors.name ? 'true' : undefined}
                      maxLength={40}
                    />
                    <input
                      type="number" inputMode="decimal" min="0" max="100"
                      value={component.weight}
                      onChange={(e) => edit(i, 'weight', e.target.value)}
                      aria-label={`${component.name} weight percent`}
                      aria-invalid={rowErrors.weight ? 'true' : undefined}
                    />
                    <input
                      type="number" inputMode="decimal" min="0" placeholder="-"
                      value={component.obtained}
                      onChange={(e) => edit(i, 'obtained', e.target.value)}
                      aria-label={`${component.name} marks obtained`}
                      aria-invalid={rowErrors.obtained ? 'true' : undefined}
                    />
                    <input
                      type="number" inputMode="decimal" min="0" placeholder="-"
                      value={component.total}
                      onChange={(e) => edit(i, 'total', e.target.value)}
                      aria-label={`${component.name} marks total`}
                      aria-invalid={rowErrors.total ? 'true' : undefined}
                    />
                    <button
                      className="btn-icon btn-icon-sm btn-icon-danger"
                      onClick={() => onChange(components.filter((_, j) => j !== i))}
                      aria-label={`Remove ${component.name}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {Object.values(rowErrors).filter(Boolean).map((message) => (
                    <p key={message} className="comp-row-error">{message}</p>
                  ))}
                </div>
              );
            })}
          </div>

          {warning && (
            <p className="field-warn" style={{ marginTop: 'var(--s3)' }}>
              <AlertTriangle size={13} aria-hidden="true" />{warning}
            </p>
          )}

          <div className="row-wrap" style={{ marginTop: 'var(--s4)', gap: 'var(--s2)' }}>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => onChange([...components, { name: 'New component', weight: 0, obtained: '', total: '' }])}
            >
              <Plus size={14} aria-hidden="true" /> Component
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => onChange(DEFAULT_COMPONENTS)}>
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
            <label className="row small muted" style={{ gap: 6, marginLeft: 'auto' }}>
              Credits
              <input
                type="number" min="0" max="6"
                style={{ width: 58, minHeight: 34, padding: '4px 8px' }}
                value={credits}
                onChange={(e) => onCredits(e.target.value)}
                aria-invalid={creditsError ? 'true' : undefined}
                aria-label={`${code} credit hours`}
              />
            </label>
          </div>
          {creditsError && <p className="field-error" style={{ marginTop: 6 }}>{creditsError}</p>}

          {summary.remaining > 0 && summary.weightDone > 0 && !rowsInvalid && (
            <div style={{ marginTop: 'var(--s5)' }}>
              <p className="muted small" style={{ marginBottom: 'var(--s2)' }}>
                You have <b style={{ color: 'var(--text)' }}>{summary.secured.toFixed(1)}</b> of 100 locked in.
                To finish with…
              </p>
              <div className="need-grid">
                {summary.needed.filter((g) => g.need <= 100 && g.need > -50).slice(0, 6).map((g) => (
                  <div key={g.letter} className={`need-chip ${g.need <= 0 ? 'secured' : ''}`}>
                    <b>{g.letter}</b>
                    {g.need <= 0 ? 'already safe' : `${Math.ceil(g.need)}% of what is left`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══ attendance ══════════════════════════════════════════════════════════════ */

function AttendanceTab() {
  const { subjects, sessions, weeklySessions, SEMESTER_WEEKS } = useClassData();
  const [marks, setMarks] = useAttendanceMarks();
  const [open, setOpen] = useState(null);

  const setMark = (sessionId, value) => {
    setMarks((current) => {
      const next = { ...current };
      // Tapping the same answer again clears it, so a mis-tap is one tap to fix.
      if (next[sessionId] === value) delete next[sessionId];
      else next[sessionId] = value;
      return next;
    });
  };

  const anySessions = sessions.length > 0;
  const totalUnmarked = Object.keys(subjects).reduce((sum, code) =>
    sum + attendanceStats(marks, sessions, code, weeklySessions, SEMESTER_WEEKS).unmarked, 0);

  if (!anySessions) {
    return (
      <div className="card">
        <EmptyState icon={ClipboardList} title="No classes recorded yet">
          Your class representative marks which classes actually went ahead.
          Once they do, each one appears here for you to mark yourself present
          or absent. Nobody has to guess how many classes there were.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="stack">
      {totalUnmarked > 0 && (
        <div className="alert alert-warning">
          <AlertTriangle size={16} aria-hidden="true" />
          <p className="alert-body small">
            {totalUnmarked} recorded {totalUnmarked === 1 ? 'class is' : 'classes are'} still
            unanswered. Your percentage only counts classes you have answered for,
            so it is not the whole picture until you clear these.
          </p>
        </div>
      )}

      {Object.entries(subjects).map(([code, s]) => {
        const stats = attendanceStats(marks, sessions, code, weeklySessions, SEMESTER_WEEKS);
        const tone = stats.atRisk ? 'var(--danger)'
          : stats.skipsLeft <= 2 ? 'var(--warning)' : 'var(--success)';
        const isOpen = open === code;
        const list = sessionsFor(sessions, marks, code);

        return (
          <div key={code} className="card card-accent" style={{ '--stripe': s.color }}>
            <button
              className="row-between"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => setOpen(isOpen ? null : code)}
              aria-expanded={isOpen}
            >
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontWeight: 560 }}>{s.title}</div>
                <div className="muted tiny nums" style={{ marginTop: 3 }}>
                  {stats.present} of {stats.answered} attended
                  {stats.unmarked > 0 && ` · ${stats.unmarked} unanswered`}
                  {stats.cancelled > 0 && ` · ${stats.cancelled} cancelled`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="nums" style={{ fontSize: '1.3rem', fontWeight: 660, color: tone, lineHeight: 1.1 }}>
                  {stats.pct != null ? `${Math.round(stats.pct)}%` : '-'}
                </div>
                <div className="tiny" style={{ color: stats.skipsLeft <= 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {stats.answered === 0 ? 'not marked yet'
                    : stats.skipsLeft > 0 ? `${stats.skipsLeft} safe ${stats.skipsLeft === 1 ? 'skip' : 'skips'} left`
                    : 'no skips left'}
                </div>
              </div>
              {isOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            </button>

            <div className="progress" style={{ marginTop: 'var(--s3)' }}>
              <div style={{ width: `${stats.pct ?? 0}%`, background: tone }} />
            </div>

            {isOpen && (
              <div className="stack-sm" style={{ marginTop: 'var(--s4)' }}>
                {list.length === 0 && (
                  <p className="field-hint">No classes recorded for this subject yet.</p>
                )}
                {list.map((session) => {
                  const cancelled = session.status === 'cancelled';
                  return (
                    <div key={session.id} className="card card-tight">
                      <div className="row-between" style={{ marginBottom: cancelled ? 0 : 'var(--s2)' }}>
                        <span className="small nums">
                          {format(new Date(`${session.date}T00:00:00`), 'EEE, d MMM')}
                        </span>
                        {cancelled
                          ? <span className="badge badge-warning">Cancelled</span>
                          : session.mark
                            ? <span className={`badge ${session.mark === 'present' ? 'badge-success' : 'badge-danger'}`}>
                                {session.mark === 'present' ? 'Present' : 'Absent'}
                              </span>
                            : <span className="badge">Not answered</span>}
                      </div>
                      {!cancelled && (
                        <div className="row" style={{ gap: 'var(--s2)' }}>
                          <button
                            className={`btn btn-sm grow ${session.mark === 'present' ? 'btn-success' : 'btn-secondary'}`}
                            onClick={() => setMark(session.id, 'present')}
                            aria-pressed={session.mark === 'present'}
                          >
                            <UserCheck size={14} aria-hidden="true" /> Present
                          </button>
                          <button
                            className={`btn btn-sm grow ${session.mark === 'absent' ? 'btn-danger' : 'btn-secondary'}`}
                            onClick={() => setMark(session.id, 'absent')}
                            aria-pressed={session.mark === 'absent'}
                          >
                            <UserX size={14} aria-hidden="true" /> Absent
                          </button>
                        </div>
                      )}
                      {session.note && <p className="field-hint" style={{ marginTop: 6 }}>{session.note}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <p className="field-hint center">
        Percentages count only the classes you have answered for. Below{' '}
        {ATTENDANCE_MIN}% you can be barred from sitting the final.
      </p>
    </div>
  );
}
