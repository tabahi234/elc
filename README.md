# UniHelper

A PWA for one university class: shared timetable and deadlines, private grades
and study tracking. React + Vite + Firebase.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run lint
npm run icons    # redraw the favicon and every app icon
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

Publish the updated app and rules together. Access still turns on a
`roles/{uid}` document holding `student`, `cr` or `admin`, but signing in now
creates that document for you: the app writes `student` under your own uid,
with the email from your own verified token, and the rules allow nothing else
(see `selfEnrolment()` in `firestore.rules`). A verified Google account is
therefore enough to read class content, and nothing else. Removing somebody is
setting them to `blocked`, not deleting the row — a deleted row would simply be
re-created on their next visit. See [SECURITY.md](SECURITY.md) for rollout and
test details.

### 2. Make yourself an admin

Roles live in a `roles` collection, and the `admin` role **cannot be granted
from inside the app**. That is deliberate, so nobody can promote themselves
even with the developer tools open. Create it by hand, once:

1. Sign in to the app with your Google account.
2. Firebase console → **Authentication → Users** → copy your User UID.
3. Firebase console → **Firestore → Start collection** → collection id `roles`,
   document id = your UID, one field: `role` (string) = `admin`.

Reload the app. A **Manage** tab appears in the bottom nav.

Classmates do not need approving. Anyone who signs in joins as a student and
appears in **Manage → People** by themselves, listed by the email they signed
in with. Two decisions are left there, and both are set from the dropdown on
each row:

- **Class rep** — can edit deadlines, notices, exams and the timetable.
- **No access** — removes them. The row is kept with `role: blocked`, which is
  what stops them signing themselves back in.

You cannot change your own row from inside the app, and you cannot change
another admin's. Both are Firebase-console-only, so no tap here can lock the
class out.

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

### 4. Exams

**Manage → Exams** holds two things that go together.

*The date sheet* is one entry per paper: subject, which exam (Mid, Final, Lab
exam, Quiz), date, start and end, room, and an optional seat number. It lands
on every dashboard with a countdown.

There is one `Mid` rather than a numbered pair, because every entry already
carries its own date and subject — two mid-terms are simply two entries, and a
menu offering "Mid II" to a course with one mid invites the wrong answer.

*The exam period* is the switch that suspends the weekly timetable. While it is
on, Classes shows the date sheet instead of the week, and the dashboard counts
down to the next paper rather than the next class. It is a switch rather than
something inferred from the dates, because classes carry straight through the
sessionals and stop for the finals and no rule gets that right every semester.
Give it a last day: it then turns itself off and the timetable comes back
without anybody remembering to do it.

The weekly timetable is never deleted — it moves to a fold-out at the bottom of
the exam schedule, because "when do classes start again" is a real question.

---

## What the dashboard says about today

`todayShape()` in `src/lib/schedule.js` answers this in one word, next to the
rest of "what actually happens on a date", so the dashboard and the week view
cannot drift apart:

| | when | what the card says |
|---|---|---|
| `ahead` | a class still to come | the next one, tappable |
| `done` | all of today's classes are behind you | *That is everything. Go and get some rest.* |
| `free` | nothing was on, or the CR cleared the day | a ranked revision suggestion (`lib/restday.js`) |
| `unknown` | nothing published, or still loading | nothing |

`free` and `done` are separate on purpose. "Nothing was on today" and "you have
done all of it" are different facts about a day, and collapsing them is how an
app ends up congratulating somebody for a public holiday.

`done` still checks before it says well done: a deadline due tonight makes "go
and rest" actively bad advice, so when there is one the card names it and links
to it instead.

**Finished classes leave the list.** `remainingOn()` drops a class the moment
its end time passes, so *Rest of today* really is the rest of today. They used
to grey out at 45% opacity, which by mid-afternoon left a list made mostly of
things that had already happened — the opposite of what the list is for. A
*cancelled* class stays until its slot has passed, because "do not come in" is
news right up to the moment it stops being news.

**The next-class card opens.** Tapping it (or any row in *Rest of today*)
shows the time and room actually in effect for that date — a one-off move
included — plus the teacher, the Drive folder, the Classroom and what is
pending for that subject. That card is the single thing most students look at
before leaving, and everything they went looking for next was three screens
away.

## Deadlines and exams are different things

A deadline is worked at and handed in. An exam is a room, an hour and a seat.
The app used to treat them as one list, which produced a tick box on a quiz
that meant nothing and a "pending" entry that stayed pending for the rest of
the semester unless somebody went and lied to it.

So anything typed as **Quiz, Mid or Final** is shown as an event: its own
section on Deadlines, a countdown instead of a due date, no checkbox, and it
folds itself away once the date has passed. `EVENT_TYPES` in
`src/lib/validate.js` is the single list that decides this, and
`useAllTasks` derives `completed` from the calendar for anything in it, so
every existing consumer — the sort, the counts, the nav badge — keeps working
without special-casing.

Tapping any row — deadline or exam — opens the whole record read-only:
type, the full date and time, where it came from, and the complete note. The
cards clamp their note to two lines, so before this the only way to read a long
submission format was the edit form, which on a class deadline a student cannot
open at all.

**Retired vocabulary.** Mids used to be called sessionals here.
`LEGACY_TASK_TYPES` keeps `Sessional` valid in the rules and in
`EVENT_TYPES`, so records already written under it stay readable, editable and
correctly treated as events — it is simply off every menu. `typeOptions()`
folds a record's own type back into its dropdown, because a `<select>` whose
value is not among its options silently falls back to the first one, and saving
would then retype somebody's quiz as an Assignment.

---

## Who can do what

| | Student | CR | Admin |
|---|---|---|---|
| See timetable, subjects, class deadlines | ✅ | ✅ | ✅ |
| Own grades, study log, personal tasks | ✅ | ✅ | ✅ |
| Announce a class deadline | , | ✅ | ✅ |
| Post a notice | , | ✅ | ✅ |
| Cancel, move or add a single class | , | ✅ | ✅ |
| Edit subjects, Drive / Classroom links | , | ✅ | ✅ |
| Edit the timetable, change a room | , | ✅ | ✅ |
| Add or remove a CR, remove a classmate | , | , | ✅ |
| Create another admin | , | , | Firebase console only |

| Publish the exam date sheet, switch exam mode on | , | ✅ | ✅ |

Signing in is the whole sign-up: an admin appoints or removes people from
**Manage → People**, where everyone who has signed in is already listed.

A student's grades and study log are readable only by that student. **Not by
the CR, and not by an admin**. That is enforced in the rules, not just hidden
in the UI. Operators with Firebase project/IAM or Admin SDK access are outside
these client rules and can access stored data.

---

## How the security actually works

Every reader is a signed-in classmate who can call the Firestore SDK directly
from the console. So the rules assume the React app is hostile.

**Roles are checked server-side.** `firestore.rules` re-reads `roles/{uid}` on
every write. Hiding the Manage tab is a courtesy; the rules are the lock.
The `/admin` screen is gated too, but the rules remain the security boundary.

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
rejects executable schemes such as `javascript:` and look-alike domains.
Google controls what happens after a permitted link is opened; this is not an
audit of the linked document or of redirects on those external sites.

**Authorship cannot be forged.** Class-content writes must stamp
`updatedBy == request.auth.uid` and `updatedAt == request.time`, and a task's
`createdBy` / `createdAt` are immutable after creation.

**Private data is owner-only.** `users/{uid}/**` is readable and writable by
that uid alone, with the key names allowlisted.

### Data-integrity limits

The study log is a single array document. Rules cannot iterate it, so they only
cap its length; the per-session and per-day limits are enforced in
`src/lib/validate.js`. That is the right place for them , the data is private to
its owner. The rules validate the outer value shape, allowed document keys and
server timestamp. Nested grade entries, study limits, timetable overlaps and
duplicate one-off changes still rely on client validation.

### If sign-in starts failing for everyone

`signedIn()` in the rules also requires `request.auth.token.email_verified`.
Keep email verification enforced when adding providers. Complete email
verification and provision approval before granting access.

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

A student's tasks, grades and study log are readable by that
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

## One-off class changes

The timetable is a weekly pattern. Reality is not. `classChanges` records what
happens instead, on one named date:

| | Points at | Carries |
|---|---|---|
| `cancelled` | the recurring slot | nothing else, the rules reject a replacement time |
| `moved` | the recurring slot | new start, end and room for that date only |
| `extra` | nothing (`slotId` is null) | its own subject, time, room and type |

This is the most expensive thing the app previously could not say. A rolling
"room changed" note on the slot cannot express it, because the change belongs
to a date, not to every Wednesday from now on, and a student who reads the
weekly grid commutes in for a class that was called off.

Everything that shows a class goes through `src/lib/schedule.js`, so the
dashboard, the week view and the alerts can never disagree about whether one is
running:

- `classesOn(date, timetable, changes)` folds the changes into that weekday's
  pattern, re-sorts moved classes into their new time, and **keeps** a cancelled
  class in the list with a flag. A gap where a class used to be reads as a bug;
  a struck-through row reads as information.
- `nextClass(now, …)` walks forward a day at a time and skips anything
  cancelled, so a called-off class pushes the answer along instead of being the
  answer.
- `describeChange()` writes the one-line wording used by the CR's list, the
  student's week view, the dashboard alert and the share text, so all four say
  the same thing.

A cancellation today is a `critical` alert and outranks a standing room-change
note. Changes clear themselves once the date passes; nothing has to be tidied up
for the app to stay correct.

The form refuses two changes to the same class on the same date. This
uniqueness check is not enforced by the rules; trusted managers using the SDK
directly must avoid duplicates. Rules do enforce the referenced slot and subject.

## Notices

`announcements` is for everything the class needs to hear that is not a
deadline: bring a calculator, the lab report format changed, Friday's class is
in the other block. Previously this either got dressed up as a fake deadline or
went to WhatsApp, where it scrolled away in twenty minutes.

Each notice carries an expiry date and the form pushes hard for one. That is the
whole trick: a board nobody clears becomes wallpaper, and then the notice that
matters gets read as wallpaper too. Expired notices stay in Manage so the CR can
delete them or put one back up, and disappear from every student's dashboard on
their own.

## Sharing into the class group

A CR who has just typed a deadline in here should not have to retype it in
WhatsApp. That is where the wording drifts, the date gets transposed, and half
the class ends up working from a different deadline to the other half.

Every deadline, notice and class change in Manage has a share button.
`navigator.share` opens the phone's real share sheet, so it lands in the group
as text. On a desktop browser there is no share sheet, so it goes to the
clipboard instead and the toast says so. Backing out of the share sheet is not a
failure and does not toast.

The text is plain: no markdown and no emoji, because WhatsApp renders neither
the way the sender expects and a deadline is not the place to find that out.

## Deadlines with no date yet

A teacher often mentions an assignment weeks before fixing when it is due. The
old model could not express that: `dueDate` was required, so a CR either
invented a date or said nothing, and both are worse than the truth.

`dueDate` is now nullable, in the rules as well as the form. An undated
deadline:

- shows **Date not announced yet** wherever a countdown would normally go
- sorts to the top of *Upcoming* in Manage, never into *Past*
- raises no alert, no nav badge and no notification, because nothing is urgent
  about a date that does not exist yet
- gets a countdown the moment the CR fills the date in

Personal tasks have always been allowed to have no date. They say **No date**,
which is a different thing from nobody having announced one.

## Undoing a study session

Logging 25 minutes against the wrong subject is the single easiest mistake to
make in this app: the timer banks the session on whichever subject the dropdown
happened to be showing. Two ways out, because the mistake gets noticed at two
different times:

- the confirmation toast carries an **Undo** button and stays up for eight
  seconds, which covers noticing straight away
- **Focus -> Logged today** lists every session logged today with its time and
  subject, each removable, which covers noticing an hour later

Entries now carry an `id` so one can be removed by identity. Entries written
before that exist without one and are matched on subject, minutes and timestamp
instead.

## When something goes wrong

Nothing shows a student a Firebase error code, a rule name or a file path.
They can act on none of it, and it reads like the app blaming them. The real
error goes to `console.error` for whoever runs the app; the student gets one
sentence.

- `src/lib/errors.js` maps every Firestore error code to that sentence.
  Anything unrecognised falls back to a plain retry message.
- `ErrorBoundary` wraps the whole app and again each screen, keyed on the
  path. A crash is contained to that screen, and navigating to another tab
  clears it without a reload.
- An unknown address gets a real **404** listing the five screens that exist.
  It used to redirect silently to the dashboard, which looks exactly like the
  app ignoring the tap.
- `OfflineBar` indicates lost connectivity. The app shell is cached, but private
  records use memory only. Reloading requires a connection to read your role,
  and pending writes can be lost when closing or reloading offline.

## Icons

`npm run icons` runs `scripts/generate-icons.mjs`, which draws the mortarboard
mark once and emits the favicon SVG, a 32px PNG, an Apple touch icon and the
three manifest icons from the same geometry. No dependencies: the PNG encoder
is zlib plus a CRC table, and the rasteriser is a scanline fill with 4x4
supersampling.

It exists because the manifest used to point at `pwa-192x192.png` and
`pwa-512x512.png`, neither of which was ever created, so installing the app on
Android produced a blank icon. Generating them removes the chance of that
happening again, and of the SVG and the PNGs drifting apart.

The maskable icon is a separate file rather than the same artwork tagged
`maskable`, because Android crops a maskable icon to a circle and the rounded
plate would lose its corners.

## Staying signed in

Firestore uses `memoryLocalCache()` and the previous version's IndexedDB cache
is cleared at startup, so no private record is ever written to the device. Auth
uses `browserLocalPersistence`, so the token is.

Those are two different questions and the old code answered them with one
setting. `browserSessionPersistence` ended the session with the browser tab,
which meant students re-authenticating through Google several times a day — and
it bought no privacy, because every grade, task and study entry was already
memory-only and gone the moment the tab closed. The only thing it evicted was
the token. Signing out still calls `signOut` and then reloads the page, which
drops both.

## Legal

`src/lib/legal.js` holds a short privacy notice and short terms, as plain
bullet lists describing what this app actually does.

**Agreement is given before Google is ever opened.** The sign-in card carries a
tick box, with *Privacy Policy* and *Terms of Use* as inline links that open the
document in a sheet; the sign-in button stays disabled until it is ticked. The
old order asked for a Google account first and only then said what the app does
with it, which is the wrong way round: by the time anyone read the terms they
had already handed over the part that mattered. It also put three screens
between opening the app and seeing anything useful.

The tick is held in `Shell` across the Login-to-app swap and written to the
student's own settings document the moment sign-in gives it a uid to file it
under, recording which `CONSENT_VERSION` was agreed to. It counts for that
session immediately, so nobody who has just agreed is asked again while the
write is in flight. If the write fails they simply tick again next session.

**Why it used to ask on every single visit.** The settings document lives at
`users/{uid}/data/settings`, and its rule requires `isMember()` — so while a
student was waiting to be approved, the write that records their agreement was
rejected by the server every time. Nothing was ever stored, so nothing was ever
remembered. Signing in with no approval step means the role document exists
before that write is attempted, which is what actually fixed it; keeping the
sign-in on the device (below) is what stopped them being sent back to the
sign-in card in the first place.

`components/Consent.jsx` survives as the **re-consent** screen, for the one
case the sign-in card cannot cover: a session that is already signed in when
the wording changes underneath it. Its stored consent names an older version,
and agreement to an older text is not agreement to this one, so it asks there
with both documents in full. A first run never sees it.

The documents are also at `/privacy` and `/terms` once inside the app.

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
    schedule.js         the weekly pattern with one-off changes folded in
    announcements.js    which notices are still live
    share.js            share-sheet plumbing and the text it sends
    auth.jsx            sign-in and the role lookup
    classDataContext.jsx  shared subjects / timetable / deadlines
    useTasks.js         personal tasks merged with class deadlines
    storage.js          per-user Firestore-backed useState
    grading.js          GPA maths        progress.js  gradebook + GPA
    study.js            study log        toast.jsx    toasts, with undo
    errors.js           every failure turned into a sentence a student can act on
  components/
    ui.jsx              Field, Sheet, ConfirmButton, EmptyState, Tabs
    ErrorBoundary.jsx   catches a crashed screen
    OfflineBar.jsx      one line while there is no signal
    BottomNav.jsx
  pages/
    Dashboard · Timetable · Tasks · Grades · Focus · Admin · Login · NotFound
scripts/
  generate-icons.mjs    draws every icon and the favicon from one definition
```

Deadline alerts use the browser Notification API: opt-in from the account
sheet, at most one summary a day, and only when something is due inside 24
hours. A web page cannot reliably wake itself, so it fires when the app is
opened , the in-app alerts on the dashboard are the dependable ones.
