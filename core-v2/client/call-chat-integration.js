'use strict';

(function(){
  function install(){
    const chatService=window.gp2ChatService||window.coreV2ChatService||window.chatService;
    if(!chatService||!window.CoreV2CallService||!window.CoreV2CallUI)return false;
    if(!window.gp2CallService){window.gp2CallService=new window.CoreV2CallService(chatService);window.gp2CallService.bindSocket(chatService.socket);window.gp2CallUI=new window.CoreV2CallUI(window.gp2CallService);}
    const observer=new MutationObserver(()=>{
      const screen=document.getElementById('gp2-chat-screen');if(!screen||screen.dataset.callsReady==='1')return;
      const header=screen.querySelector('header');if(!header)return;
      const peer=(window.gp2ChatUI&&window.gp2ChatUI.peer)||(window.coreV2ChatUI&&window.coreV2ChatUI.peer);if(!peer?.id)return;
      const box=document.createElement('div');box.style.cssText='display:flex;gap:6px;margin-left:auto';
      const audio=document.createElement('button');audio.type='button';audio.textContent='☎';audio.setAttribute('aria-label','Audio call');audio.style.cssText='font-size:20px;border:0;background:transparent;padding:8px';
      const video=document.createElement('button');video.type='button';video.textContent='▣';video.setAttribute('aria-label','Video call');video.style.cssText='font-size:20px;border:0;background:transparent;padding:8px';
      audio.onclick=()=>window.gp2CallUI.start(peer,'audio');video.onclick=()=>window.gp2CallUI.start(peer,'video');box.append(audio,video);header.appendChild(box);screen.dataset.callsReady='1';
    });
    observer.observe(document.body,{childList:true,subtree:true});window.__gp2CallChatObserver=observer;return true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0));else setTimeout(install,0);
})();
