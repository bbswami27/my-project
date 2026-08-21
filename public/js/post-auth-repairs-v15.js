'use strict';

// GitPit v1.1.1 production loader: reviewed modules only, after successful login.
(function installPostAuthRepairsV15(){
  const MODULES=[
    'contact-native-v16.js',
    'message-delivery-v4.js',
    'call-reliability-v5.js',
    'status-reliability-v6.js',
    'meeting-invites-v8.js',
    'screen-share-recipient-v9.js',
    'safe-ui-final-v20.js',
    'v111-ui-data-fixes.js'
  ];
  let loading=false,loaded=false;

  function authenticated(){
    const am=window.AuthManager;
    const overlay=document.getElementById('auth-overlay-modal');
    const hidden=!overlay||overlay.style.display==='none'||!overlay.classList.contains('active');
    const token=localStorage.getItem('gitpit_auth_token')||localStorage.getItem('chatterpatter_token');
    return !!(am?.currentUser&&token&&hidden);
  }

  async function load(){
    if(loaded||loading||!authenticated())return false;
    loading=true;
    for(const name of MODULES){
      if(document.querySelector(`script[data-gitpit-repair="${name}"]`))continue;
      await new Promise(resolve=>{
        const s=document.createElement('script');
        s.src=`js/${name}?v=111`;
        s.dataset.gitpitRepair=name;
        s.onload=()=>setTimeout(resolve,120);
        s.onerror=()=>{console.error('[GITPIT V1.1.1] module load failed',name);resolve();};
        document.body.appendChild(s);
      });
    }
    loaded=true;loading=false;
    console.log('[GITPIT V1.1.1] reviewed repairs loaded');
    return true;
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(load,600));
  window.addEventListener('gitpit-authenticated',()=>setTimeout(load,250));
  const timer=setInterval(()=>{if(loaded){clearInterval(timer);return;}load();},1200);
  setTimeout(()=>{if(!loaded)clearInterval(timer);},120000);
  window.GitPitLoadPostAuthRepairs=load;
})();
