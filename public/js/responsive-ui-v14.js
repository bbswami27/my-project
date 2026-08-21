'use strict';

(function installResponsiveUiV14(){
  const STYLE_ID='gitpit-responsive-v14-style';

  function ensureViewport(){
    let meta=document.querySelector('meta[name="viewport"]');
    if(!meta){ meta=document.createElement('meta'); meta.name='viewport'; document.head.appendChild(meta); }
    meta.content='width=device-width, initial-scale=1, viewport-fit=cover';
  }

  function ensureStyles(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{--gitpit-vh:1vh;--gitpit-safe-top:env(safe-area-inset-top,0px);--gitpit-safe-bottom:env(safe-area-inset-bottom,0px);}
      html,body{width:100%;max-width:100%;overflow-x:hidden;}
      body{min-height:calc(var(--gitpit-vh) * 100);}
      #app-container,.app-main{width:100%;max-width:100%;min-width:0;}
      img,video,canvas,iframe{max-width:100%;}
      .modal,.modal-content,.settings-modal-content,.profile-modal-content,.new-chat-content,.compose-memo-content,.schedule-meeting-content{max-width:min(94vw,720px)!important;max-height:calc(var(--gitpit-vh)*92)!important;overflow:auto!important;box-sizing:border-box;}
      input,select,textarea,button{max-width:100%;box-sizing:border-box;}
      .chat-header,.sidebar-header,.chat-input-area,.message-input-container{min-width:0;}
      .chat-header-info,.chat-details,.chat-item-info,.status-card-info{min-width:0;overflow:hidden;}
      .chat-header-info h3,.chat-header-info p,.chat-details h4,.chat-details p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .chat-input-area,.message-input-container{padding-bottom:max(8px,var(--gitpit-safe-bottom));}
      .sidebar-header,.chat-header{padding-top:max(8px,var(--gitpit-safe-top));}
      .bottom-nav,.mobile-bottom-nav{padding-bottom:max(6px,var(--gitpit-safe-bottom));}
      @media (max-width: 900px){
        .app-main{display:block!important;height:calc(var(--gitpit-vh)*100)!important;}
        .sidebar{width:100%!important;max-width:none!important;min-width:0!important;height:100%!important;}
        .chat-panel{position:fixed!important;inset:0!important;width:100%!important;max-width:none!important;height:calc(var(--gitpit-vh)*100)!important;z-index:30!important;}
        .chat-panel:not(.mobile-active):has(#chat-empty-state[style*="flex"]){display:none!important;}
        .chat-list{overflow-y:auto!important;-webkit-overflow-scrolling:touch;}
        .news-flash-ticker{max-width:100vw!important;overflow:hidden!important;}
        .ticker-content-wrapper{min-width:0!important;}
        .chat-filters-row{overflow-x:auto!important;white-space:nowrap!important;scrollbar-width:none;}
        .chat-filters-row::-webkit-scrollbar{display:none;}
        .three-dots-dropdown{right:8px!important;left:auto!important;max-width:calc(100vw - 16px)!important;}
      }
      @media (max-width: 480px){
        body{font-size:14px;}
        .sidebar-header{padding-left:10px!important;padding-right:10px!important;}
        .brand-logo-img{max-width:140px!important;height:42px!important;}
        .search-container{padding-left:8px!important;padding-right:8px!important;}
        .chat-list-item,.chat-item{padding-left:10px!important;padding-right:10px!important;}
        .chat-header{padding-left:8px!important;padding-right:8px!important;}
        .chat-header-actions{gap:2px!important;}
        .chat-header-actions button,.three-dots-btn{min-width:38px!important;min-height:38px!important;}
        .message-bubble{max-width:86vw!important;}
        .modal,.modal-content,.settings-modal-content,.profile-modal-content,.new-chat-content,.compose-memo-content,.schedule-meeting-content{width:96vw!important;max-width:96vw!important;margin:2vh auto!important;border-radius:12px!important;}
      }
      @media (max-width: 360px){
        body{font-size:13px;}
        .brand-logo-img{max-width:120px!important;}
        .chat-filter-chip{padding:5px 8px!important;font-size:11px!important;}
        .message-bubble{max-width:90vw!important;}
      }
      @media (orientation: landscape) and (max-height: 600px){
        .news-flash-ticker{min-height:34px!important;}
        .sidebar-header{padding-top:4px!important;padding-bottom:4px!important;}
        .brand-logo-img{height:36px!important;}
        .chat-header{min-height:50px!important;}
        .modal,.modal-content,.settings-modal-content,.profile-modal-content,.new-chat-content,.compose-memo-content,.schedule-meeting-content{max-height:92vh!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function setViewportVars(){
    const h=(window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--gitpit-vh', `${h*0.01}px`);
    document.documentElement.dataset.orientation = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    document.documentElement.dataset.screenWidth = String(window.innerWidth);
  }

  function normalizePanels(){
    document.querySelectorAll('.modal.active,.settings-modal.active,.profile-modal.active,.new-chat-modal.active').forEach(el=>{
      el.style.maxWidth='100vw';
      el.style.maxHeight='calc(var(--gitpit-vh) * 100)';
    });
    const activeChat = window.ChatEngine && window.ChatEngine.activeChatId;
    const panel=document.querySelector('.chat-panel');
    if(panel) panel.classList.toggle('mobile-active', !!activeChat);
  }

  function apply(){ ensureViewport(); ensureStyles(); setViewportVars(); normalizePanels(); }
  apply();
  window.addEventListener('resize',apply,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(apply,120),{passive:true});
  if(window.visualViewport){ window.visualViewport.addEventListener('resize',apply,{passive:true}); }
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) apply(); });
  const mo=new MutationObserver(()=>normalizePanels());
  mo.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
  window.GitPitResponsiveUI={apply};
})();
