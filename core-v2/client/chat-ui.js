'use strict';

(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(ts){try{return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(_){return'';}}
  function tick(m,mine){if(!mine)return'';if(m.readAt)return'✓✓';if(m.deliveredAt)return'✓✓';return'✓';}

  class CoreV2ChatUI {
    constructor(service){
      this.service=service;
      this.peer=null;
      this.messages=[];
      this.root=null;
      this.unsubs=[];
      this.bindService();
    }

    bindService(){
      this.unsubs.push(this.service.on('message:new',m=>{
        if(!this.peer)return;
        if(m.senderId===this.peer.id||m.recipientId===this.peer.id){this.upsert(m);this.renderMessages();this.markLatestRead();}
      }));
      this.unsubs.push(this.service.on('message:sent',m=>{if(this.peer&&m.recipientId===this.peer.id){this.upsert(m);this.renderMessages();}}));
      this.unsubs.push(this.service.on('message:delivered',d=>{const m=this.messages.find(x=>x.id===d.messageId);if(m){m.deliveredAt=d.deliveredAt||new Date().toISOString();this.renderMessages();}}));
      this.unsubs.push(this.service.on('message:read',d=>{(d.messageIds||[]).forEach(id=>{const m=this.messages.find(x=>x.id===id);if(m)m.readAt=d.readAt||new Date().toISOString();});this.renderMessages();}));
    }

    upsert(msg){const i=this.messages.findIndex(x=>x.id===msg.id||(msg.clientId&&x.clientId===msg.clientId));if(i>=0)this.messages[i]={...this.messages[i],...msg};else this.messages.push(msg);this.messages.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));}

    async open(peer){
      if(!peer?.id)throw new Error('Registered GitPit contact is required');
      this.peer=peer;
      const d=await this.service.loadConversation(peer.id,100);
      this.messages=d.messages||[];
      this.mount();
      this.renderMessages();
      await this.markLatestRead();
    }

    mount(){
      this.root?.remove();
      const el=document.createElement('section');
      el.id='gp2-chat-screen';
      el.style.cssText='position:fixed;inset:0;z-index:90000;background:#fff;display:flex;flex-direction:column;color:#111';
      el.innerHTML=`
        <header style="height:58px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #ddd">
          <button data-back type="button" aria-label="Back">‹</button>
          <div style="flex:1;min-width:0"><b>${esc(this.peer.name||this.peer.gitpitName||this.peer.phone||'GitPit User')}</b><small style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(this.peer.phone||'')}</small></div>
        </header>
        <main data-messages style="flex:1;overflow:auto;padding:12px;background:#f5f5f5"></main>
        <form data-compose style="display:flex;gap:8px;padding:10px;border-top:1px solid #ddd;background:#fff">
          <textarea data-input rows="1" placeholder="Message" style="flex:1;resize:none;min-height:42px;max-height:120px;padding:10px;border:1px solid #ccc;border-radius:18px"></textarea>
          <button data-send type="submit">Send</button>
        </form>`;
      document.body.appendChild(el);this.root=el;
      el.querySelector('[data-back]').onclick=()=>this.close();
      el.querySelector('[data-compose]').onsubmit=e=>{e.preventDefault();this.send();};
      const input=el.querySelector('[data-input]');
      input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.send();}};
    }

    renderMessages(){
      if(!this.root)return;
      const box=this.root.querySelector('[data-messages]');
      const me=this.service.currentUserId;
      box.innerHTML=this.messages.map(m=>{
        const mine=m.senderId===me;
        return `<div data-id="${esc(m.id)}" style="display:flex;justify-content:${mine?'flex-end':'flex-start'};margin:5px 0"><div style="max-width:82%;padding:8px 10px;border-radius:12px;background:${mine?'#d9fdd3':'#fff'};box-shadow:0 1px 1px rgba(0,0,0,.08)"><div style="white-space:pre-wrap;word-break:break-word">${esc(m.body)}</div><small style="display:block;text-align:right;opacity:.65;margin-top:3px">${fmt(m.createdAt)} ${tick(m,mine)}</small></div></div>`;
      }).join('');
      box.scrollTop=box.scrollHeight;
    }

    async send(){
      const input=this.root?.querySelector('[data-input]');
      const text=input?.value?.trim();if(!text||!this.peer)return;
      input.value='';
      try{await this.service.sendText(this.peer.id,text);}catch(e){input.value=text;alert(e.message||'Message not sent');}
    }

    async markLatestRead(){
      if(!this.peer||document.hidden)return;
      const me=this.service.currentUserId;
      const last=[...this.messages].reverse().find(m=>m.senderId===this.peer.id&&m.recipientId===me&&!m.readAt);
      if(!last)return;
      try{await this.service.markRead(last.id,this.peer.id);this.messages.filter(m=>m.senderId===this.peer.id&&new Date(m.createdAt)<=new Date(last.createdAt)).forEach(m=>m.readAt=m.readAt||new Date().toISOString());this.renderMessages();}catch(e){console.warn('[CORE V2 CHAT UI] read ack failed',e.message);}
    }

    close(){this.root?.remove();this.root=null;this.peer=null;this.messages=[];}
    destroy(){this.close();this.unsubs.forEach(fn=>fn());this.unsubs=[];}
  }

  window.CoreV2ChatUI=CoreV2ChatUI;
})();
