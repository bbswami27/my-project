'use strict';

(function(){
  class CoreV2ChatService {
    constructor(options={}){
      this.apiBase=(options.apiBase||window.CORE_V2_API_BASE||'').replace(/\/$/,'');
      this.getToken=options.getToken||(()=>localStorage.getItem('gp2_auth_token')||'');
      this.socket=null;
      this.listeners=new Map();
      this.currentUserId=null;
    }

    on(event,fn){
      if(!this.listeners.has(event))this.listeners.set(event,new Set());
      this.listeners.get(event).add(fn);
      return()=>this.listeners.get(event)?.delete(fn);
    }
    emit(event,payload){this.listeners.get(event)?.forEach(fn=>{try{fn(payload);}catch(e){console.error('[CORE V2 CHAT LISTENER]',e);}});}

    headers(){const t=this.getToken();return {'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})};}

    async request(path,options={}){
      const r=await fetch(`${this.apiBase}${path}`,{...options,headers:{...this.headers(),...(options.headers||{})}});
      let data={};try{data=await r.json();}catch(_){}
      if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);
      return data;
    }

    async restoreSession(){
      const d=await this.request('/api/v2/auth/session');
      this.currentUserId=d.user?.id||null;
      return d;
    }

    connectSocket(){
      const token=this.getToken();
      if(!token)throw new Error('Login required');
      if(typeof window.io!=='function')throw new Error('Socket.IO client is not loaded');
      if(this.socket){this.socket.disconnect();this.socket=null;}
      this.socket=window.io(this.apiBase||undefined,{auth:{token},transports:['websocket','polling'],reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:800,reconnectionDelayMax:5000});
      this.socket.on('connect',()=>this.emit('socket:connected',{id:this.socket.id}));
      this.socket.on('disconnect',reason=>this.emit('socket:disconnected',{reason}));
      this.socket.on('connect_error',error=>this.emit('socket:error',error));
      this.socket.on('message:new',async message=>{
        this.emit('message:new',message);
        if(message?.id){try{await this.markDelivered(message.id);}catch(e){console.warn('[CORE V2 CHAT] delivered ack failed',e.message);}}
      });
      this.socket.on('message:delivered',data=>this.emit('message:delivered',data));
      this.socket.on('message:read',data=>this.emit('message:read',data));
      return this.socket;
    }

    async loadConversation(peerId,limit=100){
      const d=await this.request(`/api/v2/messages/with/${encodeURIComponent(peerId)}?limit=${Math.min(Math.max(limit,1),200)}`);
      return d;
    }

    async sendText(recipientId,body){
      const text=String(body||'').trim();
      if(!text)throw new Error('Message cannot be empty');
      const clientId=`c_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
      const d=await this.request('/api/v2/messages',{method:'POST',body:JSON.stringify({recipientId,body:text,type:'text',clientId})});
      this.emit('message:sent',d.message);
      return d.message;
    }

    async markDelivered(messageId){
      const d=await this.request(`/api/v2/messages/${encodeURIComponent(messageId)}/delivered`,{method:'POST',body:'{}'});
      return d.message;
    }

    async markRead(messageId,peerId){
      return this.request(`/api/v2/messages/${encodeURIComponent(messageId)}/read`,{method:'POST',body:JSON.stringify({peerId})});
    }

    disconnect(){this.socket?.disconnect();this.socket=null;}
  }

  window.CoreV2ChatService=CoreV2ChatService;
})();
