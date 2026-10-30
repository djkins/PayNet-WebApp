// Copies app/ to dist/, stamps a version for cache busting and adds the rules file Demo mode reads.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'app'), out = path.join(root, 'dist');
const version = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
for (const f of ['index.html', 'sw.js']) {
  const p = path.join(out, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('__VERSION__', version));
}
fs.copyFileSync(path.join(root, 'firestore.rules'), path.join(out, 'firestore.rules'));
console.log(`Built dist/ (version ${version})`);
