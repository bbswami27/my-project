'use strict';

(function(){
  class CoreV2StatusService{
    constructor(options={}){
      this.apiBase=(options.apiBase||window.CORE_V2_API_BASE||'').replace(/\/$/,'');
      this.getToken=options.getToken||(()=>localStorage.getItem('gp2_auth_token')||'');
      this.mediaService=options.mediaService||null;
    }
    headers(){const t=this.getToken();return {'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})};}
    async request(path,options={}){const r=await fetch(`${this.apiBase}${path}`,{...options,headers:{...this.headers(),...(options.headers||{})}});let d={};try{d=await r.json();}catch(_){}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;}
    async feed(){return (await this.request('/api/v2/status/feed')).statuses||[];}
    async postText(text){const v=String(text||'').trim();if(!v)throw new Error('Status text is required');return (await this.request('/api/v2/status',{method:'POST',body:JSON.stringify({type:'text',text:v})})).status;}
    async postMedia(file,caption=''){
      if(!this.mediaService?.uploadFile)throw new Error('Media service is required');
      const meta=await this.mediaService.uploadFile(file);
      const mime=String(meta.mediaMime||'').toLowerCase();
      const type=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':'';
      if(!type)throw new Error('Status media must be image or video');
      return (await this.request('/api/v2/status',{method:'POST',body:JSON.stringify({type,text:String(caption||''),...meta})})).status;
    }
    async markViewed(id){return this.request(`/api/v2/status/${encodeURIComponent(id)}/view`,{method:'POST',body:'{}'});}
    async viewers(id){return (await this.request(`/api/v2/status/${encodeURIComponent(id)}/views`)).views||[];}
  }
  window.CoreV2StatusService=CoreV2StatusService;
})();
