/* The worker controls /student/ only. Never caches MPP pages or third-party maps. */
const VERSION='um-connect-student-v2';
const ROOT=new URL('./',self.location.href),INDEX=new URL('index.html',ROOT).href;
const OFFLINE=new URL('offline.html',ROOT).href;
const ASSETS=['./','index.html','offline.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png','pwa.js?v=qr-20261030-1','pwa.css?v=qr-20261030-1','../app.js?v=qr-20261030-1','../campus.js?v=qr-20261030-1','../style.css?v=qr-20261030-1','../transactions.css?v=qr-20261030-1','../qr-core.js?v=qr-20261030-1','../transactions.js?v=qr-20261030-1','../qrcode.min.js?v=qr-20261030-1','../jsQR.js?v=qr-20261030-1'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('um-connect-student-')&&key!==VERSION)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==ROOT.origin||url.pathname.endsWith('/MPP-Dashboard.html'))return;
  if(req.mode==='navigate'){
    if(!url.pathname.startsWith(ROOT.pathname))return;
    event.respondWith((async()=>{const cache=await caches.open(VERSION);try{const response=await fetch(req);if(response.ok&&(url.pathname===ROOT.pathname||url.pathname===new URL(INDEX).pathname))await cache.put(INDEX,response.clone());return response;}catch{const home=url.pathname===ROOT.pathname||url.pathname===new URL(INDEX).pathname;return (home&&await cache.match(INDEX))||await cache.match(OFFLINE)||new Response('Offline. Reconnect to load UM Connect+.',{status:503});}})());return;
  }
  if(!ASSETS.includes(url.href))return;
  event.respondWith((async()=>{const cache=await caches.open(VERSION),saved=await cache.match(req);if(saved)return saved;const response=await fetch(req);if(response.ok)await cache.put(req,response.clone());return response;})());
});
