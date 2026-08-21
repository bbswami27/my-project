'use strict';

(function installUniversalBackV12(){
  const STYLE_ID='gitpit-universal-back-style';
  const BTN_CLASS='gitpit-universal-back-btn';
  const modalSelectors=['.modal.active','.modal-overlay.active','[role="dialog"].active','.sheet.active','.popup.active','.drawer.active'];
  const panelSelectors=['.settings-panel.active','.dropdown-panel.active','.tab-view.active','.chat-active-view'];

  function ensureStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=`
      .${BTN_CLASS}{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:999px;background:var(--bg-card,#202c33);color:var(--text-primary,#fff);font-size:24px;line-height:1;cursor:pointer;flex:0 0 auto;margin-right:8px;box-shadow:0 1px 4px rgba(0,0,0,.18)}
      .${BTN_CLASS}:active{transform:scale(.96)}
      .gitpit-back-host{display:flex;align-items:center;gap:6px}
      @media(max-width:520px){.${BTN_CLASS}{width:34px;height:34px;font-size:22px}}
    `; document.head.appendChild(s);
  }

  function closeTopOverlay(){
    const active=[...document.querySelectorAll(modalSelectors.join(','))].filter(el=>el.offsetParent!==null || getComputedStyle(el).display!=='none');
    if(active.length){
      const el=active[active.length-1];
      const close=el.querySelector('[data-dismiss],[data-close],.modal-close,.close-modal,.btn-close,[id^="btn-close-"]');
      if(close){ close.click(); return true; }
      el.classList.remove('active','show','open');
      if(el.style.display==='flex' || el.style.display==='block') el.style.display='none';
      return true;
    }
    return false;
  }

  function closeThreeDotsSubpanel(){
    const dd=document.getElementById('main-three-dots-dropdown');
    if(!dd || !dd.classList.contains('active')) return false;
    const active=dd.querySelector('.dropdown-panel.active');
    if(active && active.id!=='menu-panel-root'){
      if(window.ChatterApp && typeof window.ChatterApp.drillDownMenu==='function') window.ChatterApp.drillDownMenu('root');
      else { active.classList.remove('active'); dd.querySelector('#menu-panel-root')?.classList.add('active'); }
      return true;
    }
    dd.classList.remove('active'); return true;
  }

  function leaveActiveChat(){
    const ce=window.ChatEngine;
    if(!ce || !ce.activeChatId) return false;
    ce.activeChatId=null;
    const active=document.getElementById('chat-active-view');
    const empty=document.getElementById('chat-empty-state');
    const sidebar=document.getElementById('sidebar-container');
    if(active) active.style.display='none';
    if(empty) empty.style.display='flex';
    if(sidebar) sidebar.style.display='flex';
    if(typeof ce.renderChatList==='function') ce.renderChatList();
    return true;
  }

  function goBack(){
    if(closeThreeDotsSubpanel()) return;
    if(closeTopOverlay()) return;
    if(leaveActiveChat()) return;
    const app=window.ChatterApp;
    if(app && app.currentTab && app.currentTab!=='chats' && typeof app.switchTab==='function') { app.switchTab('chats'); return; }
    if(history.length>1) history.back();
  }

  function addBackToHost(host){
    if(!host || host.querySelector(`.${BTN_CLASS}`)) return;
    const btn=document.createElement('button'); btn.type='button'; btn.className=BTN_CLASS; btn.setAttribute('aria-label','Back'); btn.title='Back'; btn.textContent='‹'; btn.onclick=(e)=>{e.preventDefault();e.stopPropagation();goBack();};
    host.classList.add('gitpit-back-host'); host.insertBefore(btn,host.firstChild);
  }

  function decorate(){
    ensureStyle();
    const headers=[
      ...document.querySelectorAll('.modal-header,.settings-header,.panel-header,.chat-header,.story-viewer-header,.screen-header,.page-header,.tab-header')
    ];
    headers.forEach(h=>{ if(h.offsetParent!==null || h.closest('.active')) addBackToHost(h); });

    // Fallback: active modal without a recognizable header gets a floating button at its first content block.
    document.querySelectorAll(modalSelectors.join(',')).forEach(modal=>{
      if(modal.querySelector(`.${BTN_CLASS}`)) return;
      const host=modal.querySelector('.modal-content,.modal-card,.settings-content,.popup-content,.sheet-content') || modal.firstElementChild;
      if(host){
        const row=host.querySelector('.modal-header,.settings-header,.panel-header') || host;
        addBackToHost(row);
      }
    });
  }

  // Android/Capacitor hardware back: consume before app exits.
  function bindNativeBack(){
    try{
      const App=window.Capacitor?.Plugins?.App;
      if(App && !window.__gitpitNativeBackV12){
        window.__gitpitNativeBackV12=true;
        App.addListener('backButton',()=>goBack());
      }
    }catch(_){ }
  }

  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.preventDefault(); goBack(); }});
  const mo=new MutationObserver(()=>decorate()); mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  document.addEventListener('DOMContentLoaded',()=>{decorate();bindNativeBack();});
  setTimeout(()=>{decorate();bindNativeBack();},500);
  window.GitPitBackNavigation={goBack,decorate};
})();
