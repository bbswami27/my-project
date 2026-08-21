'use strict';

(function installPostAuthRepairsV15(){
  const MODULES = [
    'identity-routing-v2.js',
    'ui-stability-v4.js',
    'contact-refresh-privacy-v4.js',
    'contact-directory-v5.js',
    'message-delivery-v4.js',
    'call-reliability-v5.js',
    'status-reliability-v6.js',
    'email-compose-v7.js',
    'meeting-invites-v8.js',
    'screen-share-recipient-v9.js',
    'star-chat-v10.js',
    'chat-group-preference-v11.js',
    'universal-back-v12.js',
    'anti-fraud-menu-v13.js',
    'responsive-ui-v14.js'
  ];
  let loading=false, loaded=false;

  function isAuthenticated(){
    const am=window.AuthManager;
    const overlay=document.getElementById('auth-overlay-modal');
    const overlayHidden=!overlay || overlay.style.display==='none' || !overlay.classList.contains('active');
    const token=localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token');
    return !!(am && am.currentUser && token && overlayHidden);
  }

  async function loadModules(){
    if(loaded || loading || !isAuthenticated()) return;
    loading=true;
    for(const name of MODULES){
      if(document.querySelector(`script[data-gitpit-repair="${name}"]`)) continue;
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');
        s.src=`js/${name}`;
        s.dataset.gitpitRepair=name;
        s.onload=resolve;
        s.onerror=()=>reject(new Error(`Failed to load ${name}`));
        document.body.appendChild(s);
      }).catch(err=>console.error('[POST AUTH REPAIRS]',err));
    }
    loaded=true; loading=false;
    console.log('[POST AUTH REPAIRS] all v1.0.6 modules loaded after login');
  }

  // Never alter the login screen. Only watch for authentication completing.
  document.addEventListener('DOMContentLoaded',()=>setTimeout(loadModules,300));
  window.addEventListener('gitpit-authenticated',loadModules);
  const timer=setInterval(()=>{
    if(loaded){ clearInterval(timer); return; }
    loadModules();
  },750);
  setTimeout(()=>{ if(!loaded) clearInterval(timer); },120000);

  window.GitPitLoadPostAuthRepairs=loadModules;
})();
