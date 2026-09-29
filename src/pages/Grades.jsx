import React, { useState } from 'react';
import {
  ChevronDown, ChevronUp, Plus, Trash2, RotateCcw, AlertTriangle, GraduationCap,
} from 'lucide-react';
import { useClassData } from '../lib/classDataContext';
import { DEFAULT_COMPONENTS, summarize, GRADE_SCALE } from '../lib/grading';
import { useGradeBook, useCredits, useProfile, semesterGpa, gradeColor } from '../lib/progress';
import { Field, EmptyState } from '../components/ui';
import { vGradebook, vCredits, vPrevCgpa, vPrevCredits } from '../lib/validate';

export default function Grades() {
  const { subjects } = useClassData();
  const [book, setBook] = useGradeBook();
  const [credits, setCredit] = useCredits();
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
    <div className="animate-in">
      <header className="page-header">
        <p className="page-eyebrow">Marks and GPA</p>
        <h1 className="page-title">Progress</h1>
      </header>

      <div className="stack">
        {/* The numbers below are only as good as the scale they are computed
            against, and that scale is an assumption this app shipped with.
            Saying so once, at the top, is the difference between a useful
            estimate and a number someone plans their semester around. */}
        <div className="alert alert-warning">
          <AlertTriangle size={16} aria-hidden="true" />
          <div className="alert-body">
            <strong className="small">Estimate only. Check it against your handbook.</strong>
            <p className="small" style={{ marginTop: 3 }}>
              This assumes <b>absolute</b> grading on the scale at the bottom of this
              page. If your department grades <b>relatively</b>, on a curve, your grade
              depends on how the whole class did and no projection here can predict it.
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
                onChange={(e) => { const v = e.target.value; setProfile((cur) => ({ ...cur, prevCgpa: v })); }}
              />
            </Field>
            <Field label="Credit hours done" error={prevCreditsError}>
              <input
                type="number" inputMode="numeric" min="0" max="300"
                placeholder="34"
                value={profile.prevCredits}
                onChange={(e) => { const v = e.target.value; setProfile((cur) => ({ ...cur, prevCredits: v })); }}
              />
            </Field>
          </div>
        </div>

        {Object.keys(subjects).length === 0 && (
          <div className="card">
            <EmptyState icon={GraduationCap} title="No subjects yet">
              Your marks appear here once the subject list is published.
            </EmptyState>
          </div>
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
            onChange={(next) => setBook((cur) => ({ ...cur, [code]: next }))}
            onCredits={(value) => setCredit(code, value)}
          />
        ))}

        <details className="card">
          <summary className="muted small" style={{ cursor: 'pointer' }}>
            Grading scale this app assumes
          </summary>
          <p className="field-hint" style={{ marginTop: 'var(--s2)' }}>
            If these boundaries do not match your handbook, every letter and GPA on
            this page is wrong. Ask your CR to have them corrected.
          </p>
          <div className="scale-grid" style={{ marginTop: 'var(--s3)' }}>
            {GRADE_SCALE.map((g) => (
              <span key={g.letter}><b style={{ color: 'var(--text)' }}>{g.letter}</b> {g.min}+ → {g.points.toFixed(2)}</span>
            ))}
          </div>
        </details>
      </div>
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
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
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
                      className="comp-name"
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
