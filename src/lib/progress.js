import { useCallback, useMemo } from 'react';
import { useClassData } from './classDataContext';
import { useUserDoc } from './storage';
import { DEFAULT_COMPONENTS, summarize, gpa } from './grading';

export function useGradeBook() {
  return useUserDoc('gradebook', {});
}

/**
 * Credit hours per subject: the class's published figure, with whatever the
 * student changed themselves laid on top.
 *
 * This used to seed the saved document with a copy of every subject's credits
 * as they stood the first time the page opened. A subject the CR added after
 * that had no entry, counted as 0 credits, and silently dropped out of the
 * semester GPA. Only the student's own edits are stored now, so a new subject
 * or a corrected credit figure from the CR shows up by itself.
 */
export function useCredits() {
  const { subjects } = useClassData();
  const [saved, setSaved, loaded] = useUserDoc('credits', {});
  const credits = useMemo(() => ({
    ...Object.fromEntries(Object.entries(subjects).map(([c, s]) => [c, s.credits])),
    ...saved,
  }), [subjects, saved]);
  const setCredit = useCallback(
    (code, value) => setSaved((current) => ({ ...current, [code]: value })),
    [setSaved]
  );
  return [credits, setCredit, loaded];
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
