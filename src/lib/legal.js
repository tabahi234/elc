/**
 * Privacy notice and terms.
 *
 * NOT LEGAL ADVICE. Kept deliberately short and specific to what this app
 * actually does. Change anything that stops being true when you change the code.
 *
 * Bump CONSENT_VERSION when the substance changes: everyone is then asked to
 * agree again, because consent to an older text is not consent to this one.
 */
export const CONSENT_VERSION = 1;
export const LAST_UPDATED = '27 September 2026';

export const PRIVACY = {
  title: 'Privacy',
  points: [
    'Signing in with Google gives this app your name, email and profile picture. No password ever reaches it.',
    'Your marks, attendance, study log and personal tasks are private to your account. No classmate, no class representative and no admin can read them. The database rules enforce that, not just the app.',
    'Whatever your class representative publishes (timetable, subjects, links, deadlines) is visible to everyone signed in.',
    'Everything is stored in Google Firebase, and cached on your device so the app works offline.',
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
    'GPA and attendance figures are estimates from numbers you entered. Do not rely on them for anything that counts.',
    'Use your own account. Do not try to reach anyone else’s data.',
    'If you are a class representative, what you publish is seen by everyone. Keep it accurate and civil.',
    'Provided as is, with no guarantee it works or stays available. Keep your own record of anything important.',
  ],
};
