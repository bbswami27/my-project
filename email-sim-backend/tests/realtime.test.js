'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const http=require('http');const crypto=require('crypto');const {Server}=require('socket.io');const WebSocket=require('ws');
const {MemoryStore}=require('./memory-store.cjs');const {AuthService,hash}=require('../security/auth');const {installRealtime}=require('../security/realtime');
function connect(url,ticket){return new Promise((resolve,reject)=>{
 const ws=new WebSocket(url);const messages=[];const timeout=setTimeout(()=>{ws.terminate();reject(Error('Socket timeout'));},3000);
 ws.on('error',reject);ws.on('message',data=>{const s=data.toString();messages.push(s);if(s.startsWith('0'))ws.send('40'+JSON.stringify({ticket}));if(s==='2')ws.send('3');if(s.startsWith('40')||s.startsWith('44')){clearTimeout(timeout);resolve({ws,messages,accepted:s.startsWith('40')});}});
});}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('actual socket gateway rejects anonymous, expires revoked sessions and contains handler errors',async(t)=>{
 const store=new MemoryStore();const server=http.createServer();const io=new Server(server);const auth=new AuthService(store,{}, {pepper:'test-pepper-is-longer-than-32-characters',onRevoke:id=>io.in('user:'+id).disconnectSockets(true)});
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const a={id:'test_user',email:'test@example.test',emailVerified:true,phone:'+919000000001',deviceKey:pair.publicKey,generation:1,simLeaseUntil:Date.now()+300000,name:'Test'};
 let session;await store.transaction(async tx=>{await tx.save('accounts',a);session=await auth.issue(tx,a,pair.publicKey,'active');});
 const ctx={account:a,session:await store.transaction(tx=>tx.get('sessions',hash(session.token)))};
 const db={editMessage(){throw Error('deliberate test failure');}};installRealtime(io,auth,db);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='ws://127.0.0.1:'+server.address().port+'/socket.io/?EIO=4&transport=websocket';const sockets=[];
 t.after(async()=>{sockets.forEach(s=>s.terminate());await new Promise(r=>io.close(r));server.close();});
 const anonymous=await connect(url,'');sockets.push(anonymous.ws);assert.equal(anonymous.accepted,false);
 const ticket=await auth.socketTicket(ctx);const valid=await connect(url,ticket.ticket);sockets.push(valid.ws);assert.equal(valid.accepted,true);
 const replay=await connect(url,ticket.ticket);sockets.push(replay.ws);assert.equal(replay.accepted,false);
 valid.ws.send('42'+JSON.stringify(['edit_message',{id:'unknown',text:'test'}]));await pause(100);assert.ok(valid.messages.some(m=>m.includes('error_message')));assert.ok(server.listening);
 await auth.logout(ctx);await pause(100);assert.ok(valid.messages.some(m=>m==='41')||valid.ws.readyState!==WebSocket.OPEN);
});
