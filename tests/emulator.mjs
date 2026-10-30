// Runs the same scenarios against Google's official Firestore emulator.
// Usage (needs Java 11+ and internet the first time):  npm run test:emulator
import fs from 'fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { runScenarios } from './scenarios.mjs';

const testEnv = await initializeTestEnvironment({
  projectId: 'umc-rules-test',
  firestore: { rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
});
await testEnv.clearFirestore();
const makeCtx = async ({ uid, email, emailVerified = true }) => {
  const db = testEnv.authenticatedContext(uid, { email, email_verified: emailVerified }).firestore();
  return { sdk, db, uid, email, profile: null };
};
const adminEmail = (/function bootstrapAdmins\(\) \{ return \['([^']+)'/.exec(fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')) || [])[1];
const r = await runScenarios({ adminEmail, makeCtx, setTime: () => {}, canSetTime: false });
await testEnv.cleanup();
process.exit(r.failed ? 1 : 0);
