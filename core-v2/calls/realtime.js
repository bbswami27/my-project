' strict';

const crypto = require('crypto');

function installCallRealtime(io,{userStore}){
  const activeCalls=new Map();

  function room(userId){return `user:${userId}`;}
  function emit(userId,event,payload){io.to(room(userId)).emit(event,payload);}
  function id(){return `call_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;}

  io.on('connection',socket=>{
    const caller=socket.auth?.user;
    if(!caller)return;

    socket.on('call:start',async(payload={},ack=()=>{})=>{
      try{
        const calleeId=String(payload.calleeId||'');
        const type=payload.type==='video'?'video':'audio';
        if(!calleeId||calleeId===caller.id)return ack({ok:false,error:'Invalid callee'});
        const callee=await userStore.getById(calleeId);
        if(!callee||!callee.phoneVerified)return ack({ok:false,error:'Registered GitPit user not found'});
        const callId=id();
        const call={id:callId,callerId:caller.id,calleeId:callee.id,type,status:'ringing',createdAt:new Date().toISOString()};
        activeCalls.set(callId,call);
        emit(callee.id,'call:incoming',{callId,type,caller:{id:caller.id,name:caller.name,phone:caller.phone,avatar:caller.avatar||''}});
        ack({ok:true,callId});
      }catch(e){console.error('[CORE V2 CALL] start failed',e);ack({ok:false,error:'Unable to start call'});}
    });

    socket.on('call:accept',({callId}={},ack=()=>{})=>{
      const call=activeCalls.get(String(callId||''));
      if(!call||call.calleeId!==caller.id)return ack({ok:false,error:'Call not found'});
      call.status='accepted';call.acceptedAt=new Date().toISOString();
      emit(call.callerId,'call:accepted',{callId:call.id,acceptedAt:call.acceptedAt});ack({ok:true});
    });

    socket.on('call:reject',({callId,reason}={},ack=()=>{})=>{
      const call=activeCalls.get(String(callId||''));
      if(!call||call.calleeId!==caller.id)return ack({ok:false,error:'Call not found'});
      emit(call.callerId,'call:rejected',{callId:call.id,reason:reason||'declined'});activeCalls.delete(call.id);ack({ok:true});
    });

    socket.on('call:signal',({callId,targetUserId,signal}={},ack=()=>{})=>{
      const call=activeCalls.get(String(callId||''));
      if(!call)return ack({ok:false,error:'Call not found'});
      const allowed=[call.callerId,call.calleeId];
      if(!allowed.includes(caller.id)||!allowed.includes(String(targetUserId||'')))return ack({ok:false,error:'Not allowed'});
      emit(String(targetUserId),'call:signal',{callId:call.id,fromUserId:caller.id,signal});ack({ok:true});
    });

    socket.on('call:end',({callId,reason}={},ack=()=>{})=>{
      const call=activeCalls.get(String(callId||''));
      if(!call)return ack({ok:true});
      if(caller.id!==call.callerId&&caller.id!==call.calleeId)return ack({ok:false,error:'Not allowed'});
      const other=caller.id===call.callerId?call.calleeId:call.callerId;
      emit(other,'call:ended',{callId:call.id,reason:reason||'ended'});activeCalls.delete(call.id);ack({ok:true});
    });
  });

  return {activeCalls};
}

module.exports=installCallRealtime;
