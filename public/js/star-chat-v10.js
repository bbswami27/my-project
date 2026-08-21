'use strict';

(function installStarChatV10(){
  const KEY='gitpit_starred_chats';
  function getSet(){ try{return new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));}catch(_){return new Set();} }
  function saveSet(set){ localStorage.setItem(KEY,JSON.stringify([...set])); }
  function chatEngine(){ return window.ChatEngine; }

  function toggle(chatId){
    if(!chatId) return;
    const set=getSet();
    if(set.has(chatId)) set.delete(chatId); else set.add(chatId);
    saveSet(set);
    const ce=chatEngine();
    if(ce){
      const c=(ce.chats||[]).find(x=>x.id===chatId); if(c) c.starredChat=set.has(chatId);
      if(typeof ce.saveChats==='function') ce.saveChats();
      if(typeof ce.renderChatList==='function') ce.renderChatList();
    }
    decorate();
  }

  function isStarred(chatId){ return getSet().has(chatId); }

  function decorate(){
    const ce=chatEngine(); if(!ce) return;
    const list=document.getElementById('chat-list-items'); if(!list) return;
    const nodes=[...list.querySelectorAll('[data-chat-id], .chat-list-item, .chat-item')];
    nodes.forEach((node,idx)=>{
      let id=node.getAttribute('data-chat-id');
      if(!id){
        const c=(ce.chats||[])[idx]; if(c) id=c.id;
      }
      if(!id) return;
      if(node.querySelector('.gitpit-chat-star-btn')) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='gitpit-chat-star-btn';
      btn.textContent=isStarred(id)?'★':'☆';
      btn.title=isStarred(id)?'Unstar conversation':'Star conversation';
      btn.style.cssText='margin-left:auto;border:none;background:transparent;font-size:20px;cursor:pointer;line-height:1;padding:6px;color:#f5b301;';
      btn.addEventListener('click',e=>{e.stopPropagation();toggle(id);});
      node.appendChild(btn);
    });
  }

  function installMenuAction(){
    const ce=chatEngine(); if(!ce || ce.__starChatV10) return !!ce;
    ce.__starChatV10=true;
    ce.toggleStarConversation=function(chatId){ toggle(chatId||this.activeChatId); };
    ce.isConversationStarred=function(chatId){ return isStarred(chatId||this.activeChatId); };
    const originalRender=ce.renderChatList?.bind(ce);
    if(originalRender){ ce.renderChatList=function(...args){ const out=originalRender(...args); setTimeout(decorate,0); return out; }; }
    (ce.chats||[]).forEach(c=>{ c.starredChat=isStarred(c.id); });
    decorate();
    return true;
  }

  const mo=new MutationObserver(()=>decorate());
  mo.observe(document.documentElement,{childList:true,subtree:true});
  let tries=0; const t=setInterval(()=>{tries++; if(installMenuAction()||tries>80) clearInterval(t);},250);
  window.GitPitStarChat={toggle,isStarred};
})();
