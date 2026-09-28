import { format, parse, isBefore } from 'date-fns';
import { todayIso, daysFromToday, EXAM_KINDS } from './validate';

/**
 * Exams: sessionals, finals and lab exams.
 *
 * They are deliberately not deadlines and not tasks. A deadline is something
 * you work at and then hand in, so it has a tick box and a sense of being
 * outstanding. An exam is a place and a time: you turn up, it happens, it is
 * over. Ticking one off means nothing, and leaving one sitting in a "pending"
 * list two weeks after you sat it is worse than nothing.
 *
 * So exams get their own collection, their own screen, and no completion state
 * anywhere. What decides whether an exam is still relevant is the calendar.
 */

// The two sessionals are the mid-term exams. The list itself lives with the
// other vocabulary in validate.js; it is re-exported here so a screen that
// only cares about exams has one place to import from.
export { EXAM_KINDS };

/** Exams from today forward, soonest first. Time breaks ties within a day. */
export function upcomingExams(exams = [], withinDays = null) {
  const from = todayIso();
  return exams
    .filter((e) => {
      if (!e.date || e.date < from) return false;
      if (withinDays == null) return true;
      const away = daysFromToday(e.date);
      return away != null && away <= withinDays;
    })
    .sort(byWhen);
}

/** Exams already sat, most recent first. */
export function pastExams(exams = []) {
  const from = todayIso();
  return exams.filter((e) => e.date && e.date < from).sort(byWhen).reverse();
}

const byWhen = (a, b) =>
  String(a.date).localeCompare(String(b.date))
  || String(a.start).localeCompare(String(b.start));

/** Everything sat on one date, in time order. */
export const examsOn = (date, exams = []) =>
  exams.filter((e) => e.date === date).sort(byWhen);

/**
 * The next exam that has not finished yet.
 *
 * Today's paper stays "next" until the end time passes, so somebody checking
 * the room from the corridor outside still gets the right answer.
 */
export function nextExam(now, exams = []) {
  const today = format(now, 'yyyy-MM-dd');
  return upcomingExams(exams).find((e) => {
    if (e.date > today) return true;
    return isBefore(now, parse(e.end || '23:59', 'HH:mm', now));
  }) ?? null;
}

/** Exams grouped by date, in order, ready to render as day sections. */
export function groupByDate(exams = []) {
  const days = new Map();
  for (const exam of [...exams].sort(byWhen)) {
    if (!days.has(exam.date)) days.set(exam.date, []);
    days.get(exam.date).push(exam);
  }
  return [...days.entries()].map(([date, sittings]) => ({ date, sittings }));
}

/**
 * Whether the weekly timetable is suspended right now.
 *
 * Deliberately a switch somebody turns on rather than something inferred from
 * the exam dates. Classes carry on straight through the sessionals and stop
 * for the finals, and no rule the app could invent gets that right for every
 * semester. The dates only narrow when the switch applies, so a CR can set the
 * exam week up in advance and it starts and ends on its own.
 */
export function examModeActive(config, today = todayIso()) {
  if (!config?.active) return false;
  if (config.from && today < config.from) return false;
  if (config.to && today > config.to) return false;
  return true;
}

/** Plain-language span for the exam-mode banner, e.g. "6–17 Oct". */
export function examModeDates(config) {
  const day = (iso) => format(new Date(`${iso}T00:00:00`), 'd MMM');
  if (config?.from && config?.to) return `${day(config.from)} – ${day(config.to)}`;
  if (config?.from) return `from ${day(config.from)}`;
  if (config?.to) return `until ${day(config.to)}`;
  return null;
}

/**
 * How an exam reads on a card: when it is, and how close.
 *
 * "In 3 days" is the number a student actually wants; the date alone makes
 * them count on their fingers.
 */
export function examCountdown(exam) {
  const away = daysFromToday(exam?.date);
  if (away == null) return null;
  if (away < 0) return { text: 'Done', tone: '' };
  if (away === 0) return { text: 'Today', tone: 'badge-danger' };
  if (away === 1) return { text: 'Tomorrow', tone: 'badge-danger' };
  if (away <= 3) return { text: `In ${away} days`, tone: 'badge-warning' };
  if (away <= 7) return { text: `In ${away} days`, tone: 'badge-accent' };
  return { text: format(new Date(`${exam.date}T00:00:00`), 'EEE d MMM'), tone: '' };
}

/** One line of plain text, for pasting into the class group. */
export function examShareText(exam, subjects = {}) {
  const subject = subjects[exam.code];
  const when = format(new Date(`${exam.date}T00:00:00`), 'EEEE d MMMM');
  const time = (t) => (t ? format(parse(t, 'HH:mm', new Date()), 'h:mm a') : '');
  const lines = [
    `${exam.kind}: ${subject?.short || exam.code} (${exam.code})`,
    `${when}, ${time(exam.start)} to ${time(exam.end)}`,
    `Room ${exam.room}${exam.seat ? `, seat ${exam.seat}` : ''}`,
  ];
  if (exam.note) lines.push('', exam.note);
  return lines.join('\n');
}
