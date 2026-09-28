/**
 * The university's own systems, reachable from inside the app.
 *
 * This app is a helper, not a replacement: the portal is where registration,
 * the official transcript and the real grade sheet live, and a student ends up
 * there several times a semester. Keeping the address here means nobody has to
 * go and find it in a bookmark bar, a WhatsApp message or a search result that
 * may not be the real one.
 *
 * Only https, and only hosts typed out in full. A campus portal asks for a
 * password, which makes a wrong or look-alike address the most expensive
 * mistake this app could make, so these are never taken from user input or
 * from Firestore.
 */
export const CAMPUS_LINKS = [
  {
    id: 'sis',
    label: 'Student portal',
    detail: 'CUI Lahore · registration, grades, fee',
    href: 'https://lhr-sis.comsats.edu.pk/Login/Index',
  },
];

/**
 * Opening anything here signs the student into a real university account, so
 * the same two attributes go on every one of them: a new tab, and no referrer
 * or window handle handed to the other origin.
 */
export const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noreferrer noopener',
};
