# UniHelper

A PWA for one university class: shared timetable and deadlines, private grades,
attendance and study tracking. React + Vite + Firebase.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
```

---

## Setup: do these three things or the app will not work

### 1. Publish the security rules

Nothing in the React code protects your data. Every rule that matters lives in
`firestore.rules`, and it is only enforced once published.

**Easiest path, and it validates the syntax as you paste:** Firebase console,
Firestore Database, Rules tab. Select all, paste the contents of
`firestore.rules`, press Publish.

**Or from the CLI.** The Google account the CLI is logged in as must have access
to the project named in `.firebaserc`. Check both:

```bash
firebase login:list
firebase projects:list
```

If `elc-dashboard-d6405` is not in that list you are signed in with the wrong
Google account. Switch with `firebase login --reauth`, then:

```bash
npm run deploy:rules
```

Until the rules are published the app cannot read your role document, so the
Manage tab stays hidden. Since version 2 the dashboard says so explicitly
instead of silently treating you as a student.

### 2. Make yourself an admin

Roles live in a `roles` collection, and the `admin` role **cannot be granted
from inside the app**. That is deliberate, so nobody can promote themselves
even with the developer tools open. Create it by hand, once:

1. Sign in to the app with your Google account.
2. Firebase console → **Authentication → Users** → copy your User UID.
3. Firebase console → **Firestore → Start collection** → collection id `roles`,
   document id = your UID, one field: `role` (string) = `admin`.

Reload the app. A **Manage** tab appears in the bottom nav.

### 3. Publish the starter timetable

Open **Manage** and press *Publish starter timetable*. That copies
`src/data/timetable.js` into Firestore as editable documents. Before you do,
everyone sees that bundled timetable read-only.

This runs as two sequential writes, not one batch, and it has to. A timetable
slot's rule requires its subject to already exist, and Firestore evaluates
every write in a batch against the state *before* the batch. Subjects and slots
in one batch means every slot fails the existence check and the whole atomic
write is rejected. Keep them separate if you ever rewrite this.

Once published, every class is editable in **Manage -> Timetable**: subject,
type, day, start and end time, room, plus a dated "room changed" note. The
editor shows the resulting duration as you type and refuses a slot that clashes
with another one.

---

## Who can do what

| | Student | CR | Admin |
|---|---|---|---|
| See timetable, subjects, class deadlines | ✅ | ✅ | ✅ |
| Own grades, attendance, study log, personal tasks | ✅ | ✅ | ✅ |
| Announce a class deadline | , | ✅ | ✅ |
| Edit subjects, Drive / Classroom links | , | ✅ | ✅ |
| Edit the timetable, change a room | , | ✅ | ✅ |
| Add or remove a CR | , | , | ✅ |
| Create another admin | , | , | Firebase console only |

An admin appoints a CR from **Manage → People** using their Firebase user ID
(they have to sign in once first, so they exist in Authentication).

A student's grades, attendance and study log are readable only by that student.
**Not by the CR, and not by an admin**. that is enforced in the rules, not just
hidden in the UI.

---

## How the security actually works

Every reader is a signed-in classmate who can call the Firestore SDK directly
from the console. So the rules assume the React app is hostile.

**Roles are checked server-side.** `firestore.rules` re-reads `roles/{uid}` on
every write. Hiding the Manage tab is a courtesy; the rules are the lock.
Pasting `/admin` into the URL bar gets you a form whose every submission the
server rejects.

**One document per row.** Subjects and timetable slots used to live inside a
single `classData/main` document as a nested map and array. Firestore rules
cannot iterate a nested map, so there was no way to validate an individual
Drive link or a slot's times. They are now one document each and every field is
checked before it lands: course codes match `^[A-Z]{2,4}\d{3}$`, colours are hex,
times are `HH:MM` with `end > start`, credits are 0-6, dates are real and in this
decade.

**Links are host-allowlisted.** A Drive link must be on `drive.google.com` or
`docs.google.com`; a Classroom link on `classroom.google.com`. Enforced in the
rules and again in `safeLink()` before anything is rendered into an `href`. This
closes a real XSS hole , a `javascript:` URL in that field would otherwise run
on every classmate's device. Shorteners and redirects are rejected on purpose.

**Authorship cannot be forged.** Class-content writes must stamp
`updatedBy == request.auth.uid` and `updatedAt == request.time`, and a task's
`createdBy` / `createdAt` are immutable after creation.

**Private data is owner-only.** `users/{uid}/**` is readable and writable by
that uid alone, with the key names allowlisted.

### The one thing the rules do not enforce

The study log is a single array document. Rules cannot iterate it, so they only
cap its length; the per-session and per-day limits are enforced in
`src/lib/validate.js`. That is the right place for them , the data is private to
its owner, so the only thing at risk is whether their own GPA projection means
anything. It is a data-integrity guard, not a security boundary.

### If sign-in starts failing for everyone

`signedIn()` in the rules also requires `request.auth.token.email_verified`.
Google accounts always set it. If you add another sign-in provider that does
not, drop that clause.

---

## Timetable source

The bundled fallback in `src/data/timetable.js` is transcribed from the CUI
Lahore published timetable for FA25-ELC-C, version 2026-09-20. Once a CR presses
*Publish starter timetable*, the live copy in Firestore wins and that file is
only a cold-start fallback. Edit the live one in Manage, not in code.

---

## Design system

Built against the `design-taste-frontend` skill in `.agents/skills/`, with its
dials set for a utility rather than a landing page:
`DESIGN_VARIANCE 4 / MOTION_INTENSITY 3 / VISUAL_DENSITY 6`. The skill's own
scope note excludes dashboards and product UI, so the landing-page sections
(hero rules, eyebrow counts, bento, marquees, scroll-pinning) do not apply here.
Everything else does.

Locks that are enforced, not aspirational. All of them live in `src/index.css`:

- **One accent.** `--accent` only. Success, warning and danger are semantic
  state, never decoration. Subject colours are a separate categorical set at
  matched saturation and lightness, so no course shouts louder than another.
- **One radius rule.** Pills full, cards 14px, controls 10px, chips 8px.
- **One theme at a time.** No section flips to inverted mode mid-page.
- **No gradient text.** It has no contrast ratio and vanishes if the background
  fails to paint. Hierarchy comes from weight and colour.
- **No decorative dots or glows.** The subject stripe does the colour coding by
  itself; the nav badge is a real count, not an ornament.
- **No em-dashes** in any user-visible string.
- **Geist**, self-hosted via `@fontsource-variable/geist`. No font `<link>`.
- **One icon family** (lucide, already a dependency) at a single 1.75 stroke.

Contrast is measured, not assumed. Every text token clears WCAG AA 4.5:1 on
every surface it lands on, in both themes. `--text-faint` is reserved for icons
and glyphs, which need only 3:1, and must not be used for text. Re-measure
after changing any colour token.

## Tasks: who sees what

| | Where it lives | Who can read it | Who can change it |
|---|---|---|---|
| A student's own task | `users/{uid}/tasks` | that student only | that student |
| A class deadline | `globalTasks` | everyone signed in | CR and admin only |

A student's tasks, grades, attendance and study log are readable by that
student and nobody else. Not a classmate, not the CR, not an admin. That is
enforced in the rules, not hidden in the UI.

A class deadline belongs to everyone, so a student can tick it off their list
but cannot edit or delete it. Instead they can press **Make my own editable
copy**, which writes a private task carrying `sourceTaskId` back to the
original. From then on:

- the copy is theirs to retitle, reschedule, annotate or delete
- the class original is hidden from that student's list, so it never appears twice
- the class original is untouched for everyone else
- completion carries across, so adopting a task already ticked does not un-tick it
- deleting the copy puts the class version back on their list

Edits a CR makes afterwards do not flow into an existing copy. The edit sheet
says so, because the alternative is a student quietly working from a stale
due date.

## Attendance: who supplies which number

A student cannot know how many classes were held. The old design asked them to,
by making them tap Present or Absent to increment their own counter; miss one
tap and every percentage after it is silently wrong.

The denominator now comes from the CR:

1. **Manage -> Register.** Pick a date, and the classes scheduled that day are
   listed. Mark each one held or cancelled, or press *All of them went ahead*.
   Tapping the same button again removes the record.
1b. **Catching up.** *Record a date range* takes a start and end date and
   proposes every scheduled class between them. It lists the teaching days it
   found so holidays and cancellations can be unticked, and skips anything
   already on the register, so re-running an overlapping range cannot double
   count. Capped at 120 days, written in batches of 400.
2. **Progress -> Attendance.** Each student sees exactly those classes and
   answers Present or Absent for each. Tapping the same answer again clears it,
   which is why there is no separate undo control.

Percentages count only classes the student has answered for, so an unanswered
class never reads as an absence. The count of unanswered ones is shown at the
top so it cannot be quietly ignored. Cancelled classes are excluded from the
denominator entirely.

Sessions live in `sessions/{id}`, readable by everyone and writable only by a
manager. A student's answers live in their own `attendanceMarks` document and
are private to them.

## Legal

`src/lib/legal.js` holds a short privacy notice and short terms, as plain
bullet lists describing what this app actually does. Both are shown in full on
first use and must be accepted; the record stores `CONSENT_VERSION`, so bumping
that constant asks everyone again. Also at `/privacy` and `/terms`.

Not legal advice. Read them and change anything that stops being true.

## The GPA projection is an estimate

`src/lib/grading.js` assumes an absolute scale (A at 85, B at 71, and so on)
that shipped with the project and has never been checked against an official
COMSATS document. Two ways it can be wrong:

1. The boundaries do not match the handbook, so every letter and GPA is off.
2. The department grades **relatively**, on a curve. Then a fixed threshold
   cannot model the outcome at all, because the grade depends on the class
   distribution.

The Grades tab says this to students at the top of the page, and the scale
itself carries the same warning. If you confirm the real scale, correct
`GRADE_SCALE` and the whole app follows.

## Input limits

Set in one place , `src/lib/validate.js`, `LIMITS`.

| | Limit |
|---|---|
| One study block | 5-240 min |
| Study per subject per day | warn at 4h, refuse over 6h |
| Study per day, all subjects | warn at 10h, refuse over 12h |
| A class slot | 30 min - 5h, between 06:00 and 23:00, no overlaps |
| Marks | obtained ≤ total, total ≤ 1000, weight 0-100 |
| Attendance | attended ≤ held, held ≤ planned sessions + 6 |
| Due dates | within a year either side of today |
| Credits | 0-6 · previous CGPA 0-4 |

Titles and notes are stripped of control characters and zero-width joiners,
which are invisible and a tidy way to make two different titles look identical.

---

## Layout

```
src/
  lib/
    validate.js         all input rules and limits
    alerts.js           derives the alert list + the daily notification
    auth.jsx            sign-in and the role lookup
    classDataContext.jsx  shared subjects / timetable / deadlines
    useTasks.js         personal tasks merged with class deadlines
    storage.js          per-user Firestore-backed useState
    grading.js          GPA maths        progress.js  gradebook + attendance
    study.js            study log        toast.jsx    toast notifications
  components/
    ui.jsx              Field, Sheet, ConfirmButton, EmptyState, Tabs
    BottomNav.jsx
  pages/
    Dashboard · Timetable · Tasks · Grades · Focus · Admin · Login
```

Deadline alerts use the browser Notification API: opt-in from the account
sheet, at most one summary a day, and only when something is due inside 24
hours. A web page cannot reliably wake itself, so it fires when the app is
opened , the in-app alerts on the dashboard are the dependable ones.
