// Runs tests/scenarios.mjs against the local rules evaluator (no network, no Java).
import fs from 'fs';
import * as sdk from '../app/js/fake/fakefb.js';
import { runScenarios } from './scenarios.mjs';

let now = Date.now();
const commits = [];
sdk.configureFake({
  rulesSource: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
  storage: null, session: null, now: () => now,
  log: process.env.VERBOSE ? console.log : null,
  onCommit: (c) => commits.push(c.access),
});
const makeCtx = async ({ uid, email, emailVerified = true }) => {
  const auth = sdk._testAuth({ uid, email, emailVerified });
  return { sdk, db: sdk._testDb(auth), uid, email, profile: null, now: () => now };
};
const adminEmail = (/function bootstrapAdmins\(\) \{ return \['([^']+)'/.exec(fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')) || [])[1];
const r = await runScenarios({ adminEmail, makeCtx, setTime: (t) => { now = t; } });
console.log(`Max distinct document lookups in one batch: ${Math.max(...commits)} (Firestore limit 20)`);
process.exit(r.failed ? 1 : 0);
