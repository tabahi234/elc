import { subjects, weeklySessions, SEMESTER_WEEKS } from '../data/timetable';
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
  return useUserDoc('credits', Object.fromEntries(Object.entries(subjects).map(([c, s]) => [c, s.credits])));
}
export function useProfile() {
  return useUserDoc('profile', { prevCgpa: '', prevCredits: '' });
}

export function semesterGpa(book, credits) {
  const entries = Object.keys(subjects).map(code => {
    const s = summarize(book[code] || DEFAULT_COMPONENTS);
    return { points: s.grade ? s.grade.points : null, credits: Number(credits[code]) || 0 };
  });
  return gpa(entries);
}

export function attendanceStats(att, code) {
  const a = att[code] || { attended: 0, held: 0 };
  const pct = a.held ? (a.attended / a.held) * 100 : null;
  const totalSessions = weeklySessions[code] * SEMESTER_WEEKS;
  const maxMisses = Math.floor(totalSessions * (1 - ATTENDANCE_MIN / 100));
  const missed = a.held - a.attended;
  return { ...a, pct, missed, skipsLeft: maxMisses - missed, totalSessions };
}

export function gradeColor(grade) {
  if (!grade) return 'var(--text-secondary)';
  if (grade.points >= 3.67) return 'var(--success)';
  if (grade.points >= 3.0) return 'var(--accent-primary)';
  if (grade.points >= 2.0) return 'var(--warning)';
  return 'var(--danger)';
}
