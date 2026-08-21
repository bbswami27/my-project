'use strict';

// GitPit v1.1.2 production loader: ONLY non-conflicting modules after login.
(function installPostAuthRepairsV15(){
  const MODULES=[
    'message-delivery-v4.js',
    'call-reliability-v5.js',
    'screen-share-recipient-v9.js',
    'v112-final-repair.js'
  ];
  let loading=false,loaded=false;

  function authenticated(){
    const am=window.AuthManager;
    const overlay=document.getElementById('auth-overlay-modal');
    const hidden=!overlay||overlay.style.display==='none'||!overlay.classList.contains('active');
    const token=am?.authToken||localStorage.getItem('gitpit_auth_token')||localStorage.getItem('chatterpatter_token');
    return !!(am?.currentUser&&token&&hidden);
  }

  async function load(){
    if(loaded||loading||!authenticated())return false;
    loading=true;
    for(const name of MODULES){
      if(document.querySelector(`script[data-gitpit-repair="${name}"]`))continue;
      await new Promise(resolve=>{
        const s=document.createElement('script');
        s.src=`js/${name}?v=112c`;
        s.dataset.gitpitRepair=name;
        s.onload=()=>setTimeout(resolve,120);
        s.onerror=()=>{console.error('[GITPIT V1.1.2] module load failed',name);resolve();};
        document.body.appendChild(s);
      });
    }
    loaded=true;loading=false;
    document.documentElement.dataset.gitpitBuild='1.1.2-c';
    console.log('[GITPIT V1.1.2-c] clean repairs loaded');
    return true;
  }

  document.addEventListener('DOMContentLoaded',()=>setTimeout(load,500));
  window.addEventListener('gitpit-authenticated',()=>setTimeout(load,200));
  const timer=setInterval(()=>{if(loaded){clearInterval(timer);return;}load();},1000);
  setTimeout(()=>{if(!loaded)clearInterval(timer);},120000);
  window.GitPitLoadPostAuthRepairs=load;
})();
