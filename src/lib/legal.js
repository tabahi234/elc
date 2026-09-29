/**
 * Privacy notice and terms.
 *
 * NOT LEGAL ADVICE. Kept deliberately short and specific to what this app
 * actually does. Change anything that stops being true when you change the code.
 *
 * Bump CONSENT_VERSION when the substance changes: everyone is then asked to
 * agree again, because consent to an older text is not consent to this one.
 * Version 2 dropped attendance tracking, so the app no longer holds any record
 * of which classes anyone did or did not turn up to. Version 4 keeps the
 * sign-in on the device instead of ending it with the browser tab, and lets
 * anyone who signs in join the class as a student without being approved
 * first — both of which change what someone is agreeing to, so both are worth
 * asking about again. Version 5 keeps a copy of your records on the device
 * (until sign-out) so the app opens instantly and works offline.
 */
export const CONSENT_VERSION = 5;
export const LAST_UPDATED = '29 September 2026';

export const PRIVACY = {
  title: 'Privacy',
  points: [
    'Signing in with Google gives this app your name, email and profile picture. No password ever reaches it.',
    'Signing in joins you to the class as a student, and records your email in a class access list your admin can see. Nobody has to approve you first.',
    'Your marks, study log and personal tasks are private to your account in this app. Class representatives and app admins cannot read them. Operators with privileged Firebase project access can access stored data.',
    'This app keeps no record of your attendance. It does not track who turned up to which class.',
    'Class information stored in Firebase is readable only by signed-in classmates who have not been removed. The starter timetable is bundled with the public app.',
    'Your records are stored in Google Firebase. A copy is kept on this device so the app opens quickly and works without signal. Signing out deletes that copy and clears the sign-in too.',
    'Your sign-in is remembered on this device until you sign out, so the app does not ask for it again every time. On a shared or borrowed device, sign out when you are done.',
    'No analytics, no tracking, no ads, nothing sold or shared anywhere else.',
    'Deadline notifications are off until you switch them on.',
    'To have your data deleted, ask whoever runs this app.',
  ],
};

export const TERMS = {
  title: 'Terms of use',
  points: [
    'This is a student-run helper, not an official university system. Timetables, deadlines and grades here are typed in by people and can be wrong.',
    'Your university, the LMS and your teacher are the authority. If this app disagrees with them, they are right.',
    'GPA figures are estimates from numbers you entered. Do not rely on them for anything that counts.',
    'Use your own account. Do not try to reach anyone else’s data.',
    'Anyone who signs in can see this class’s timetable, deadlines and notices. An admin can remove that access at any time.',
    'If you are a class representative, what you publish is seen by everyone. Keep it accurate and civil.',
    'Provided as is, with no guarantee it works or stays available. Keep your own record of anything important.',
  ],
};
