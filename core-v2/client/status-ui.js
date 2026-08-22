'use strict';

(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  class CoreV2StatusUI{
    constructor({statusService,mediaService,currentUserId}){this.statusService=statusService;this.mediaService=mediaService;this.currentUserId=currentUserId;this.root=null;this.items=[];this.index=0;}
    async open(){this.items=await this.statusService.feed();this.mount();this.renderList();}
    mount(){
      this.root?.remove();const el=document.createElement('section');el.id='gp2-status-screen';el.style.cssText='position:fixed;inset:0;z-index:88000;background:#fff;display:flex;flex-direction:column';
      el.innerHTML=`<header style="height:58px;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid #ddd"><button data-back>‹</button><b style="flex:1">Status</b><button data-text>Text</button><button data-photo>Photo</button><button data-video>Video</button></header><main data-list style="flex:1;overflow:auto;padding:12px"></main><input data-photo-input type="file" accept="image/*" hidden><input data-video-input type="file" accept="video/*" hidden>`;
      document.body.appendChild(el);this.root=el;el.querySelector('[data-back]').onclick=()=>this.close();el.querySelector('[data-text]').onclick=()=>this.addText();el.querySelector('[data-photo]').onclick=()=>el.querySelector('[data-photo-input]').click();el.querySelector('[data-video]').onclick=()=>el.querySelector('[data-video-input]').click();
      el.querySelector('[data-photo-input]').onchange=e=>this.addMedia(e.target.files?.[0]);el.querySelector('[data-video-input]').onchange=e=>this.addMedia(e.target.files?.[0]);
    }
    renderList(){const box=this.root?.querySelector('[data-list]');if(!box)return;const grouped=new Map();for(const s of this.items){const uid=s.userId||s.user?.id||'unknown';if(!grouped.has(uid))grouped.set(uid,[]);grouped.get(uid).push(s);}box.innerHTML=[...grouped.entries()].map(([uid,arr])=>{const mine=uid===this.currentUserId;const u=arr[0].user||{};return `<button data-uid="${esc(uid)}" style="width:100%;text-align:left;padding:12px;border:0;border-bottom:1px solid #eee;background:#fff"><b>${mine?'My Status':esc(u.name||u.phone||'GitPit User')}</b><small style="display:block">${arr.length} update${arr.length===1?'':'s'}</small></button>`;}).join('')||'<p>No active status</p>';box.querySelectorAll('[data-uid]').forEach(btn=>btn.onclick=()=>{const uid=btn.dataset.uid;const arr=this.items.filter(s=>(s.userId||s.user?.id)===uid);this.openViewer(arr,0);});}
    async addText(){const t=prompt('Write status');if(!t?.trim())return;await this.statusService.postText(t);this.items=await this.statusService.feed();this.renderList();}
    async addMedia(file){if(!file)return;const caption=prompt('Caption (optional)')||'';await this.statusService.postMedia(file,caption);this.items=await this.statusService.feed();this.renderList();}
    async openViewer(arr,index){if(!arr?.length)return;this.index=Math.max(0,Math.min(index,arr.length-1));const s=arr[this.index];const mine=(s.userId||s.user?.id)===this.currentUserId;const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:99000;background:#000;color:#fff;display:flex;flex-direction:column';const body=document.createElement('div');body.style.cssText='flex:1;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center';overlay.innerHTML=`<header style="display:flex;align-items:center;padding:12px;gap:10px"><button data-close>✕</button><b style="flex:1">${mine?'My Status':esc(s.user?.name||s.user?.phone||'GitPit User')}</b>${mine?'<button data-seen>Seen by</button>':''}</header>`;overlay.appendChild(body);document.body.appendChild(overlay);
      if(s.type==='text')body.innerHTML=`<div style="font-size:28px;white-space:pre-wrap">${esc(s.text)}</div>`;else if(s.mediaObjectKey){try{const url=await this.mediaService.getDownloadUrl(s.mediaObjectKey);body.innerHTML=s.type==='image'?`<img src="${esc(url)}" style="max-width:100%;max-height:78vh">`:`<video src="${esc(url)}" controls autoplay style="max-width:100%;max-height:78vh"></video>`;}catch(e){body.textContent='Unable to load media';}}
      if(!mine)try{await this.statusService.markViewed(s.id);}catch(_){}
      overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.querySelector('[data-seen]')?.addEventListener('click',async()=>{try{const views=await this.statusService.viewers(s.id);alert(views.length?views.map(v=>v.name||v.phone||v.viewer_id).join('\n'):'No views yet');}catch(e){alert(e.message);}});
      overlay.onclick=e=>{if(e.target!==body)return;const x=e.clientX/window.innerWidth;if(x<.45&&this.index>0){overlay.remove();this.openViewer(arr,this.index-1);}else if(x>.55&&this.index<arr.length-1){overlay.remove();this.openViewer(arr,this.index+1);}};
    }
    close(){this.root?.remove();this.root=null;}
  }
  window.CoreV2StatusUI=CoreV2StatusUI;
})();
