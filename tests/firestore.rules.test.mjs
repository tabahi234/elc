import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

// Never point this suite at production. The SDK is connected explicitly to a local emulator.
let env;
const database = (uid, verified = true) => env.authenticatedContext(uid, { email_verified: verified }).firestore();
// Signing up compares the email on the document against the one on the token,
// so a context that is going to enrol has to carry one.
const withEmail = (uid, email) => env.authenticatedContext(uid, { email_verified: true, email }).firestore();
const stamp = (uid) => ({ updatedAt: serverTimestamp(), updatedBy: uid });
const subject = (uid) => ({ title: 'Test course', short: 'Test', credits: 3, color: '#123456', ...stamp(uid) });
const task = (uid) => ({ title: 'Test deadline', subject: 'CSC123', type: 'Quiz', dueDate: '2026-10-01', createdAt: serverTimestamp(), createdBy: uid, ...stamp(uid) });

before(async () => {
  setLogLevel('silent'); // Expected permission denials are asserted below.
  env = await initializeTestEnvironment({
    projectId: 'demo-unihelper-security',
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [uid, role] of Object.entries({ admin: 'admin', admin2: 'admin', cr: 'cr', alice: 'student', bob: 'student', unverified: 'student', banned: 'blocked' })) {
      await setDoc(doc(db, 'roles', uid), { role, email: `${uid}@example.test` });
    }
    await setDoc(doc(db, 'subjects', 'CSC123'), { title: 'Test', short: 'Test', credits: 3, color: '#123456' });
    await setDoc(doc(db, 'timetable', 'slot'), { code: 'CSC123', day: 1, start: '09:00', end: '10:00', room: 'A', type: 'Lecture' });
    await setDoc(doc(db, 'users', 'alice', 'data', 'gradebook'), { value: { private: true } });
    await setDoc(doc(db, 'users', 'alice', 'tasks', 'private'), { title: 'Private' });
  });
});
after(async () => { await env?.cleanup(); });

test('anonymous, unapproved and unverified identities cannot read shared collections', async () => {
  for (const db of [env.unauthenticatedContext().firestore(), database('outsider'), database('unverified', false)]) {
    for (const name of ['subjects', 'timetable', 'globalTasks', 'announcements', 'classChanges']) {
      await assertFails(getDocs(collection(db, name)));
    }
  }
});
test('approved students can read class data but cannot modify it', async () => {
  await assertSucceeds(getDocs(collection(database('alice'), 'subjects')));
  await assertFails(setDoc(doc(database('alice'), 'subjects', 'CSC124'), subject('alice')));
  await assertFails(deleteDoc(doc(database('alice'), 'subjects', 'CSC123')));
});
test('role approval and directory cannot be escalated or enumerated', async () => {
  for (const uid of ['alice', 'cr', 'outsider']) {
    const db = database(uid);
    await assertFails(setDoc(doc(db, 'roles', uid), { role: 'admin', email: 'x@example.test', ...stamp(uid) }));
    await assertFails(setDoc(doc(db, 'roles', 'victim'), { role: 'student', email: 'x@example.test', ...stamp(uid) }));
    await assertFails(getDocs(collection(db, 'roles')));
    await assertFails(getDoc(doc(db, 'roles', 'bob')));
  }
  await assertSucceeds(getDoc(doc(database('outsider'), 'roles', 'outsider')));
});
test('admin can approve and revoke students but cannot grant or remove admins', async () => {
  const db = database('admin');
  await assertSucceeds(setDoc(doc(db, 'roles', 'newstudent'), { role: 'student', email: 'new@example.test', ...stamp('admin') }));
  await assertSucceeds(getDocs(collection(database('newstudent'), 'subjects')));
  await assertSucceeds(deleteDoc(doc(db, 'roles', 'newstudent')));
  await assertFails(getDocs(collection(database('newstudent'), 'subjects')));
  await assertFails(setDoc(doc(db, 'roles', 'newadmin'), { role: 'admin', email: 'new@example.test', ...stamp('admin') }));
  await assertFails(deleteDoc(doc(db, 'roles', 'admin2')));
  await assertFails(updateDoc(doc(db, 'roles', 'admin'), { role: 'student', ...stamp('admin') }));
});
test('private records stay inaccessible to classmates, CRs, admins and outsiders', async () => {
  for (const uid of ['bob', 'cr', 'admin', 'outsider']) {
    const db = database(uid);
    for (const path of [['data', 'gradebook'], ['tasks', 'private']]) {
      const ref = doc(db, 'users', 'alice', ...path);
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, { value: {} }));
      await assertFails(deleteDoc(ref));
    }
  }
  await assertSucceeds(getDoc(doc(database('alice'), 'users', 'alice', 'data', 'gradebook')));
});
test('private documents enforce approval, allowed keys, shape and server timestamp', async () => {
  const db = database('alice');
  await assertSucceeds(setDoc(doc(db, 'users', 'alice', 'data', 'settings'), { value: {}, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'users', 'alice', 'data', 'studylog'), { value: [], updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users', 'alice', 'data', 'settings'), { value: 'bad', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'users', 'alice', 'data', 'settings'), { value: {}, updatedAt: 'forged' }));
  await assertFails(setDoc(doc(db, 'users', 'alice', 'data', 'unexpected'), { value: {}, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(database('outsider'), 'users', 'outsider', 'data', 'settings'), { value: {}, updatedAt: serverTimestamp() }));
});
test('CR content edits enforce link allowlists and author identity', async () => {
  const db = database('cr');
  await assertSucceeds(setDoc(doc(db, 'subjects', 'CSC124'), { ...subject('cr'), driveLink: 'https://drive.google.com/file/d/123' }));
  for (const link of ['javascript:alert(1)', 'https://drive.google.com.evil.test/a', 'https://drive.google.com@evil.test/a']) {
    await assertFails(setDoc(doc(db, 'subjects', 'CSC124'), { ...subject('cr'), driveLink: link }));
  }
  await assertFails(setDoc(doc(db, 'subjects', 'CSC124'), subject('admin')));
});
test('deadline and notice creation require server time and preserve authorship', async () => {
  const db = database('cr');
  for (const [name, data] of [
    ['globalTasks', task('cr')],
    ['announcements', { title: 'Test notice', createdAt: serverTimestamp(), createdBy: 'cr', ...stamp('cr') }],
  ]) {
    const ref = doc(db, name, 'test');
    await assertFails(setDoc(ref, { ...data, createdAt: '1900-01-01' }));
    await assertFails(setDoc(ref, { ...data, createdBy: 'admin' }));
    await assertSucceeds(setDoc(ref, data));
    await assertSucceeds(updateDoc(ref, { title: 'Edited title', ...stamp('cr') }));
    await assertFails(updateDoc(ref, { createdAt: 'forged', ...stamp('cr') }));
    await assertFails(updateDoc(ref, { createdBy: 'admin', ...stamp('cr') }));
  }
});
test('changes must reference a real slot belonging to their subject', async () => {
  const db = database('cr');
  const ref = doc(db, 'classChanges', 'test');
  const data = { date: '2026-10-01', slotId: 'slot', code: 'CSC123', status: 'cancelled', start: '', end: '', room: '', type: '', ...stamp('cr') };
  await assertSucceeds(setDoc(ref, data));
  await assertFails(setDoc(ref, { ...data, slotId: 'missing' }));
  await assertFails(setDoc(ref, { ...data, code: 'CSC124' }));
});
test('signing in enrols you as a student, and only as a student, and only once', async () => {
  const db = withEmail('joiner', 'joiner@example.test');
  const mine = doc(db, 'roles', 'joiner');
  // Nothing is readable until the role document exists.
  await assertFails(getDocs(collection(db, 'subjects')));
  // The role, the uid and the email are all pinned to the caller's own token.
  await assertFails(setDoc(mine, { role: 'cr', email: 'joiner@example.test', ...stamp('joiner') }));
  await assertFails(setDoc(mine, { role: 'admin', email: 'joiner@example.test', ...stamp('joiner') }));
  await assertFails(setDoc(mine, { role: 'student', email: 'someone.else@example.test', ...stamp('joiner') }));
  await assertFails(setDoc(doc(db, 'roles', 'bob'), { role: 'student', email: 'joiner@example.test', ...stamp('joiner') }));
  await assertFails(setDoc(mine, { role: 'student', email: 'joiner@example.test', updatedAt: '1900-01-01', updatedBy: 'joiner' }));
  // An unverified email is not a sign-up either.
  await assertFails(setDoc(
    doc(env.authenticatedContext('shady', { email_verified: false, email: 'shady@example.test' }).firestore(), 'roles', 'shady'),
    { role: 'student', email: 'shady@example.test', ...stamp('shady') }
  ));

  await assertSucceeds(setDoc(mine, { role: 'student', email: 'joiner@example.test', ...stamp('joiner') }));
  await assertSucceeds(getDocs(collection(db, 'subjects')));
  // Create-only: having a document is not a licence to rewrite it.
  await assertFails(setDoc(mine, { role: 'cr', email: 'joiner@example.test', ...stamp('joiner') }));
  await assertFails(setDoc(mine, { role: 'student', email: 'joiner@example.test', ...stamp('joiner') }));
});
test('a blocked classmate is locked out and cannot re-enrol over the block', async () => {
  const db = withEmail('banned', 'banned@example.test');
  await assertFails(getDocs(collection(db, 'subjects')));
  await assertFails(setDoc(doc(db, 'roles', 'banned'), { role: 'student', email: 'banned@example.test', ...stamp('banned') }));
  await assertFails(deleteDoc(doc(db, 'roles', 'banned')));
  // Blocking is the admin's, and so is lifting it.
  const asAdmin = database('admin');
  await assertSucceeds(setDoc(doc(asAdmin, 'roles', 'bob'), { role: 'blocked', email: 'bob@example.test', ...stamp('admin') }));
  await assertFails(getDocs(collection(database('bob'), 'subjects')));
  await assertSucceeds(setDoc(doc(asAdmin, 'roles', 'bob'), { role: 'student', email: 'bob@example.test', ...stamp('admin') }));
  await assertSucceeds(getDocs(collection(database('bob'), 'subjects')));
});
test('exams are readable by the class and writable only by a manager', async () => {
  const exam = (uid) => ({ code: 'CSC123', kind: 'Mid', date: '2026-10-20', start: '09:00', end: '10:30', room: 'E-1', ...stamp(uid) });
  await assertSucceeds(setDoc(doc(database('cr'), 'exams', 'mid1'), exam('cr')));
  await assertSucceeds(getDocs(collection(database('alice'), 'exams')));
  await assertFails(setDoc(doc(database('alice'), 'exams', 'forged'), exam('alice')));
  await assertFails(getDocs(collection(database('outsider'), 'exams')));
  const db = database('cr');
  await assertFails(setDoc(doc(db, 'exams', 'bad'), { ...exam('cr'), kind: 'Viva' }));
  // Retired vocabulary: mids are not called sessionals here any more.
  await assertFails(setDoc(doc(db, 'exams', 'bad'), { ...exam('cr'), kind: 'Sessional I' }));
  await assertFails(setDoc(doc(db, 'exams', 'bad'), { ...exam('cr'), code: 'CSC999' }));
  await assertFails(setDoc(doc(db, 'exams', 'bad'), { ...exam('cr'), end: '08:00' }));
  await assertFails(setDoc(doc(db, 'exams', 'bad'), { ...exam('cr'), date: '2026-02-30' }));
  await assertFails(setDoc(doc(db, 'exams', 'bad'), { ...exam('cr'), room: '' }));
  await assertSucceeds(deleteDoc(doc(db, 'exams', 'mid1')));
});
test('exam mode is a single manager-written document and nothing else', async () => {
  const mode = (uid) => ({ active: true, label: 'Mids', from: '2026-10-20', to: '2026-10-27', ...stamp(uid) });
  await assertSucceeds(setDoc(doc(database('cr'), 'config', 'examMode'), mode('cr')));
  await assertSucceeds(getDoc(doc(database('alice'), 'config', 'examMode')));
  await assertFails(setDoc(doc(database('alice'), 'config', 'examMode'), mode('alice')));
  // Only that one id exists, so nothing can hide arbitrary class-wide state here.
  await assertFails(setDoc(doc(database('cr'), 'config', 'anythingElse'), mode('cr')));
  await assertFails(setDoc(doc(database('cr'), 'config', 'examMode'), { ...mode('cr'), to: '2026-10-01' }));
  await assertFails(setDoc(doc(database('cr'), 'config', 'examMode'), { ...mode('cr'), active: 'yes' }));
});
test('deadline types accept the current vocabulary and the retired one', async () => {
  const db = database('cr');
  // Each one is its own document: createdAt is immutable under the rules, so
  // re-setting the same id would be denied for that reason rather than the
  // type, and the test would prove nothing.
  // 'Mid' is what this university calls the mid-terms.
  await assertSucceeds(setDoc(doc(db, 'globalTasks', 'type-mid'), { ...task('cr'), type: 'Mid' }));
  // 'Sessional' is the old name. Records written under it stay writable, so a
  // CR fixing last month's date does not get refused by the server.
  await assertSucceeds(setDoc(doc(db, 'globalTasks', 'type-legacy'), { ...task('cr'), type: 'Sessional' }));
  await assertFails(setDoc(doc(db, 'globalTasks', 'type-old'), { ...task('cr'), type: 'Sessional I' }));
  await assertFails(setDoc(doc(db, 'globalTasks', 'type-bad'), { ...task('cr'), type: 'Homework' }));
});
test('unmatched paths are denied by default', async () => {
  await assertFails(getDoc(doc(database('admin'), 'secrets', 'anything')));
  await assertFails(setDoc(doc(database('admin'), 'secrets', 'anything'), { value: 1 }));
});

test('shared dates reject impossible calendar values including non-leap February 29', async () => {
  const db = database('cr');
  for (const date of ['2026-02-29', '2026-02-31', '2026-04-31', '2036-01-01']) {
    await assertFails(setDoc(doc(db, 'globalTasks', 'invalid-date'), { ...task('cr'), dueDate: date }));
  }
  for (const date of ['2028-02-29', '2032-02-29', '2026-04-30', null]) {
    await assertSucceeds(setDoc(doc(db, 'globalTasks', `date-${date}`), { ...task('cr'), dueDate: date }));
  }
});
