'use strict';

// GitPit v1.0.9 contact-stage: load only the new native contacts repair after login.
(function installPostAuthRepairsV15(){
  const MODULES=['contact-native-v16.js'];
  let loading=false, loaded=false;

  function isAuthenticated(){
    const am=window.AuthManager;
    const overlay=document.getElementById('auth-overlay-modal');
    const overlayHidden=!overlay || overlay.style.display==='none' || !overlay.classList.contains('active');
    const token=localStorage.getItem('gitpit_auth_token') || localStorage.getItem('chatterpatter_token');
    return !!(am && am.currentUser && token && overlayHidden);
  }

  async function loadModules(){
    if(loaded||loading||!isAuthenticated()) return false;
    loading=true;
    for(const name of MODULES){
      await new Promise(resolve=>{
        const s=document.createElement('script');
        s.src=`js/${name}`; s.dataset.gitpitRepair=name;
        s.onload=resolve; s.onerror=()=>{console.error('[CONTACT STAGE] failed',name);resolve();};
        document.body.appendChild(s);
      });
    }
    loaded=true; loading=false;
    console.log('[CONTACT STAGE] native contacts v16 loaded');
    return true;
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(loadModules,500));
  window.addEventListener('gitpit-authenticated',loadModules);
  const timer=setInterval(()=>{ if(loaded){clearInterval(timer);return;} loadModules(); },1000);
  setTimeout(()=>{if(!loaded)clearInterval(timer);},120000);
  window.GitPitLoadPostAuthRepairs=loadModules;
})();
