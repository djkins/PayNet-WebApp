// Tiny static server for local testing: `npm run dev` then open http://localhost:5173
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, process.argv[2] || 'app'); const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.rules': 'text/plain', '.txt': 'text/plain' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  let file = path.join(dir, p);
  if (p === '/firestore.rules' && !fs.existsSync(file)) file = path.join(root, 'firestore.rules');
  if (!path.resolve(file).startsWith(path.resolve(dir)) && !file.endsWith('firestore.rules')) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  });
}).listen(port, () => console.log(`UM Connect+ on http://localhost:${port} (serving ${path.relative(root, dir)}/)`));
