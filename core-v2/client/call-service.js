'use strict';

(function(){
  class CoreV2CallService{
    constructor(chatService){
      this.chatService=chatService;
      this.socket=chatService?.socket||null;
      this.pc=null;this.localStream=null;this.remoteStream=null;this.call=null;this.listeners=new Map();
      this.iceServers=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
    }
    on(e,fn){if(!this.listeners.has(e))this.listeners.set(e,new Set());this.listeners.get(e).add(fn);return()=>this.listeners.get(e)?.delete(fn);}
    emit(e,p){this.listeners.get(e)?.forEach(fn=>{try{fn(p);}catch(err){console.error('[CORE V2 CALL LISTENER]',err);}});}
    bindSocket(socket){
      this.socket=socket||this.chatService?.socket;if(!this.socket)throw new Error('Realtime connection required');if(this.socket.__gp2CallsBound)return;this.socket.__gp2CallsBound=true;
      this.socket.on('call:incoming',data=>{this.call={id:data.callId,type:data.type,peer:data.caller,incoming:true,status:'ringing'};this.emit('incoming',this.call);});
      this.socket.on('call:accepted',async data=>{if(!this.call||data.callId!==this.call.id)return;this.call.status='accepted';await this.ensurePeer();await this.makeOffer();this.emit('accepted',this.call);});
      this.socket.on('call:rejected',data=>{if(this.call&&data.callId===this.call.id){this.emit('rejected',data);this.cleanup();}});
      this.socket.on('call:ended',data=>{if(this.call&&data.callId===this.call.id){this.emit('ended',data);this.cleanup();}});
      this.socket.on('call:signal',data=>this.handleSignal(data));
    }
    async media(type){return navigator.mediaDevices.getUserMedia({audio:true,video:type==='video'?{facingMode:'user'}:false});}
    async ensurePeer(){
      if(this.pc)return this.pc;
      this.localStream=this.localStream||await this.media(this.call?.type||'audio');
      this.pc=new RTCPeerConnection({iceServers:this.iceServers});
      this.localStream.getTracks().forEach(t=>this.pc.addTrack(t,this.localStream));
      this.remoteStream=new MediaStream();
      this.pc.ontrack=e=>{e.streams[0]?.getTracks().forEach(t=>this.remoteStream.addTrack(t));this.emit('remote-stream',this.remoteStream);};
      this.pc.onicecandidate=e=>{if(e.candidate&&this.call)this.signal({candidate:e.candidate});};
      this.pc.onconnectionstatechange=()=>{this.emit('state',this.pc.connectionState);if(['failed','closed','disconnected'].includes(this.pc.connectionState))this.emit('connection-problem',this.pc.connectionState);};
      this.emit('local-stream',this.localStream);return this.pc;
    }
    targetId(){return this.call?.peer?.id||this.call?.peerId;}
    signal(signal){return new Promise(resolve=>this.socket.emit('call:signal',{callId:this.call.id,targetUserId:this.targetId(),signal},resolve));}
    async start(peer,type='audio'){
      if(!peer?.id)throw new Error('Registered GitPit user required');this.bindSocket();this.localStream=await this.media(type);this.call={id:null,type:type==='video'?'video':'audio',peer,incoming:false,status:'calling'};this.emit('local-stream',this.localStream);
      return new Promise((resolve,reject)=>this.socket.emit('call:start',{calleeId:peer.id,type:this.call.type},r=>{if(!r?.ok){this.cleanup();return reject(new Error(r?.error||'Call failed'));}this.call.id=r.callId;this.emit('outgoing',this.call);resolve(this.call);}));
    }
    async accept(){
      if(!this.call?.incoming)throw new Error('No incoming call');this.bindSocket();this.localStream=await this.media(this.call.type);await this.ensurePeer();return new Promise((resolve,reject)=>this.socket.emit('call:accept',{callId:this.call.id},r=>{if(!r?.ok)return reject(new Error(r?.error||'Accept failed'));this.call.status='accepted';this.emit('accepted',this.call);resolve(this.call);}));
    }
    reject(reason='declined'){if(!this.call)return;this.socket.emit('call:reject',{callId:this.call.id,reason});this.cleanup();}
    async makeOffer(){const pc=await this.ensurePeer();const offer=await pc.createOffer();await pc.setLocalDescription(offer);await this.signal({sdp:pc.localDescription});}
    async handleSignal(data){
      if(!this.call||data.callId!==this.call.id)return;const pc=await this.ensurePeer();const s=data.signal||{};
      if(s.sdp){const desc=new RTCSessionDescription(s.sdp);await pc.setRemoteDescription(desc);if(desc.type==='offer'){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await this.signal({sdp:pc.localDescription});}}
      else if(s.candidate){try{await pc.addIceCandidate(new RTCIceCandidate(s.candidate));}catch(e){console.warn('[CORE V2 CALL] ICE add failed',e);}}
    }
    mute(flag=true){this.localStream?.getAudioTracks().forEach(t=>t.enabled=!flag);this.emit('muted',flag);}
    cameraOff(flag=true){this.localStream?.getVideoTracks().forEach(t=>t.enabled=!flag);this.emit('camera-off',flag);}
    end(reason='ended'){if(this.call?.id&&this.socket)this.socket.emit('call:end',{callId:this.call.id,reason});this.cleanup();}
    cleanup(){try{this.pc?.close();}catch(_){}this.localStream?.getTracks().forEach(t=>t.stop());this.remoteStream?.getTracks().forEach(t=>t.stop());this.pc=null;this.localStream=null;this.remoteStream=null;this.call=null;}
  }
  window.CoreV2CallService=CoreV2CallService;
})();
