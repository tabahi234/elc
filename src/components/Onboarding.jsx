import React, { useEffect, useRef, useState } from 'react';
import {
  CalendarDays, FolderOpen, Users, Timer, GraduationCap, Megaphone,
  ChevronRight, ChevronLeft, Check,
} from 'lucide-react';

/**
 * A once-only walkthrough. Whether it has been seen is stored in the student's
 * Firestore settings document, not localStorage, so it follows them to a second
 * device instead of reappearing on each one.
 *
 * Every step names a real screen and what to do there. A tour that only says
 * "welcome" and "get started" is worse than none.
 */
const STEPS = [
  {
    icon: CalendarDays,
    title: 'Your week, always current',
    body: 'Classes tells you what is next, which room, and who teaches it. If your representative cancels a class, moves it, or adds an extra one, that date changes here for everyone. A cancelled class is struck through rather than hidden, so you can see it is off instead of wondering where it went.',
  },
  {
    icon: Megaphone,
    title: 'Notices, not just deadlines',
    body: 'Bring a calculator, the lab report format changed, the quiz moved. Your representative posts these to the dashboard with a date they expire on, so the board clears itself and what is left on it is still true.',
  },
  {
    icon: FolderOpen,
    title: 'Course material in two taps',
    body: 'Open Classes, switch to Subjects, and tap any course. Its Google Drive folder and Google Classroom sit right there, along with when it meets and what is coming up for it.',
  },
  {
    icon: Users,
    title: 'Class deadlines and your own',
    body: 'Anything your representative announces appears on your list automatically, marked Class. You can tick it off. Some arrive before the date is fixed and say so until it is. If you want to reword one, move the date, or add your own notes, tap the copy icon to make a private version you control, and you will be told if the class version changes later.',
  },
  {
    icon: Timer,
    title: 'Focus, and an honest log',
    body: 'A 25 minute timer that logs the session against a subject. It suggests whichever subject has your weakest projection and the least time this week. Logged the wrong one? Tap Undo on the confirmation, or remove it from the list of today’s sessions at any point.',
  },
  {
    icon: GraduationCap,
    title: 'Know where you stand',
    body: 'Enter marks as you get them and Progress projects your GPA and CGPA, then tells you what you need on what is left to reach each grade. It is an estimate from your own numbers, so check anything that counts.',
  },
];

export default function Onboarding({ onDone }) {
  const [step, setStep] = useState(0);
  const panel = useRef(null);
  const last = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  // Lock the page behind it and take focus, the same as a dialog.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (e) => {
      if (e.key === 'ArrowRight' && !last) setStep((s) => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [step, last]);

  return (
    <div className="tour-backdrop" role="dialog" aria-modal="true" aria-label="What this app does">
      <div className="tour" ref={panel} tabIndex={-1}>
        <div className="tour-body">
          <div className="tour-icon"><Icon size={26} aria-hidden="true" /></div>
          {/* aria-live so a screen reader announces each step, not just the first */}
          <div aria-live="polite">
            <h2 className="tour-title">{current.title}</h2>
            <p className="tour-text">{current.body}</p>
          </div>
        </div>

        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s.title} className={`tour-dot ${i === step ? 'on' : ''}`} />
            ))}
          </div>
          <p className="sr-only">Step {step + 1} of {STEPS.length}</p>

          <div className="row" style={{ gap: 'var(--s2)' }}>
            {step > 0 ? (
              <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
                <ChevronLeft size={16} aria-hidden="true" /> Back
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={onDone}>Skip</button>
            )}
            <button
              className="btn btn-primary grow"
              onClick={() => (last ? onDone() : setStep((s) => s + 1))}
            >
              {last
                ? <><Check size={16} aria-hidden="true" /> Start using it</>
                : <>Next <ChevronRight size={16} aria-hidden="true" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
