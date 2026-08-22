'use strict';

(function(){
  class CoreV2MediaService{
    constructor(options={}){this.apiBase=(options.apiBase||window.CORE_V2_API_BASE||'').replace(/\/$/,'');this.getToken=options.getToken||(()=>localStorage.getItem('gp2_auth_token')||'');}
    headers(){const t=this.getToken();return {'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})};}
    async json(path,options={}){const r=await fetch(`${this.apiBase}${path}`,{...options,headers:{...this.headers(),...(options.headers||{})}});let d={};try{d=await r.json();}catch(_){}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;}
    async uploadFile(file){
      if(!file)throw new Error('File required');
      if(file.size>50*1024*1024)throw new Error('Maximum attachment size is 50MB');
      const meta=await this.json('/api/v2/media/upload-url',{method:'POST',body:JSON.stringify({fileName:file.name||'attachment',mime:file.type||'application/octet-stream',size:file.size})});
      const put=await fetch(meta.uploadUrl,{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
      if(!put.ok)throw new Error(`Attachment upload failed (${put.status})`);
      return {mediaObjectKey:meta.objectKey,mediaName:file.name||'attachment',mediaMime:file.type||'',mediaSize:file.size};
    }
    async getDownloadUrl(objectKey){const d=await this.json(`/api/v2/media/download-url?objectKey=${encodeURIComponent(objectKey)}`);return d.url;}
  }
  window.CoreV2MediaService=CoreV2MediaService;
})();
