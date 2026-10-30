// One-time setup: Firebase web config and MPP admin email(s).
// Writes app/js/firebase-config.js, updates bootstrapAdmins() in firestore.rules and .firebaserc.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import readline from 'readline';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = path.join(root, 'app/js/firebase-config.js');
const rulesFile = path.join(root, 'firestore.rules');
const KEYS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const pick = (text, k) => (new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`).exec(text) || [])[1] || '';

// Collect every line as it arrives (pasting sends many lines at once).
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const queue = []; let waiting = null;
rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else queue.push(l); });
let closed = false;
rl.on('close', () => { closed = true; if (waiting) waiting(null); });
const nextLine = () => (queue.length ? Promise.resolve(queue.shift()) : closed ? Promise.resolve(null) : new Promise((r) => { waiting = r; }));

const current = fs.readFileSync(cfgFile, 'utf8');
const existing = Object.fromEntries(KEYS.map((k) => [k, pick(current, k)]));
let cfg;
if (existing.apiKey && !existing.apiKey.startsWith('REPLACE') && existing.projectId) {
  process.stdout.write(`\nFirebase project already set: ${existing.projectId}\nPress Enter to keep it, or paste a new firebaseConfig block: `);
  const first = await nextLine();
  if (!first || !first.trim()) cfg = existing;
  else { let text = first + '\n'; while (!text.includes('}')) { const l = await nextLine(); if (l === null) break; text += l + '\n'; } cfg = Object.fromEntries(KEYS.map((k) => [k, pick(text, k)])); }
} else {
  console.log('\n1. Paste the firebaseConfig block from Firebase (Project settings > General > Your apps), then press Enter.\n');
  let text = '';
  while (!text.includes('}')) { const l = await nextLine(); if (l === null) break; text += l + '\n'; }
  cfg = Object.fromEntries(KEYS.map((k) => [k, pick(text, k)]));
}
if (!cfg.apiKey || !cfg.projectId) { console.error('\nCould not find apiKey and projectId. Copy the whole block including { and }.'); process.exit(1); }
process.stdout.write('\n2. MPP admin email(s), comma separated (use the Google account you will sign in with): ');
let answer = null;
for (;;) { // skip blank or leftover pasted lines
  const l = await nextLine(); if (l === null) break;
  if (l.includes('@') && !/[:{}]/.test(l)) { answer = l; break; }
}
const emails = String(answer || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
rl.close();
if (!emails.length || emails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) { console.error('\nEnter at least one valid email address.'); process.exit(1); }

fs.writeFileSync(cfgFile, current
  .replace(/export const firebaseConfig = \{[\s\S]*?\};/, `export const firebaseConfig = ${JSON.stringify(cfg, null, 2)};`)
  .replace(/export const mppBootstrapEmails = \[.*?\];/, `export const mppBootstrapEmails = ${JSON.stringify(emails)};`));
fs.writeFileSync(rulesFile, fs.readFileSync(rulesFile, 'utf8').replace(/function bootstrapAdmins\(\) \{ return \[.*?\]; \}/,
  `function bootstrapAdmins() { return [${emails.map((e) => `'${e}'`).join(', ')}]; }`));
fs.writeFileSync(path.join(root, '.firebaserc'), JSON.stringify({ projects: { default: cfg.projectId } }, null, 2) + '\n');
console.log(`\nDone. Project ${cfg.projectId}, MPP admins: ${emails.join(', ')}.\nNext: npx firebase login, then npm run deploy\n`);
