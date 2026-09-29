'use strict';
const {dto}=require('./auth');
function installRealtime(io,auth,db) {
 io.use((socket,next)=>auth.consumeTicket(socket.handshake.auth?.ticket).then(ctx=>{socket.security=ctx;next();}).catch(()=>next(Error('Authenticated SIM-verified session required.'))));
 io.on('connection',socket=>{
  const account=socket.security.account;const user=dto(account);socket.join('user:'+user.id);
  const guard=()=>auth.checkSocket(socket.security.session.id);
  socket.use((packet,next)=>guard().then(()=>next()).catch(()=>{next(Error('Session expired'));socket.disconnect(true);}));
  const timer=setInterval(()=>guard().catch(()=>socket.disconnect(true)),5000);timer.unref?.();
  socket.on('disconnect',()=>clearInterval(timer));
  const on=(event,fn)=>socket.on(event,(data={},ack)=>Promise.resolve().then(()=>fn(data)).then(result=>{if(typeof ack==='function')ack({success:true,...result});}).catch(e=>{const error={success:false,error:e.status?e.message:'Request could not be completed.'};if(typeof ack==='function')ack(error);socket.emit('error_message',error);}));
  const participants=msg=>msg.chatId?.startsWith('group_')? db.getGroups(user.id).find(g=>g.id===msg.chatId)?.members||[]:[user.id,msg.recipientId];
  const emitMessage=msg=>{for(const id of new Set(participants(msg).map(x=>typeof x==='string'?x:x.id))){if(id)io.to('user:'+id).emit('receive_message',msg);}};
  on('user_join',()=>({user}));
  on('send_message',data=>{const m=db.sendAuthorized(user.id,data);emitMessage(m);return {message:m};});
  on('edit_message',data=>{const m=db.editMessage(data.id,data.text,user.id);if(!m)throw Object.assign(Error('Message unavailable or not yours.'),{status:403});emitMessage(m);return {message:m};});
  on('delete_message',data=>{const m=db.deleteMessage(data.id,data.isForEveryone,user.id);if(!m)throw Object.assign(Error('Message unavailable or not yours.'),{status:403});for(const id of new Set(participants(m)))io.to('user:'+id).emit('message_deleted',{id:m.id,isForEveryone:data.isForEveryone!==false});return {};});
  on('delete_chat',()=>{throw Object.assign(Error('Chat deletion is disabled pending per-user deletion support.'),{status:409});});
  for(const event of ['typing','stop_typing'])on(event,data=>{if(data.recipientId&&!db.isBlocked(user.id,data.recipientId))io.to('user:'+data.recipientId).emit(event==='typing'?'user_typing':'user_stop_typing',{userId:user.id,chatId:user.id});return {};});
  // Relay only between a pair that participated in a server-observed offer.
  // Short-lived in-process call state; horizontal call routing remains a separate audit item.
  socket.callPeers=new Set();
  for(const event of ['call-user','call_user'])on(event,data=>{
   const id=data.userToCall||data.recipientId;const target=db.getUser(id);
   if(!target||db.isBlocked(user.id,id))throw Object.assign(Error('Call unavailable.'),{status:403});
   const privacy=target.privacy?.videoCall||'contacts';
   if(privacy==='nobody'||(privacy==='contacts'&&!db.isContactOf(id,user.phone)))throw Object.assign(Error('Recipient does not accept this call.'),{status:403});
   const peers=[...io.sockets.sockets.values()].filter(s=>s.security?.account.id===id);
   if(!peers.length){socket.emit('call-status',{status:'offline',message:'Recipient is not connected.'});return {};}
   for(const p of peers){socket.callPeers.add(p.id);p.callPeers.add(socket.id);p.emit('incoming-call',{...data,callerId:user.id,callerName:user.name,callerAvatar:user.avatar,fromSocketId:socket.id,callerSocketId:socket.id});}return {};
  });
  const events={'call-accepted':'call-accepted','accept_call':'call-accepted','ice-candidate':'ice-candidate','ice_candidate':'ice-candidate','call-rejected':'call-rejected','reject_call':'call-rejected','end-call':'end-call','end_call':'end-call'};
  for(const [event,output]of Object.entries(events))on(event,data=>{
   let id=data.to||data.targetSocketId||data.callerSocketId;
   if(!id){const uid=data.targetUserId||data.callerId;id=[...socket.callPeers].find(x=>io.sockets.sockets.get(x)?.security?.account.id===uid);}
   const p=io.sockets.sockets.get(id);if(!p||!socket.callPeers.has(id))throw Object.assign(Error('Call participant mismatch.'),{status:403});
   p.emit(output,{...data,callerId:user.id,fromSocketId:socket.id,responderSocketId:socket.id});
   if(output==='end-call'||output==='call-rejected'){socket.callPeers.delete(id);p.callPeers.delete(socket.id);}return {};
  });
 });
}
module.exports={installRealtime};
