'use strict';

(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmt(ts){try{return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(_){return'';}}
  function tick(m,mine){if(!mine)return'';if(m.readAt)return'✓✓';if(m.deliveredAt)return'✓✓';return'✓';}
  function bytes(n){const v=Number(n)||0;if(v<1024)return `${v} B`;if(v<1048576)return `${(v/1024).toFixed(1)} KB`;return `${(v/1048576).toFixed(1)} MB`;}

  class CoreV2ChatUI {
    constructor(service,mediaService){
      this.service=service;
      this.mediaService=mediaService||new window.CoreV2MediaService({apiBase:service.apiBase,getToken:service.getToken});
      this.peer=null;this.messages=[];this.root=null;this.unsubs=[];this.mediaUrls=new Map();
      this.recorder=null;this.recordStream=null;this.recordChunks=[];this.bindService();
    }

    bindService(){
      this.unsubs.push(this.service.on('message:new',m=>{if(!this.peer)return;if(m.senderId===this.peer.id||m.recipientId===this.peer.id){this.upsert(m);this.renderMessages();this.markLatestRead();}}));
      this.unsubs.push(this.service.on('message:sent',m=>{if(this.peer&&m.recipientId===this.peer.id){this.upsert(m);this.renderMessages();}}));
      this.unsubs.push(this.service.on('message:delivered',d=>{const m=this.messages.find(x=>x.id===d.messageId);if(m){m.deliveredAt=d.deliveredAt||new Date().toISOString();this.renderMessages();}}));
      this.unsubs.push(this.service.on('message:read',d=>{(d.messageIds||[]).forEach(id=>{const m=this.messages.find(x=>x.id===id);if(m)m.readAt=d.readAt||new Date().toISOString();});this.renderMessages();}));
    }

    upsert(msg){const i=this.messages.findIndex(x=>x.id===msg.id||(msg.clientId&&x.clientId===msg.clientId));if(i>=0)this.messages[i]={...this.messages[i],...msg};else this.messages.push(msg);this.messages.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));}

    async open(peer){
      if(!peer?.id)throw new Error('Registered GitPit contact is required');
      this.peer=peer;const d=await this.service.loadConversation(peer.id,100);this.messages=d.messages||[];this.mount();this.renderMessages();await this.markLatestRead();
    }

    mount(){
      this.root?.remove();const el=document.createElement('section');el.id='gp2-chat-screen';
      el.style.cssText='position:fixed;inset:0;z-index:90000;background:#fff;display:flex;flex-direction:column;color:#111';
      el.innerHTML=`
        <header style="height:58px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #ddd;background:#fff">
          <button data-back type="button" aria-label="Back" style="font-size:28px;border:0;background:transparent">‹</button>
          <div style="flex:1;min-width:0"><b>${esc(this.peer.name||this.peer.gitpitName||this.peer.phone||'GitPit User')}</b><small style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(this.peer.phone||'')}</small></div>
        </header>
        <main data-messages style="flex:1;overflow:auto;padding:12px;background:#f5f5f5"></main>
        <div data-attach-menu hidden style="padding:8px 10px;border-top:1px solid #ddd;background:#fff;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <button type="button" data-pick="image/*">📷<br><small>Photo</small></button>
          <button type="button" data-pick="video/*">🎥<br><small>Video</small></button>
          <button type="button" data-pick="application/pdf,text/plain">📄<br><small>Document</small></button>
          <button type="button" data-link>🔗<br><small>Link</small></button>
        </div>
        <form data-compose style="display:flex;align-items:flex-end;gap:7px;padding:8px 10px;border-top:1px solid #ddd;background:#fff">
          <button data-attach type="button" aria-label="Attachment" style="font-size:22px">📎</button>
          <textarea data-input rows="1" placeholder="Message" style="flex:1;resize:none;min-height:42px;max-height:120px;padding:10px;border:1px solid #ccc;border-radius:18px"></textarea>
          <button data-voice type="button" aria-label="Voice note" style="font-size:20px">🎙️</button>
          <button data-send type="submit">Send</button>
          <input data-file type="file" hidden>
        </form>`;
      document.body.appendChild(el);this.root=el;
      el.querySelector('[data-back]').onclick=()=>this.close();
      el.querySelector('[data-compose]').onsubmit=e=>{e.preventDefault();this.send();};
      el.querySelector('[data-attach]').onclick=()=>{const m=el.querySelector('[data-attach-menu]');m.hidden=!m.hidden;};
      el.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>this.pickFile(b.dataset.pick));
      el.querySelector('[data-link]').onclick=()=>this.sendLinkPrompt();
      el.querySelector('[data-voice]').onclick=()=>this.toggleVoice();
      el.querySelector('[data-file]').onchange=e=>{const f=e.target.files?.[0];if(f)this.sendFile(f);e.target.value='';};
      const input=el.querySelector('[data-input]');input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.send();}};
    }

    messageContent(m){
      const caption=m.body?`<div style="white-space:pre-wrap;word-break:break-word;margin-top:${m.type==='text'?'0':'6px'}">${esc(m.body)}</div>`:'';
      if(!m.type||m.type==='text')return caption;
      if(m.type==='link')return `<a href="${esc(m.linkUrl||'')}" target="_blank" rel="noopener noreferrer" style="word-break:break-all">🔗 ${esc(m.linkUrl||'Open link')}</a>${caption}`;
      const key=esc(m.mediaObjectKey||'');
      if(m.type==='image')return `<button type="button" data-media-key="${key}" data-media-type="image" style="border:0;padding:0;background:transparent"><div data-media-slot="${key}" style="min-width:180px;min-height:110px;display:grid;place-items:center;background:#eee;border-radius:8px">🖼️ Tap to load image</div></button>${caption}`;
      if(m.type==='video')return `<div data-media-slot="${key}" style="min-width:210px;min-height:120px;display:grid;place-items:center;background:#eee;border-radius:8px">🎥 Tap below to load video</div><button type="button" data-media-key="${key}" data-media-type="video">Load video</button>${caption}`;
      if(m.type==='audio'||m.type==='voice')return `<div data-media-slot="${key}">🎙️ ${esc(m.mediaName||'Voice message')}</div><button type="button" data-media-key="${key}" data-media-type="audio">Play</button>${caption}`;
      return `<button type="button" data-media-key="${key}" data-media-type="document">📄 ${esc(m.mediaName||'Document')} ${m.mediaSize?`(${bytes(m.mediaSize)})`:''}</button>${caption}`;
    }

    renderMessages(){
      if(!this.root)return;const box=this.root.querySelector('[data-messages]');const me=this.service.currentUserId;
      box.innerHTML=this.messages.map(m=>{const mine=m.senderId===me;return `<div data-id="${esc(m.id)}" style="display:flex;justify-content:${mine?'flex-end':'flex-start'};margin:5px 0"><div style="max-width:82%;padding:8px 10px;border-radius:12px;background:${mine?'#d9fdd3':'#fff'};box-shadow:0 1px 1px rgba(0,0,0,.08)">${this.messageContent(m)}<small style="display:block;text-align:right;opacity:.65;margin-top:3px">${fmt(m.createdAt)} ${tick(m,mine)}</small></div></div>`;}).join('');
      box.querySelectorAll('[data-media-key]').forEach(b=>b.onclick=()=>this.loadMedia(b.dataset.mediaKey,b.dataset.mediaType));
      box.scrollTop=box.scrollHeight;
    }

    async loadMedia(objectKey,type){
      if(!objectKey)return;try{
        let url=this.mediaUrls.get(objectKey);if(!url){url=await this.mediaService.getDownloadUrl(objectKey);this.mediaUrls.set(objectKey,url);}
        const slot=this.root?.querySelector(`[data-media-slot="${CSS.escape(objectKey)}"]`);
        if(type==='document'){window.open(url,'_blank','noopener');return;}
        if(!slot)return;
        if(type==='image')slot.innerHTML=`<img src="${esc(url)}" alt="Image" style="max-width:260px;max-height:360px;border-radius:8px;display:block">`;
        else if(type==='video')slot.innerHTML=`<video src="${esc(url)}" controls playsinline style="max-width:280px;max-height:360px;border-radius:8px"></video>`;
        else slot.innerHTML=`<audio src="${esc(url)}" controls></audio>`;
      }catch(e){alert(e.message||'Unable to open attachment');}
    }

    pickFile(accept){const f=this.root?.querySelector('[data-file]');if(!f)return;f.accept=accept||'*/*';f.click();this.root.querySelector('[data-attach-menu]').hidden=true;}

    async sendFile(file){
      if(!this.peer)return;const caption=this.root?.querySelector('[data-input]')?.value?.trim()||'';const send=this.root?.querySelector('[data-send]');
      try{if(send)send.disabled=true;await this.service.sendAttachment(this.peer.id,file,this.mediaService,caption);if(this.root?.querySelector('[data-input]'))this.root.querySelector('[data-input]').value='';}
      catch(e){alert(e.message||'Attachment not sent');}finally{if(send)send.disabled=false;}
    }

    async sendLinkPrompt(){
      if(!this.peer)return;const value=prompt('Paste link to send:');if(!value)return;let url=value.trim();if(!/^https?:\/\//i.test(url))url=`https://${url}`;
      try{new URL(url);}catch(_){alert('Please enter a valid link');return;}
      try{await this.service.sendLink(this.peer.id,url,'');}catch(e){alert(e.message||'Link not sent');}
      if(this.root)this.root.querySelector('[data-attach-menu]').hidden=true;
    }

    async toggleVoice(){
      const btn=this.root?.querySelector('[data-voice]');
      if(this.recorder&&this.recorder.state==='recording'){this.recorder.stop();if(btn){btn.textContent='🎙️';btn.title='Voice note';}return;}
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){alert('Voice recording is not supported on this device.');return;}
      try{
        this.recordStream=await navigator.mediaDevices.getUserMedia({audio:true});this.recordChunks=[];
        const preferred=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
        this.recorder=new MediaRecorder(this.recordStream,preferred?{mimeType:preferred}:undefined);
        this.recorder.ondataavailable=e=>{if(e.data?.size)this.recordChunks.push(e.data);};
        this.recorder.onstop=async()=>{try{const mime=this.recorder.mimeType||'audio/webm';const ext=mime.includes('mp4')?'m4a':'webm';const blob=new Blob(this.recordChunks,{type:mime});const file=new File([blob],`voice_${Date.now()}.${ext}`,{type:mime});await this.service.sendVoice(this.peer.id,file,this.mediaService);}catch(e){alert(e.message||'Voice note not sent');}finally{this.recordStream?.getTracks().forEach(t=>t.stop());this.recordStream=null;this.recorder=null;this.recordChunks=[];}};
        this.recorder.start();if(btn){btn.textContent='⏹️';btn.title='Stop recording';}
      }catch(e){alert('Microphone permission is required to send a voice note.');}
    }

    async send(){const input=this.root?.querySelector('[data-input]');const text=input?.value?.trim();if(!text||!this.peer)return;input.value='';try{await this.service.sendText(this.peer.id,text);}catch(e){input.value=text;alert(e.message||'Message not sent');}}

    async markLatestRead(){if(!this.peer||document.hidden)return;const me=this.service.currentUserId;const last=[...this.messages].reverse().find(m=>m.senderId===this.peer.id&&m.recipientId===me&&!m.readAt);if(!last)return;try{await this.service.markRead(last.id,this.peer.id);this.messages.filter(m=>m.senderId===this.peer.id&&new Date(m.createdAt)<=new Date(last.createdAt)).forEach(m=>m.readAt=m.readAt||new Date().toISOString());this.renderMessages();}catch(e){console.warn('[CORE V2 CHAT UI] read ack failed',e.message);}}

    close(){if(this.recorder?.state==='recording')this.recorder.stop();this.recordStream?.getTracks().forEach(t=>t.stop());this.root?.remove();this.root=null;this.peer=null;this.messages=[];this.mediaUrls.clear();}
    destroy(){this.close();this.unsubs.forEach(fn=>fn());this.unsubs=[];}
  }

  window.CoreV2ChatUI=CoreV2ChatUI;
})();
