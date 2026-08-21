'use strict';

(function installChatGroupPreferenceV11(){
  const KEY='gitpit_chat_group_preference';
  const VALID=new Set(['recent','chats_first','groups_first']);

  function getPreference(){
    const v=localStorage.getItem(KEY)||'recent';
    return VALID.has(v)?v:'recent';
  }
  function setPreference(v){
    const value=VALID.has(v)?v:'recent';
    localStorage.setItem(KEY,value);
    applyPreference();
    closeModal();
  }

  function ensureModal(){
    if(document.getElementById('gitpit-chat-group-pref-modal')) return;
    const wrap=document.createElement('div');
    wrap.id='gitpit-chat-group-pref-modal';
    wrap.className='modal-overlay';
    wrap.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;align-items:center;justify-content:center;padding:18px;';
    wrap.innerHTML=`
      <div style="width:min(430px,94vw);max-height:86vh;overflow:auto;background:var(--bg-card,#111b21);color:var(--text-primary,#fff);border-radius:16px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.35);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <button type="button" id="gitpit-pref-back" style="border:0;background:transparent;color:inherit;font-size:24px;cursor:pointer;">←</button>
          <div><div style="font-size:18px;font-weight:800;">Chat & Group Preference</div><div style="font-size:12px;opacity:.7;">Choose what should appear first in Chats.</div></div>
        </div>
        <label style="display:flex;gap:12px;padding:12px;border-radius:12px;cursor:pointer;background:var(--bg-hover,rgba(255,255,255,.04));margin-bottom:8px;">
          <input type="radio" name="gitpit-pref" value="recent" style="accent-color:var(--brand-green,#00a884);">
          <div><b>Recent activity</b><div style="font-size:12px;opacity:.7;">Keep normal recent/pinned ordering.</div></div>
        </label>
        <label style="display:flex;gap:12px;padding:12px;border-radius:12px;cursor:pointer;background:var(--bg-hover,rgba(255,255,255,.04));margin-bottom:8px;">
          <input type="radio" name="gitpit-pref" value="chats_first" style="accent-color:var(--brand-green,#00a884);">
          <div><b>Individual chats first</b><div style="font-size:12px;opacity:.7;">Personal conversations appear before groups.</div></div>
        </label>
        <label style="display:flex;gap:12px;padding:12px;border-radius:12px;cursor:pointer;background:var(--bg-hover,rgba(255,255,255,.04));">
          <input type="radio" name="gitpit-pref" value="groups_first" style="accent-color:var(--brand-green,#00a884);">
          <div><b>Groups first</b><div style="font-size:12px;opacity:.7;">Group conversations appear before personal chats.</div></div>
        </label>
        <button type="button" id="gitpit-pref-save" style="margin-top:16px;width:100%;border:0;border-radius:10px;padding:11px 14px;font-weight:800;cursor:pointer;background:var(--brand-green,#00a884);color:white;">Save Preference</button>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click',e=>{if(e.target===wrap) closeModal();});
    wrap.querySelector('#gitpit-pref-back').addEventListener('click',closeModal);
    wrap.querySelector('#gitpit-pref-save').addEventListener('click',()=>{
      const selected=wrap.querySelector('input[name="gitpit-pref"]:checked');
      setPreference(selected?selected.value:'recent');
    });
  }

  function openModal(){
    ensureModal();
    const modal=document.getElementById('gitpit-chat-group-pref-modal');
    modal.style.display='flex';
    const radio=modal.querySelector(`input[name="gitpit-pref"][value="${getPreference()}"]`);
    if(radio) radio.checked=true;
    document.getElementById('main-three-dots-dropdown')?.classList.remove('active');
  }
  function closeModal(){
    const modal=document.getElementById('gitpit-chat-group-pref-modal');
    if(modal) modal.style.display='none';
  }

  function injectMenu(){
    const panel=document.getElementById('menu-panel-chat');
    if(!panel || panel.querySelector('#menu-opt-chat-group-preference')) return !!panel;
    const btn=document.createElement('button');
    btn.className='dropdown-item';
    btn.id='menu-opt-chat-group-preference';
    btn.innerHTML='<span class="dropdown-item-icon">↕️</span><span>Chat & Group Preference</span>';
    btn.addEventListener('click',openModal);
    const header=panel.querySelector('.dropdown-panel-header');
    if(header && header.nextSibling) panel.insertBefore(btn,header.nextSibling); else panel.appendChild(btn);
    return true;
  }

  function sortChatsInPlace(ce){
    if(!ce || !Array.isArray(ce.chats)) return;
    const pref=getPreference();
    if(pref==='recent') return;
    ce.chats=ce.chats.map((c,i)=>({c,i})).sort((a,b)=>{
      // pinned chats remain highest priority within each preference bucket
      const pa=a.c?.pinned?1:0, pb=b.c?.pinned?1:0;
      if(pa!==pb) return pb-pa;
      const ga=a.c?.isGroup?1:0, gb=b.c?.isGroup?1:0;
      if(ga!==gb){
        if(pref==='groups_first') return gb-ga;
        if(pref==='chats_first') return ga-gb;
      }
      return a.i-b.i;
    }).map(x=>x.c);
  }

  function applyPreference(){
    const ce=window.ChatEngine;
    if(!ce) return;
    sortChatsInPlace(ce);
    if(typeof ce.saveChats==='function') ce.saveChats();
    if(typeof ce.renderChatList==='function') ce.renderChatList();
  }

  function patchChatEngine(){
    const ce=window.ChatEngine;
    if(!ce || ce.__chatGroupPreferenceV11) return !!ce;
    ce.__chatGroupPreferenceV11=true;
    const originalRender=typeof ce.renderChatList==='function'?ce.renderChatList.bind(ce):null;
    if(originalRender){
      ce.renderChatList=function(...args){
        sortChatsInPlace(this);
        return originalRender(...args);
      };
    }
    ce.openChatGroupPreference=openModal;
    applyPreference();
    return true;
  }

  const mo=new MutationObserver(()=>injectMenu());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    ensureModal();
    const m=injectMenu();
    const c=patchChatEngine();
    if((m&&c)||tries>80) clearInterval(timer);
  },250);

  window.GitPitChatGroupPreference={open:openModal,set:setPreference,get:getPreference,apply:applyPreference};
})();
