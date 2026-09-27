import { startOfWeek, isAfter, format } from 'date-fns';
import { useUserDoc } from './storage';

/** The study log: [{ subject, minutes, at }] where `at` is an ISO timestamp. */
export function useStudyLog() {
  return useUserDoc('studylog', []);
}

export function weekMinutes(log) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const totals = {};
  let all = 0;
  for (const s of log) {
    if (!isAfter(new Date(s.at), weekStart)) continue;
    const mins = Number(s.minutes) || 0;
    totals[s.subject] = (totals[s.subject] || 0) + mins;
    all += mins;
  }
  return { totals, all };
}

/** Minutes logged today, overall and per subject. These are what the caps are checked against. */
export function todayMinutes(log) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const bySubject = {};
  let all = 0;
  for (const s of log) {
    if (String(s.at).slice(0, 10) !== today) continue;
    const mins = Number(s.minutes) || 0;
    bySubject[s.subject] = (bySubject[s.subject] || 0) + mins;
    all += mins;
  }
  return { bySubject, all };
}

export function streakDays(log) {
  const days = new Set(log.map((s) => String(s.at).slice(0, 10)));
  let streak = 0;
  const d = new Date();
  // Today counts if studied; otherwise the streak is measured from yesterday,
  // so it doesn't read as broken before the day is over.
  if (!days.has(format(d, 'yyyy-MM-dd'))) d.setDate(d.getDate() - 1);
  while (days.has(format(d, 'yyyy-MM-dd'))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/**
 * Keeps the log from growing without bound. The security rules cap the array
 * at 2000 entries; trimming at 1200 leaves headroom and still covers several
 * semesters of sessions.
 */
export const MAX_LOG_ENTRIES = 1200;
export function trimLog(log) {
  return log.length <= MAX_LOG_ENTRIES ? log : log.slice(-MAX_LOG_ENTRIES);
}
