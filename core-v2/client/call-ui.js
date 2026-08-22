'use strict';

(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  class CoreV2CallUI{
    constructor(callService){this.callService=callService;this.root=null;this.peer=null;this.type='audio';this.startedAt=null;this.timer=null;this.unsubs=[];this.bind();}
    bind(){
      const s=this.callService;
      this.unsubs.push(s.on('incoming',c=>{this.peer=c.peer;this.type=c.type;this.mount('incoming');}));
      this.unsubs.push(s.on('outgoing',c=>{this.peer=c.peer;this.type=c.type;this.mount('calling');}));
      this.unsubs.push(s.on('accepted',()=>{this.setStatus('Connected');this.startedAt=Date.now();this.startTimer();this.showInCallControls();}));
      this.unsubs.push(s.on('local-stream',st=>this.attachLocal(st)));
      this.unsubs.push(s.on('remote-stream',st=>this.attachRemote(st)));
      this.unsubs.push(s.on('rejected',()=>this.finish('Call declined')));
      this.unsubs.push(s.on('ended',()=>this.finish('Call ended')));
      this.unsubs.push(s.on('connection-problem',()=>this.setStatus('Connection problem')));
    }
    async start(peer,type){this.peer=peer;this.type=type;this.mount('calling');try{await this.callService.start(peer,type);}catch(e){this.finish(e.message||'Call failed');}}
    mount(mode){
      this.root?.remove();const video=this.type==='video';const name=esc(this.peer?.name||this.peer?.gitpitName||this.peer?.phone||'GitPit User');
      const el=document.createElement('section');el.id='gp2-call-screen';el.style.cssText='position:fixed;inset:0;z-index:100000;background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:28px 18px env(safe-area-inset-bottom,24px)';
      el.innerHTML=`<div style="text-align:center;width:100%"><div style="font-size:22px;font-weight:700">${name}</div><div data-status style="margin-top:8px;opacity:.8">${mode==='incoming'?'Incoming '+(video?'video':'audio')+' call':'Calling…'}</div><div data-time style="margin-top:4px;opacity:.7"></div></div>
      <div style="position:relative;flex:1;width:100%;display:flex;align-items:center;justify-content:center;min-height:0">
        ${video?'<video data-remote autoplay playsinline style="width:100%;height:100%;max-height:62vh;object-fit:cover;border-radius:16px;background:#222"></video><video data-local autoplay muted playsinline style="position:absolute;right:12px;bottom:12px;width:28%;max-width:150px;aspect-ratio:3/4;object-fit:cover;border-radius:12px;background:#333;border:1px solid rgba(255,255,255,.3)"></video>':'<div style="width:132px;height:132px;border-radius:50%;display:grid;place-items:center;background:#2a2a2a;font-size:46px">☎</div>'}
      </div>
      <div data-actions style="display:flex;gap:14px;justify-content:center;flex-wrap:wrap;width:100%"></div>`;
      document.body.appendChild(el);this.root=el;this.renderActions(mode);
    }
    renderActions(mode){const a=this.root?.querySelector('[data-actions]');if(!a)return;
      if(mode==='incoming'){a.innerHTML='<button data-reject style="padding:14px 22px;border-radius:28px;border:0">Reject</button><button data-answer style="padding:14px 22px;border-radius:28px;border:0">Answer</button>';a.querySelector('[data-reject]').onclick=()=>this.callService.reject();a.querySelector('[data-answer]').onclick=async()=>{try{await this.callService.accept();}catch(e){this.finish(e.message||'Unable to answer');}};return;}
      a.innerHTML='<button data-mute style="padding:12px 16px;border-radius:24px;border:0">Mute</button>'+(this.type==='video'?'<button data-camera style="padding:12px 16px;border-radius:24px;border:0">Camera off</button>':'')+'<button data-end style="padding:12px 18px;border-radius:24px;border:0">End</button>';
      let muted=false,camOff=false;a.querySelector('[data-mute]').onclick=e=>{muted=!muted;this.callService.mute(muted);e.currentTarget.textContent=muted?'Unmute':'Mute';};const cam=a.querySelector('[data-camera]');if(cam)cam.onclick=e=>{camOff=!camOff;this.callService.cameraOff(camOff);e.currentTarget.textContent=camOff?'Camera on':'Camera off';};a.querySelector('[data-end]').onclick=()=>this.callService.end();
    }
    showInCallControls(){this.renderActions('active');}
    attachLocal(st){const v=this.root?.querySelector('[data-local]');if(v)v.srcObject=st;}
    attachRemote(st){const v=this.root?.querySelector('[data-remote]');if(v)v.srcObject=st;else{let a=this.root?.querySelector('audio[data-remote-audio]');if(!a){a=document.createElement('audio');a.dataset.remoteAudio='1';a.autoplay=true;this.root?.appendChild(a);}a.srcObject=st;}}
    setStatus(t){const x=this.root?.querySelector('[data-status]');if(x)x.textContent=t;}
    startTimer(){clearInterval(this.timer);this.timer=setInterval(()=>{if(!this.startedAt)return;const s=Math.floor((Date.now()-this.startedAt)/1000),m=Math.floor(s/60),r=s%60;const x=this.root?.querySelector('[data-time]');if(x)x.textContent=`${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;},1000);}
    finish(msg){clearInterval(this.timer);this.timer=null;this.setStatus(msg);setTimeout(()=>{this.root?.remove();this.root=null;},900);}
    destroy(){clearInterval(this.timer);this.unsubs.forEach(fn=>fn());this.unsubs=[];this.root?.remove();this.root=null;}
  }
  window.CoreV2CallUI=CoreV2CallUI;
})();
