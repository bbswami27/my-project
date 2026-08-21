'use strict';

(function installAntiFraudMenuV13(){
  const LABEL='Anti Fraud & Stranger Field';

  function openShield(){
    const app=window.ChatterApp;
    const auth=window.AuthManager;
    document.getElementById('main-three-dots-dropdown')?.classList.remove('active');
    if(auth && typeof auth.openStrangerShieldModal==='function') return auth.openStrangerShieldModal();
    if(app && typeof app.openStrangerShieldModal==='function') return app.openStrangerShieldModal();
  }

  function removePrivacyDuplicates(){
    const roots=[
      document.getElementById('privacy-settings-modal'),
      document.getElementById('app-settings-modal'),
      document.querySelector('[data-settings-section="privacy"]')
    ].filter(Boolean);
    roots.forEach(root=>{
      [...root.querySelectorAll('button, .settings-row, .setting-row, .privacy-option, label, .dropdown-item, div')].forEach(el=>{
        const t=(el.textContent||'').trim().toLowerCase();
        if((t.includes('stranger shield') || t.includes('anti-fraud stranger')) && !el.closest('#menu-opt-stranger-shield')){
          const target=el.closest('.settings-row, .setting-row, .privacy-option, label, button') || el;
          target.style.display='none';
          target.setAttribute('data-gitpit-hidden-duplicate-shield','true');
        }
      });
    });
  }

  function ensureFirstRootItem(){
    const root=document.getElementById('menu-panel-root');
    if(!root) return false;

    let btn=document.getElementById('menu-opt-stranger-shield-root-v13');
    if(!btn){
      btn=document.createElement('button');
      btn.id='menu-opt-stranger-shield-root-v13';
      btn.className='dropdown-item';
      btn.innerHTML='<span class="dropdown-item-icon">🛡️</span><span style="flex:1;">'+LABEL+'</span>';
      btn.addEventListener('click',openShield);
    }
    if(root.firstElementChild!==btn) root.insertBefore(btn,root.firstElementChild);

    // Hide legacy copy inside Settings so there is only one menu entry.
    const legacy=document.getElementById('menu-opt-stranger-shield');
    if(legacy) legacy.style.display='none';
    return true;
  }

  function renameVisibleShieldText(){
    const legacy=document.getElementById('menu-opt-stranger-shield');
    if(legacy){
      const spans=legacy.querySelectorAll('span');
      if(spans.length) spans[spans.length-1].textContent=LABEL;
    }
    document.querySelectorAll('[id*="stranger"], [class*="stranger"]').forEach(el=>{
      const t=(el.textContent||'').trim();
      if(/^Anti-Fraud Stranger Shield$/i.test(t) || /^Anti Fraud Stranger Shield$/i.test(t)) el.textContent=LABEL;
    });
  }

  function apply(){
    ensureFirstRootItem();
    renameVisibleShieldText();
    removePrivacyDuplicates();
  }

  const mo=new MutationObserver(()=>apply());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',apply);
  setTimeout(apply,0);
  setTimeout(apply,500);
  setTimeout(apply,1500);
  window.GitPitAntiFraudMenuV13={apply,openShield};
})();
