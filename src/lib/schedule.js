import { format, getDay, parse, isBefore } from 'date-fns';
import { todayIso, daysFromToday } from './validate';

/**
 * The timetable is a weekly pattern. Reality is not.
 *
 * Everything here answers one question: what actually happens on a given date,
 * once the CR's one-off changes are applied to the recurring pattern. Every
 * screen that shows classes goes through this, so the dashboard, the week view
 * and the alerts can never disagree about whether a class is on.
 */

const isoOffset = (days, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return format(d, 'yyyy-MM-dd');
};

/**
 * The classes on one date, in time order, with changes folded in.
 *
 * A cancelled class is returned rather than dropped: a student who was
 * expecting it needs to see that it is off, not find a hole where it was.
 */
export function classesOn(date, timetable, changes = []) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return [];
  const weekday = getDay(parsed);

  const onThisDate = changes.filter((c) => c.date === date);
  const bySlot = new Map(onThisDate.filter((c) => c.slotId).map((c) => [c.slotId, c]));

  const regular = timetable
    .filter((slot) => slot.day === weekday)
    .map((slot) => {
      const change = bySlot.get(slot.id);
      if (!change) return { ...slot, change: null };
      if (change.status === 'cancelled') return { ...slot, change, cancelled: true };
      // Moved: the change carries the replacement time and place, and the
      // original is kept so the card can say what it used to be.
      return {
        ...slot,
        start: change.start || slot.start,
        end: change.end || slot.end,
        room: change.room || slot.room,
        type: change.type || slot.type,
        movedFrom: { start: slot.start, end: slot.end, room: slot.room },
        change,
      };
    });

  const extras = onThisDate
    .filter((c) => c.status === 'extra')
    .map((c) => ({
      // Prefixed so it can never collide with a real timetable document id.
      id: `extra-${c.id}`,
      day: weekday,
      code: c.code,
      start: c.start,
      end: c.end,
      room: c.room,
      type: c.type,
      extra: true,
      change: c,
    }));

  return [...regular, ...extras]
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

/**
 * The next class that is actually going to happen, looking forward day by day
 * so a cancellation pushes the answer along instead of sending a student to an
 * empty room.
 */
export function nextClass(now, timetable, changes = [], lookaheadDays = 14) {
  if (!timetable.length) return null;

  for (let i = 0; i <= lookaheadDays; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    const date = format(day, 'yyyy-MM-dd');

    for (const slot of classesOn(date, timetable, changes)) {
      if (slot.cancelled) continue;
      // Today only: anything that has already finished is not next.
      if (i === 0 && !isBefore(now, parse(slot.end, 'HH:mm', now))) continue;
      return { ...slot, date, daysAway: i };
    }
  }
  return null;
}

/**
 * The classes on a date that have not finished yet.
 *
 * A class that is over drops out rather than greying out. A dimmed row is
 * still a row, and by mid-afternoon a "rest of today" list made mostly of
 * things that already happened is the opposite of what it is for.
 *
 * A cancelled class stays until its slot has passed, because "do not come in"
 * is news right up to the moment it stops being news.
 */
export function remainingOn(now, classes = []) {
  return classes.filter((c) => {
    const end = parse(String(c.end), 'HH:mm', now);
    return !Number.isNaN(end.getTime()) && isBefore(now, end);
  });
}

/**
 * Which of three things today is, for a screen that has to say one sentence
 * about it. Kept here so the dashboard cannot drift from the week view.
 *
 *   'unknown'  nothing published yet, or still loading
 *   'free'     nothing was ever on, or the CR cleared the whole day
 *   'done'     everything that was on is behind you
 *   'ahead'    there is still a class to come
 *
 * 'free' and 'done' are deliberately separate. "Nothing was on today" and
 * "you have done all of it" are different facts about a day and deserve
 * different words; collapsing them is how an app ends up congratulating
 * somebody for a public holiday.
 */
export function todayShape({ now = new Date(), timetable = [], classesToday = [], ready = true } = {}) {
  if (!ready || timetable.length === 0) return 'unknown';
  if (classesToday.every((c) => c.cancelled)) return 'free';
  return remainingOn(now, classesToday).length === 0 ? 'done' : 'ahead';
}

/** Changes from today forward, soonest first. Past ones are history nobody needs. */
export function upcomingChanges(changes, days = 21) {
  const from = todayIso();
  const to = isoOffset(days);
  return changes
    .filter((c) => c.date >= from && c.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.start).localeCompare(String(b.start)));
}

/** Whether a change is still ahead of the class. */
export const changeIsPast = (change) => change.date < todayIso();

/**
 * One line describing a change, used by the CR's list, the student's week view,
 * the dashboard alerts and the share text. Written once so all four agree.
 */
export function describeChange(change, subjects = {}, timetable = []) {
  const name = subjects[change.code]?.short || change.code;
  const slot = timetable.find((s) => s.id === change.slotId);
  const when = format(new Date(`${change.date}T00:00:00`), 'EEE d MMM');
  const time = (t) => (t ? format(parse(t, 'HH:mm', new Date()), 'h:mm a') : '');

  if (change.status === 'cancelled') {
    return {
      headline: `${name} is cancelled on ${when}`,
      detail: slot ? `Was ${time(slot.start)} in ${slot.room}` : null,
      tone: 'danger',
    };
  }
  if (change.status === 'moved') {
    const movedTime = slot && (slot.start !== change.start || slot.end !== change.end);
    const movedRoom = slot && slot.room !== change.room;
    let detail = null;
    if (movedTime && movedRoom) detail = `Was ${time(slot.start)} in ${slot.room}`;
    else if (movedTime) detail = `Was ${time(slot.start)} to ${time(slot.end)}`;
    else if (movedRoom) detail = `Was in ${slot.room}`;
    return {
      headline: `${name} on ${when} is now ${time(change.start)} in ${change.room}`,
      detail,
      tone: 'warning',
    };
  }
  return {
    headline: `Extra ${name} class on ${when}, ${time(change.start)} in ${change.room}`,
    detail: change.type === 'LAB' ? 'Lab session' : null,
    tone: 'accent',
  };
}

/** Whole days until a change, so callers do not each re-derive it. */
export const daysUntilChange = (change) => daysFromToday(change.date);
