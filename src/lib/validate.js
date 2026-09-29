/**
 * Input validation. One place, used by every form.
 *
 * Two jobs, and they are different:
 *
 *  1. SECURITY. Stopping a classmate from writing junk into shared class data.
 *     That cannot be done here. Anyone can bypass this file from the browser
 *     console. It is enforced in firestore.rules. The checks here just give a
 *     readable error before the round trip.
 *
 *  2. DATA INTEGRITY. Stopping an honest user from entering something
 *     impossible ("I studied 400 minutes of ODE today", "I got 90/50"). This
 *     is the right place for that, because the data is the user's own and the
 *     only thing at stake is whether their GPA projection means anything.
 *
 * Every validator returns null when the value is fine, or a short human
 * sentence when it is not. Nothing throws.
 */

import { format } from 'date-fns';

// ── limits ───────────────────────────────────────────────────────────────────
export const LIMITS = {
  // Study logging. A 400-minute block on one subject in one day is not
  // studying, it is a typo or a stuck timer. Either way the streak and the
  // "study next" suggestion become meaningless, so it is refused.
  session:      { min: 5,  max: 240 },   // one logged block
  subjectDay:   { warn: 240, max: 360 }, // per subject, per day
  dayTotal:     { warn: 600, max: 720 }, // all subjects, per day

  title:        { min: 3,  max: 120 },
  note:         { max: 500 },
  room:         { min: 1,  max: 24 },
  teacher:      { max: 80 },
  subjectTitle: { min: 2,  max: 80 },
  subjectShort: { min: 1,  max: 24 },

  credits:      { min: 0,  max: 6 },
  weight:       { min: 0,  max: 100 },
  marksTotal:   { min: 0.5, max: 1000 },
  prevCgpa:     { min: 0,  max: 4 },
  prevCredits:  { min: 0,  max: 300 },

  // Timetable slots
  slotMinutes:  { min: 30, max: 300 },
  // A paper. Shorter than a class at the bottom end (a 20-minute quiz is a
  // real thing) and longer at the top (a three-hour final).
  examMinutes:  { min: 15, max: 240 },
  dayStart:     '06:00',
  dayEnd:       '23:00',

  // How far a due date may sit from today, in days
  dueWindow:    { past: 365, future: 365 },
};

export const TASK_TYPES = ['Assignment', 'Quiz', 'Mid', 'Final', 'Lab', 'Project', 'Presentation'];
export const SLOT_TYPES = ['Lecture', 'LAB', 'Tutorial', 'Online'];
// Mirrored exactly in firestore.rules. Named the way this university names
// them — mids, not sessionals — so a student cross-checking a notice board
// sees the same words. There is one 'Mid' rather than a numbered pair: each
// entry carries its own date and subject, so two mid-terms are simply two
// entries, and a list that offers "Mid II" to a course with one mid is a list
// that invites the wrong answer.
export const EXAM_KINDS = ['Mid', 'Final', 'Lab exam', 'Quiz'];

/**
 * Types that are no longer offered but still exist in the database.
 *
 * 'Sessional' was what mids used to be called here. Records written under it
 * are still perfectly valid — they are somebody's real quiz from last month —
 * so they stay readable, editable and correctly treated as events. They are
 * just not on any menu any more, so no new one can be created.
 */
export const LEGACY_TASK_TYPES = ['Sessional'];
export const ALL_TASK_TYPES = [...TASK_TYPES, ...LEGACY_TASK_TYPES];

/**
 * The type list to show in a form, with whatever the record already says
 * folded in.
 *
 * Without this, opening an old 'Sessional' deadline would show a dropdown that
 * does not contain its own value: the browser silently falls back to the first
 * option, and saving quietly retypes the record as an Assignment.
 */
export const typeOptions = (current) =>
  (current && !TASK_TYPES.includes(current) ? [...TASK_TYPES, current] : TASK_TYPES);

/**
 * The types that are sat rather than handed in.
 *
 * A quiz is not a to-do. You cannot start it early, hand it in late, or tick
 * it off: it happens on one day, at one time, and then it is over. Treating it
 * as a task gave every student a checkbox that meant nothing and a "pending"
 * entry that stayed pending for the rest of the semester unless they went and
 * lied to it. Anything in this list is shown as an event and loses its tick
 * box; the calendar decides when it stops being relevant.
 */
export const EVENT_TYPES = ['Quiz', 'Mid', 'Sessional', 'Final'];
export const isEventType = (type) => EVENT_TYPES.includes(type);

/** An event whose date has passed. Nothing to do about it either way. */
export const eventIsOver = (task) =>
  isEventType(task?.type) && Boolean(task?.dueDate) && daysFromToday(task.dueDate) < 0;

// ── small helpers ────────────────────────────────────────────────────────────
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SUBJECT_CODE = /^[A-Z]{2,4}\d{3}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// Control characters and zero-width joiners: invisible, and a classic way to
// spoof a title that looks identical to another one.
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const INVISIBLE = new RegExp("[\u0000-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]", "g");

export const todayIso = () => format(new Date(), 'yyyy-MM-dd');

/** Strip invisible characters and collapse runs of whitespace. */
export function clean(value) {
  return String(value ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const isFiniteNumber = (v) => v !== '' && v != null && Number.isFinite(Number(v));

/**
 * The calendar day, on this phone's clock, that a timestamp falls on.
 *
 * Study sessions are stored with toISOString(), which is UTC. Slicing the
 * first ten characters off that gives the UTC date, so in Pakistan (UTC+5)
 * anything logged between midnight and 5 am landed on the previous day: it
 * missed "today", broke the streak, and escaped the daily caps.
 */
export function localDay(value) {
  const s = String(value ?? '');
  if (ISO_DATE.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : format(d, 'yyyy-MM-dd');
}

/** Whole days from today to `iso`. Negative = in the past. */
export function daysFromToday(iso) {
  if (!ISO_DATE.test(String(iso))) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const then = new Date(`${iso}T00:00:00`);
  return Math.round((then - today) / 86_400_000);
}

// ── text ─────────────────────────────────────────────────────────────────────
export function vText(value, { min = 1, max = 200, label = 'This field' } = {}) {
  const v = clean(value);
  if (!v) return `${label} is required.`;
  if (v.length < min) return `${label} needs at least ${min} characters.`;
  if (v.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

export function vOptionalText(value, { max = 500, label = 'This field' } = {}) {
  const v = clean(value);
  if (v.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
}

// ── links ────────────────────────────────────────────────────────────────────
// Only https, only the hosts we expect. This blocks javascript: and data: URLs
// (which would be a real XSS hole the moment one is rendered into an href) and
// look-alike hosts like drive.google.com.evil.tld.
const LINK_HOSTS = {
  drive:     { hosts: ['drive.google.com', 'docs.google.com'], label: 'Google Drive' },
  classroom: { hosts: ['classroom.google.com'],                label: 'Google Classroom' },
};

export function vLink(value, kind) {
  if (value != null && typeof value !== 'string') return 'That is not a valid link.';
  if (typeof value === 'string' && /[\s\\]/.test(value)) return 'Links cannot contain spaces or backslashes.';
  const v = clean(value);
  if (!v) return null; // clearing a link is always allowed
  const spec = LINK_HOSTS[kind];
  if (!spec) return 'Unknown link type.';
  let url;
  try { url = new URL(v); } catch { return 'That is not a valid link.'; }
  if (url.protocol !== 'https:') return 'Links must start with https://';
  if (url.username || url.password || url.port) return 'Use a link without login details or a custom port.';
  if (!spec.hosts.includes(url.hostname)) {
    return `${spec.label} links must be on ${spec.hosts.join(' or ')}.`;
  }
  if (v.length > 500) return 'That link is too long.';
  return null;
}

/**
 * Guard for rendering. Returns the URL only if it is still safe to put in an
 * href, otherwise null. Old rows written before these rules existed, or a row
 * someone slipped past them, get dropped rather than rendered.
 */
export function safeLink(value, kind) {
  return value && !vLink(value, kind) ? clean(value) : null;
}

// ── dates and times ──────────────────────────────────────────────────────────
export function vDueDate(value, { required = true } = {}) {
  const v = clean(value);
  if (!v) return required ? 'Pick a due date.' : null;
  if (!ISO_DATE.test(v)) return 'Use a real date.';
  const parsed = new Date(`${v}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || format(parsed, 'yyyy-MM-dd') !== v) return 'Use a real date.';
  const d = daysFromToday(v);
  if (d == null || Number.isNaN(new Date(`${v}T00:00:00`).getTime())) return 'Use a real date.';
  if (d < -LIMITS.dueWindow.past) return 'That date is over a year ago.';
  if (d > LIMITS.dueWindow.future) return 'That date is over a year away.';
  return null;
}

/** Not an error, just a nudge shown under the field. */
export function dueDateHint(value) {
  const d = daysFromToday(clean(value));
  if (d == null) return null;
  if (d < 0) return `That is ${-d} day${-d === 1 ? '' : 's'} in the past.`;
  if (d === 0) return 'Due today. Everyone gets an alert straight away.';
  if (d > 180) return 'That is more than six months away. Is the year right?';
  return null;
}

export function vTime(value, { required = false, label = 'Time' } = {}) {
  const v = clean(value);
  if (!v) return required ? `${label} is required.` : null;
  if (!HHMM.test(v)) return `${label} must look like 14:30.`;
  return null;
}

// ── study sessions ───────────────────────────────────────────────────────────
/**
 * The core "don't let me log nonsense" check.
 *
 * @param log      existing entries: [{ subject, minutes, at }]
 * @param entry    the one being added: { subject, minutes, at }
 * @returns { error, warning } where error blocks the save and warning does not.
 */
export function vStudySession(log, { subject, minutes, at }) {
  const mins = Number(minutes);
  const { session, subjectDay, dayTotal } = LIMITS;

  if (!subject) return { error: 'Pick a subject first.' };
  if (!isFiniteNumber(minutes) || !Number.isInteger(mins)) {
    return { error: 'Enter the minutes as a whole number.' };
  }
  if (mins < session.min) return { error: `Log at least ${session.min} minutes. Anything shorter is noise.` };
  if (mins > session.max) {
    return { error: `One block maxes out at ${session.max} minutes (${session.max / 60} hours). Split a longer stretch into separate sessions.` };
  }

  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return { error: 'That timestamp is not valid.' };
  // A minute of slack for clock skew between the device and the entry.
  if (when.getTime() > Date.now() + 60_000) return { error: 'You cannot log study time in the future.' };

  // Totals for the same calendar day, including the new entry.
  const key = localDay(at);
  let sameSubject = mins;
  let sameDay = mins;
  for (const s of log) {
    if (localDay(s.at) !== key) continue;
    const m = Number(s.minutes) || 0;
    sameDay += m;
    if (s.subject === subject) sameSubject += m;
  }

  if (sameSubject > subjectDay.max) {
    return {
      error: `That would put ${Math.round(sameSubject)} minutes on one subject today, over the ${subjectDay.max / 60}-hour daily cap. Either the timer ran on, or this belongs on another day.`,
    };
  }
  if (sameDay > dayTotal.max) {
    return {
      error: `That would make ${(sameDay / 60).toFixed(1)} hours of study today. The cap is ${dayTotal.max / 60} hours, so the numbers stay believable.`,
    };
  }

  if (sameSubject > subjectDay.warn) {
    return { warning: `${Math.round(sameSubject / 60 * 10) / 10}h on one subject today. Take a real break.` };
  }
  if (sameDay > dayTotal.warn) {
    return { warning: `${(sameDay / 60).toFixed(1)}h logged today across everything. Sleep counts too.` };
  }
  return {};
}

// ── marks ────────────────────────────────────────────────────────────────────
/** Validates one gradebook row. Returns a map of field → message. */
export function vComponent({ name, weight, obtained, total }) {
  const errors = {};
  const nameError = vText(name, { min: 1, max: 40, label: 'Component name' });
  if (nameError) errors.name = nameError;

  if (weight !== '' && weight != null) {
    const w = Number(weight);
    if (!isFiniteNumber(weight)) errors.weight = 'Weight must be a number.';
    else if (w < LIMITS.weight.min || w > LIMITS.weight.max) errors.weight = 'Weight is a percentage: 0 to 100.';
  }

  const hasObtained = obtained !== '' && obtained != null;
  const hasTotal = total !== '' && total != null;

  if (hasTotal) {
    const t = Number(total);
    if (!isFiniteNumber(total)) errors.total = 'Total must be a number.';
    else if (t < LIMITS.marksTotal.min) errors.total = 'Total must be more than zero.';
    else if (t > LIMITS.marksTotal.max) errors.total = `Total looks too big (max ${LIMITS.marksTotal.max}).`;
  }

  if (hasObtained) {
    const o = Number(obtained);
    if (!isFiniteNumber(obtained)) errors.obtained = 'Marks must be a number.';
    else if (o < 0) errors.obtained = 'Marks cannot be negative.';
    else if (hasTotal && !errors.total && o > Number(total)) {
      errors.obtained = `You cannot score ${o} out of ${total}.`;
    }
  }

  if (hasObtained && !hasTotal) errors.total = 'Add what it was out of.';
  return errors;
}

/** Whole-subject check across all rows. */
export function vGradebook(components) {
  const rows = components.map(vComponent);
  const hasErrors = rows.some((r) => Object.keys(r).length > 0);
  const totalWeight = components.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);
  const warning = Math.abs(totalWeight - 100) > 0.01
    ? `Weights add up to ${Math.round(totalWeight * 10) / 10}%, not 100%, so the projection will be off.`
    : null;
  return { rows, hasErrors, totalWeight, warning };
}

// ── marks bookkeeping ────────────────────────────────────────────────────────
export function vCredits(value) {
  if (!isFiniteNumber(value)) return 'Credits must be a number.';
  const n = Number(value);
  if (!Number.isInteger(n)) return 'Credits are whole numbers.';
  if (n < LIMITS.credits.min || n > LIMITS.credits.max) return `Credits are ${LIMITS.credits.min} to ${LIMITS.credits.max}.`;
  return null;
}

export function vPrevCgpa(value) {
  if (value === '' || value == null) return null;
  if (!isFiniteNumber(value)) return 'CGPA must be a number.';
  const n = Number(value);
  if (n < LIMITS.prevCgpa.min || n > LIMITS.prevCgpa.max) return 'CGPA is on a 0 to 4 scale.';
  return null;
}

export function vPrevCredits(value) {
  if (value === '' || value == null) return null;
  if (!isFiniteNumber(value)) return 'Credit hours must be a number.';
  const n = Number(value);
  if (n < LIMITS.prevCredits.min || n > LIMITS.prevCredits.max) return `That should be 0 to ${LIMITS.prevCredits.max}.`;
  return null;
}

// ── subjects ─────────────────────────────────────────────────────────────────
export function vSubjectCode(code) {
  const v = clean(code).toUpperCase();
  if (!v) return 'Course code is required.';
  if (!SUBJECT_CODE.test(v)) return 'Use the university format, e.g. CSC241.';
  return null;
}

export function vSubject(subject) {
  const errors = {};
  const title = vText(subject.title, { ...LIMITS.subjectTitle, label: 'Course title' });
  if (title) errors.title = title;
  const short = vText(subject.short, { ...LIMITS.subjectShort, label: 'Short name' });
  if (short) errors.short = short;
  const teacher = vOptionalText(subject.teacher, { max: LIMITS.teacher.max, label: 'Teacher' });
  if (teacher) errors.teacher = teacher;
  const credits = vCredits(subject.credits);
  if (credits) errors.credits = credits;
  if (!HEX_COLOR.test(String(subject.color || ''))) errors.color = 'Pick a colour.';
  const drive = vLink(subject.driveLink, 'drive');
  if (drive) errors.driveLink = drive;
  const classroom = vLink(subject.classroomLink, 'classroom');
  if (classroom) errors.classroomLink = classroom;
  return errors;
}

// ── timetable ────────────────────────────────────────────────────────────────
/**
 * @param slot   { day, start, end, code, room, type, changeNote, changeUntil }
 * @param others every other slot, so we can catch a double-booking
 */
export function vSlot(slot, others = []) {
  const errors = {};

  if (!Number.isInteger(Number(slot.day)) || Number(slot.day) < 0 || Number(slot.day) > 6) {
    errors.day = 'Pick a day.';
  }
  if (!slot.code) errors.code = 'Pick a subject.';
  if (!SLOT_TYPES.includes(slot.type)) errors.type = 'Pick a class type.';

  const room = vText(slot.room, { ...LIMITS.room, label: 'Room' });
  if (room) errors.room = room;

  const startError = vTime(slot.start, { required: true, label: 'Start time' });
  const endError = vTime(slot.end, { required: true, label: 'End time' });
  if (startError) errors.start = startError;
  if (endError) errors.end = endError;

  if (!startError && !endError) {
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    const span = end - start;

    if (span <= 0) errors.end = 'The class has to end after it starts.';
    else if (span < LIMITS.slotMinutes.min) errors.end = `A class is at least ${LIMITS.slotMinutes.min} minutes.`;
    else if (span > LIMITS.slotMinutes.max) errors.end = `That is ${(span / 60).toFixed(1)} hours, longer than any single class (max ${LIMITS.slotMinutes.max / 60}h).`;

    if (start < toMinutes(LIMITS.dayStart)) errors.start = `Classes do not start before ${LIMITS.dayStart}.`;
    if (end > toMinutes(LIMITS.dayEnd)) errors.end = `Classes do not run past ${LIMITS.dayEnd}.`;

    if (!errors.end && !errors.start) {
      const clash = others.find((o) =>
        Number(o.day) === Number(slot.day) &&
        start < toMinutes(o.end) && end > toMinutes(o.start));
      if (clash) {
        errors.start = `Clashes with ${clash.code} at ${clash.start} to ${clash.end} in ${clash.room}.`;
      }
    }
  }

  const note = vOptionalText(slot.changeNote, { max: 140, label: 'Note' });
  if (note) errors.changeNote = note;
  if (slot.changeUntil) {
    const until = vDueDate(slot.changeUntil, { required: false });
    if (until) errors.changeUntil = until;
  }
  return errors;
}

// ── tasks ────────────────────────────────────────────────────────────────────
export function vTask(task, { requireDueDate = true } = {}) {
  const errors = {};
  const title = vText(task.title, { ...LIMITS.title, label: 'Title' });
  if (title) errors.title = title;
  if (!task.subject) errors.subject = 'Pick a subject.';
  // Accepts a type that is no longer offered, so editing an old record does
  // not fail validation on a field nobody touched.
  if (!ALL_TASK_TYPES.includes(task.type)) errors.type = 'Pick a type.';
  const due = vDueDate(task.dueDate, { required: requireDueDate });
  if (due) errors.dueDate = due;
  const time = vTime(task.dueTime, { label: 'Due time' });
  if (time) errors.dueTime = time;
  const note = vOptionalText(task.note, { max: LIMITS.note.max, label: 'Note' });
  if (note) errors.note = note;
  return errors;
}

export const hasErrors = (errors) => Object.values(errors || {}).some(Boolean);


// ── one-off class changes ────────────────────────────────────────────────────
/**
 * The weekly timetable says what normally happens. This says what happens
 * instead, on one named date: a class called off, moved to another time or
 * room, or an extra one added.
 *
 * `cancelled` and `moved` hang off an existing slot, so they carry its id.
 * `extra` has no recurring slot behind it, so it carries everything itself.
 */
export const CHANGE_STATUS = ['cancelled', 'moved', 'extra'];

export function vClassChange(change, existing = []) {
  const errors = {};

  const date = vDueDate(change.date, { required: true });
  if (date) errors.date = date;

  if (!CHANGE_STATUS.includes(change.status)) errors.status = 'Pick what is happening.';
  if (!change.code) errors.code = 'Pick a subject.';

  const onASlot = change.status === 'cancelled' || change.status === 'moved';
  if (onASlot && !change.slotId) errors.slotId = 'Pick which class this is about.';

  // A move and an extra class both need somewhere and sometime to be.
  if (change.status === 'moved' || change.status === 'extra') {
    if (!SLOT_TYPES.includes(change.type)) errors.type = 'Pick a class type.';

    const room = vText(change.room, { ...LIMITS.room, label: 'Room' });
    if (room) errors.room = room;

    const startError = vTime(change.start, { required: true, label: 'Start time' });
    const endError = vTime(change.end, { required: true, label: 'End time' });
    if (startError) errors.start = startError;
    if (endError) errors.end = endError;

    if (!startError && !endError) {
      const start = toMinutes(change.start);
      const end = toMinutes(change.end);
      const span = end - start;
      if (span <= 0) errors.end = 'It has to end after it starts.';
      else if (span < LIMITS.slotMinutes.min) errors.end = `A class is at least ${LIMITS.slotMinutes.min} minutes.`;
      else if (span > LIMITS.slotMinutes.max) errors.end = `That is ${(span / 60).toFixed(1)} hours, longer than any single class (max ${LIMITS.slotMinutes.max / 60}h).`;
      if (start < toMinutes(LIMITS.dayStart)) errors.start = `Classes do not start before ${LIMITS.dayStart}.`;
      if (end > toMinutes(LIMITS.dayEnd)) errors.end = `Classes do not run past ${LIMITS.dayEnd}.`;
    }
  }

  const note = vOptionalText(change.note, { max: 140, label: 'Note' });
  if (note) errors.note = note;

  // Two changes to the same class on the same day would contradict each other,
  // and which one won would come down to document order.
  if (onASlot && change.slotId && change.date) {
    const clash = existing.find((c) =>
      c.id !== change.id && c.date === change.date && c.slotId === change.slotId);
    if (clash) errors.slotId = 'That class already has a change on that date.';
  }

  return errors;
}

// ── exams ────────────────────────────────────────────────────────────────────
/**
 * One sitting: a subject, a date, a window and a room.
 *
 * Every field is required except the seat and the note, because an exam entry
 * that is missing its room is worse than no entry at all — it looks
 * authoritative and sends people to the wrong building.
 */
export function vExam(exam, others = []) {
  const errors = {};

  if (!exam.code) errors.code = 'Pick a subject.';
  if (!EXAM_KINDS.includes(exam.kind)) errors.kind = 'Pick which exam this is.';

  const date = vDueDate(exam.date, { required: true });
  if (date) errors.date = date;

  const startError = vTime(exam.start, { required: true, label: 'Start time' });
  const endError = vTime(exam.end, { required: true, label: 'End time' });
  if (startError) errors.start = startError;
  if (endError) errors.end = endError;

  if (!startError && !endError) {
    const span = toMinutes(exam.end) - toMinutes(exam.start);
    if (span <= 0) errors.end = 'It has to end after it starts.';
    else if (span < LIMITS.examMinutes.min) errors.end = `An exam is at least ${LIMITS.examMinutes.min} minutes.`;
    else if (span > LIMITS.examMinutes.max) errors.end = `That is ${(span / 60).toFixed(1)} hours, longer than any paper (max ${LIMITS.examMinutes.max / 60}h).`;
  }

  const room = vText(exam.room, { ...LIMITS.room, label: 'Room' });
  if (room) errors.room = room;

  const seat = vOptionalText(exam.seat, { max: 24, label: 'Seat number' });
  if (seat) errors.seat = seat;

  const note = vOptionalText(exam.note, { max: 140, label: 'Note' });
  if (note) errors.note = note;

  // The same paper entered twice is how half a class ends up reading the old
  // room and the other half the new one.
  if (exam.code && exam.kind && exam.date) {
    const clash = others.find((o) =>
      o.id !== exam.id && o.code === exam.code && o.kind === exam.kind && o.date === exam.date);
    if (clash) errors.kind = `That ${exam.kind} is already on the schedule for that date.`;
  }

  return errors;
}

/**
 * The switch that suspends the weekly timetable.
 *
 * Leaving both dates empty is allowed and means "on until I turn it off",
 * which is what a CR reaches for mid-exam-week. The form pushes for dates
 * anyway, because a switch nobody remembers to turn off hides the timetable
 * from the whole class for a month.
 */
export function vExamMode(config) {
  const errors = {};
  const label = vOptionalText(config.label, { max: 60, label: 'Name' });
  if (label) errors.label = label;

  if (config.from) {
    const from = vDueDate(config.from, { required: false });
    if (from) errors.from = from;
  }
  if (config.to) {
    const to = vDueDate(config.to, { required: false });
    if (to) errors.to = to;
  }
  if (!errors.from && !errors.to && config.from && config.to && config.to < config.from) {
    errors.to = 'The last day cannot be before the first.';
  }
  return errors;
}

// ── announcements ────────────────────────────────────────────────────────────
/** Anything the CR needs to tell the class that is not itself a deadline. */
export function vAnnouncement(announcement) {
  const errors = {};

  const title = vText(announcement.title, { min: 3, max: 120, label: 'Message' });
  if (title) errors.title = title;

  const body = vOptionalText(announcement.body, { max: LIMITS.note.max, label: 'Details' });
  if (body) errors.body = body;

  if (announcement.until) {
    const until = vDueDate(announcement.until, { required: false });
    if (until) errors.until = until;
    else if (daysFromToday(announcement.until) < 0) {
      errors.until = 'That date has already passed, so nobody would ever see this.';
    }
  }

  return errors;
}
