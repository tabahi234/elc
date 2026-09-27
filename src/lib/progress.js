import { useClassData } from './classDataContext';
import { useUserDoc } from './storage';
import { DEFAULT_COMPONENTS, summarize, gpa } from './grading';

export function useGradeBook() {
  return useUserDoc('gradebook', {});
}

export function useCredits() {
  const { subjects } = useClassData();
  return useUserDoc('credits', Object.fromEntries(Object.entries(subjects).map(([c, s]) => [c, s.credits])));
}

export function useProfile() {
  return useUserDoc('profile', { prevCgpa: '', prevCredits: '' });
}

export function semesterGpa(book, credits, subjects) {
  const entries = Object.keys(subjects).map((code) => {
    const s = summarize(book[code] || DEFAULT_COMPONENTS);
    return { points: s.grade ? s.grade.points : null, credits: Number(credits[code]) || 0 };
  });
  return gpa(entries);
}

export function gradeColor(grade) {
  if (!grade) return 'var(--text-muted)';
  if (grade.points >= 3.67) return 'var(--success)';
  if (grade.points >= 3.0) return 'var(--accent)';
  if (grade.points >= 2.0) return 'var(--warning)';
  return 'var(--danger)';
}
