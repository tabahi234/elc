# Security review — 27 September 2026

## Changes

- Require verified identity and explicit approval in `roles/{uid}` for shared
  class reads and private-record access. An absent role no longer grants access.
- Restrict other users' role/email records to admins. Keep admin-role creation
  outside the client and prevent changes to existing admins.
- Gate the UI on a server-confirmed role tied to the current user. Remount
  private screens on account changes and clear memory on explicit sign-out.
- Replace persistent Firestore caching with memory caching, remove the previous
  IndexedDB cache before startup, and use session auth persistence. Multiple
  tabs running the old app must close before the cache migration can complete.
- Require server-generated creation timestamps for shared tasks/notices and
  server-generated update timestamps for private documents. Historical ISO
  creation timestamps remain editable and display in chronological order.
- Validate private-document outer shapes, real calendar dates, and class-change
  references. Harden outgoing links against credentials, custom ports, malformed
  inputs, control characters and deceptive hosts.
- Add a production content-security policy, referrer protection, and hosting
  headers for clickjacking, MIME sniffing, HTTPS and unnecessary device APIs.
- Ignore common local secret files and add repeatable security tests.

## Verification

Run `npm run test:security`, `npm run lint`, `npm run build`, and `npm audit`.
The rule suite requires a local Firestore emulator on **127.0.0.1:8080** and uses
only the isolated project **demo-unihelper-security**. With Java 21+ and the
Firebase CLI installed separately, run:

```sh
firebase emulators:exec --only firestore --project demo-unihelper-security "npm run test:rules"
```

The suite checks anonymous/unverified/unapproved access, cross-user privacy
including admin access, role escalation, approval and revocation, allowed
schemas, link injection, server timestamps, calendar dates and slot references.
The browser smoke check covers production startup and console errors; a real
Google sign-in and authenticated UI flow still need verification on the deployed
origin. Live Firebase settings and deployed rules were not inspected or changed.

## Rollout

1. Confirm an existing trusted administrator has `roles/<uid> = {role: "admin"}`
   in Firebase. Do not remove current admin records.
2. Provision `student` roles for existing approved users, or have the admin
   approve them through Manage → People after rollout. Otherwise those users
   will see the approval screen. No identity is auto-approved from an email.
3. Publish `firestore.rules` and the new built app together. Rules only become
   effective on the live database after `npm run deploy:rules` succeeds.
4. Firebase Hosting headers are configured in `firebase.json`; `public/_headers`
   covers hosts that support that format. Other hosts must configure equivalent
   HTTP headers. Check actual response headers after deployment.
5. Test Google sign-in, approval, revocation, private saves and sign-out on the
   deployed origin. If another old tab blocks cache cleanup, close it and retry.

## Boundaries and remaining operational work

- The starter timetable in `src/data/timetable.js` is previously published
  university information bundled in the public application. Approval protects
  Firebase records, not publicly distributed assets. Keep confidential details
  out of this source file and out of the JavaScript bundle.
- Rules cannot prevent an already approved reader retaining downloaded data.
  Revocation blocks future authorized server access; it cannot recall copies.
- Firebase Admin SDK and project operators bypass these client rules. Review
  IAM, authorized auth domains, API-key restrictions, Storage rules if used,
  App Check enforcement, billing alerts and abuse monitoring in the project.
  No service-account/private-key credential was found in the reviewed app files;
  the Firebase web configuration is a public project identifier, not a secret.
- Per-user nested study/grade data is not fully schema-validated. Timetable
  overlaps and duplicate changes are client integrity checks for trusted
  managers. There is no backend rate limiting or per-user storage quota here.
- Initial approval checks require the network. Only the static shell persists
  offline; unsynced memory writes can be lost on reload/close/sign-out.
- This review and regression suite reduce identified risks; they are not proof
  that the app or the uninspected production environment has no vulnerabilities.

Firebase documents the sensitive-data implications of persistent caching at
https://firebase.google.com/docs/firestore/manage-data/enable-offline and the
emulator-based rules testing approach at https://firebase.google.com/docs/rules/unit-tests.
