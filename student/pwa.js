/* Student-only install experience. The browser-local prototype remains a demo. */
(()=>{
  const switcher=document.getElementById('mode');
  switcher.innerHTML='<option value="Student">Student app</option>';switcher.value='Student';switcher.disabled=true;
  mode='Student';page=({deals:'Live deals',points:'Points & referrals'})[new URLSearchParams(location.search).get('view')]||'Overview';render();
  const bar=document.createElement('section');bar.className='pwa-bar';bar.setAttribute('aria-label','Student app controls');
  bar.innerHTML='<div><b>UM Connect+ Student</b><span id="pwa-connection" role="status">Add campus to your home screen.</span></div><div class="pwa-bar-actions"><button class="btn primary" id="pwa-install">Add to home screen</button><button class="btn" id="pwa-update" hidden>Update app</button><a class="pwa-web-link" href="../MPP-Dashboard.html" target="_blank" rel="noopener">MPP web dashboard ↗</a></div>';
  document.querySelector('.shell header').after(bar);
  const install=document.getElementById('pwa-install'),update=document.getElementById('pwa-update');
  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  let installEvent=null,waitingWorker=null,refreshing=false;
  function connection(){const offline=!navigator.onLine;document.body.classList.toggle('pwa-is-offline',offline);document.getElementById('pwa-connection').textContent=offline?'Offline browsing · Google Maps needs internet. Demo records stay on this device.':standalone()?'Installed student app · demo data stays on this device.':'Add campus to your home screen.';install.hidden=standalone();}
  connection();window.addEventListener('online',connection);window.addEventListener('offline',connection);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;install.textContent='Install student app';connection();});
  window.addEventListener('appinstalled',()=>{installEvent=null;connection();install.hidden=true;});
  install.addEventListener('click',async()=>{
    if(installEvent){const prompt=installEvent;installEvent=null;await prompt.prompt();const choice=await prompt.userChoice;if(choice.outcome!=='accepted')install.textContent='Add to home screen';return;}
    const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
    modal('<span class="eyebrow">YOUR CAMPUS, ONE TAP AWAY</span><h2>Add UM Connect+ Student</h2>'+(apple?'<p>In Safari, tap <b>Share</b> (or open the menu, then Share), choose <b>Add to Home Screen</b>, and tap <b>Add</b>.</p>':'<p>Open your browser’s menu and choose <b>Install app</b> or <b>Add to Home screen</b>. On desktop, look for the install icon in the address bar.</p><p>If that option is unavailable, open this link in Chrome, Edge or Safari. You can continue using the website without installing.</p>')+'<p>The saved interface and café directory can be browsed offline after the first online visit. Google Maps and external links require internet.</p>');
  });
  // Recreated maps get a readable offline alternative, without caching Google tiles.
  const observeMaps=()=>document.querySelectorAll('.google-campus-frame').forEach(frame=>{if(frame.nextElementSibling?.classList.contains('pwa-map-offline'))return;const note=document.createElement('div');note.className='pwa-map-offline';note.innerHTML='<b>You’re browsing offline</b><p>Reconnect to load Google Maps. You can still browse the saved café directory.</p>';frame.after(note);});
  const observer=new MutationObserver(observeMaps);observer.observe(document.getElementById('main'),{childList:true,subtree:true});observeMaps();
  function offerUpdate(worker){waitingWorker=worker;update.hidden=false;}
  update.addEventListener('click',()=>{if(waitingWorker)waitingWorker.postMessage({type:'SKIP_WAITING'});});
  if('serviceWorker' in navigator&&isSecureContext){
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!refreshing){refreshing=true;location.reload();}});
    navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).then(reg=>{
      if(reg.waiting)offerUpdate(reg.waiting);
      reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offerUpdate(worker);});});
    }).catch(()=>{document.getElementById('pwa-connection').textContent='Student web app · offline setup unavailable. Refresh online to try again.';});
  }
})();
