import { useClassData } from './classDataContext';
import { useUserDoc } from './storage';
import { DEFAULT_COMPONENTS, summarize, gpa } from './grading';

export const ATTENDANCE_MIN = 80; // COMSATS: below 80% you're barred from the final

export function useGradeBook() {
  return useUserDoc('gradebook', {});
}
export function useAttendance() {
  return useUserDoc('attendance', {});
}
export function useCredits() {
  const { subjects } = useClassData();
  return useUserDoc('credits', Object.fromEntries(Object.entries(subjects).map(([c, s]) => [c, s.credits])));
}
export function useProfile() {
  return useUserDoc('profile', { prevCgpa: '', prevCredits: '' });
}

export function semesterGpa(book, credits, subjects) {
  const entries = Object.keys(subjects).map(code => {
    const s = summarize(book[code] || DEFAULT_COMPONENTS);
    return { points: s.grade ? s.grade.points : null, credits: Number(credits[code]) || 0 };
  });
  return gpa(entries);
}

/**
 * Per-student marks against the sessions the CR confirmed: a map of
 * { [sessionId]: 'present' | 'absent' }. Private to the student.
 */
export function useAttendanceMarks() {
  return useUserDoc('attendanceMarks', {});
}

/**
 * Attendance for one subject.
 *
 * The old version asked the student to keep their own count of classes held,
 * which is the one number they cannot know. Miss a tap and every percentage
 * after it is wrong, silently. The denominator now comes from sessions the CR
 * recorded as actually held, so the student only supplies the one fact they do
 * know: whether they were there.
 *
 * @param marks     { [sessionId]: 'present' | 'absent' }
 * @param sessions  every session document, any subject
 */
export function attendanceStats(marks, sessions, code, weeklySessions = {}, SEMESTER_WEEKS = 16) {
  const held = sessions.filter((s) => s.code === code && s.status !== 'cancelled');
  const cancelled = sessions.filter((s) => s.code === code && s.status === 'cancelled').length;

  let present = 0;
  let absent = 0;
  for (const session of held) {
    const mark = marks?.[session.id];
    if (mark === 'present') present++;
    else if (mark === 'absent') absent++;
  }
  const unmarked = held.length - present - absent;

  // Percentage counts only what the student has actually answered for, so an
  // unmarked class does not quietly read as an absence.
  const answered = present + absent;
  const pct = answered ? (present / answered) * 100 : null;

  // Planned total for the term, used for "how many can I still miss".
  const planned = Math.max((weeklySessions[code] || 1) * SEMESTER_WEEKS, held.length);
  const maxMisses = Math.floor(planned * (1 - ATTENDANCE_MIN / 100));

  return {
    heldCount: held.length,
    held,
    cancelled,
    present,
    absent,
    unmarked,
    answered,
    pct,
    planned,
    skipsLeft: maxMisses - absent,
    atRisk: pct != null && pct < ATTENDANCE_MIN,
  };
}

/** Sessions for a subject, newest first, with this student's mark attached. */
export function sessionsFor(sessions, marks, code) {
  return sessions
    .filter((s) => s.code === code)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((s) => ({ ...s, mark: marks?.[s.id] ?? null }));
}

export function gradeColor(grade) {
  if (!grade) return 'var(--text-muted)';
  if (grade.points >= 3.67) return 'var(--success)';
  if (grade.points >= 3.0) return 'var(--accent)';
  if (grade.points >= 2.0) return 'var(--warning)';
  return 'var(--danger)';
}
