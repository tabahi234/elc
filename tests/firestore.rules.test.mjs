import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, setLogLevel } from 'firebase/firestore';

// Never point this suite at production. The SDK is connected explicitly to a local emulator.
let env;
const database = (uid, verified = true) => env.authenticatedContext(uid, { email_verified: verified }).firestore();
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
    for (const [uid, role] of Object.entries({ admin: 'admin', admin2: 'admin', cr: 'cr', alice: 'student', bob: 'student', unverified: 'student' })) {
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
