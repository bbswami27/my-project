'use strict';

function installRealtime(io,{sessionStore,userStore,messageStore}){
  const socketsByUser=new Map();
  const emitToUser=(userId,event,payload)=>io.to(`user:${userId}`).emit(event,payload);

  io.use(async(socket,next)=>{
    try{
      const token=socket.handshake.auth?.token||socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i,'');
      const session=await sessionStore.validate(token);
      if(!session)return next(new Error('unauthorized'));
      const user=await userStore.getById(session.userId);
      if(!user)return next(new Error('unauthorized'));
      socket.auth={token,session,user};
      next();
    }catch(e){next(new Error('auth_unavailable'));}
  });

  io.on('connection',socket=>{
    const user=socket.auth.user;
    socket.join(`user:${user.id}`);
    if(!socketsByUser.has(user.id))socketsByUser.set(user.id,new Set());
    socketsByUser.get(user.id).add(socket.id);
    socket.emit('session:ready',{user});

    socket.on('message:delivered',async({messageId}={})=>{
      try{
        const msg=await messageStore.markDelivered(String(messageId||''),user.id);
        if(msg)emitToUser(msg.senderId,'message:delivered',{messageId:msg.id,deliveredAt:msg.deliveredAt});
      }catch(e){console.error('[CORE V2 SOCKET] delivered failed',e);}
    });

    socket.on('disconnect',()=>{
      const set=socketsByUser.get(user.id);if(!set)return;set.delete(socket.id);if(!set.size)socketsByUser.delete(user.id);
    });
  });

  return {emitToUser,isOnline:userId=>socketsByUser.has(userId)};
}

module.exports=installRealtime;
