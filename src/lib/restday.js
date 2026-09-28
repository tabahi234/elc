import { format } from 'date-fns';
import { daysFromToday } from './validate';
import { upcomingExams } from './exams';

/**
 * What to say on a day with no classes.
 *
 * The app used to answer "when is my next class" with "Wednesday" and stop
 * there, which is true and useless: on a Tuesday with nothing timetabled, the
 * question a student is actually asking is what to do with the day. A free day
 * is the largest block of study time anyone gets in a week, and it is the one
 * most reliably spent not studying.
 *
 * So the suggestion is ranked by what is genuinely closest to going wrong,
 * and every branch names something real — a paper, a deadline, a subject — so
 * it cannot degrade into "have a productive day!". If there is nothing to
 * point at, it says so plainly rather than inventing urgency.
 */
export function restDayAdvice({ tasks = [], exams = [], subjects = {}, weekTotals = {} } = {}) {
  const name = (code) => subjects[code]?.short || code;
  const pending = tasks.filter((t) => !t.completed && t.dueDate);

  // 1. An exam inside a fortnight beats everything. You cannot hand one in late.
  const exam = upcomingExams(exams, 14)[0];
  if (exam) {
    const away = daysFromToday(exam.date);
    return {
      headline: away === 0
        ? `${name(exam.code)} ${exam.kind.toLowerCase()} is today`
        : `${exam.kind} in ${name(exam.code)} ${away === 1 ? 'is tomorrow' : `is in ${away} days`}`,
      detail: away === 0
        ? `Room ${exam.room}, ${prettyTime(exam.start)}.`
        : 'A day with no classes is the best revision time you will get before it.',
      to: '/timetable',
      action: 'See the exam schedule',
    };
  }

  // 2. Something already late. Sitting on it through a free day is the worst
  //    possible use of one.
  const overdue = pending.filter((t) => daysFromToday(t.dueDate) < 0);
  if (overdue.length) {
    return {
      headline: `${overdue.length} ${overdue.length === 1 ? 'deadline is' : 'deadlines are'} overdue`,
      detail: overdue.slice(0, 2).map((t) => `${name(t.subject)}: ${t.title}`).join(' · '),
      to: '/tasks',
      action: 'Clear them',
    };
  }

  // 3. Work due this week, in date order. Getting ahead today is the whole
  //    point of the day being free.
  const soon = pending
    .filter((t) => {
      const away = daysFromToday(t.dueDate);
      return away >= 0 && away <= 7;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (soon.length) {
    const next = soon[0];
    const away = daysFromToday(next.dueDate);
    return {
      headline: `Get ahead on ${next.title}`,
      detail: `${name(next.subject)} · due ${away === 0 ? 'today' : away === 1 ? 'tomorrow' : format(new Date(`${next.dueDate}T00:00:00`), 'EEEE')}`
        + (soon.length > 1 ? `, and ${soon.length - 1} more this week` : ''),
      to: '/tasks',
      action: 'Open deadlines',
    };
  }

  // 4. Nothing is chasing you. The honest suggestion is the subject you have
  //    given the least time to this week, which is the one that quietly turns
  //    into a problem later.
  const neglected = leastStudied(subjects, weekTotals);
  if (neglected) {
    const mins = weekTotals[neglected] || 0;
    return {
      headline: `Good day for ${name(neglected)}`,
      detail: mins === 0
        ? 'Nothing logged against it this week. Start a session and it counts.'
        : `Only ${Math.round(mins / 60 * 10) / 10}h logged against it this week.`,
      to: '/focus',
      action: 'Start a session',
    };
  }

  return {
    headline: 'Nothing due, nothing timetabled',
    detail: 'A clear day. Revision now is the cheapest it ever gets.',
    to: '/focus',
    action: 'Start a session',
  };
}

/** The subject with the fewest minutes logged this week. Ties go alphabetically. */
function leastStudied(subjects, weekTotals) {
  const codes = Object.keys(subjects);
  if (!codes.length) return null;
  return codes.reduce((worst, code) => {
    const mine = weekTotals[code] || 0;
    const best = weekTotals[worst] || 0;
    return mine < best || (mine === best && code < worst) ? code : worst;
  }, codes[0]);
}

const prettyTime = (hhmm) =>
  (hhmm ? format(new Date(`2000-01-01T${hhmm}`), 'h:mm a') : '');
