'use strict';

// GitPit v1.1.2 reliable message delivery: REST persistence + socket realtime receiver.
(function installMessageDeliveryV4() {
  const seenIncoming = new Set();
  const norm=v=>String(v||'').replace(/\D/g,'').slice(-10);
  function token(){return window.AuthManager?.authToken||localStorage.getItem('gitpit_auth_token')||localStorage.getItem('chatterpatter_token')||'';}
  function base(){return window.API_BASE||'https://chitchat-chatterpatter.onrender.com';}
  function me(){return window.AuthManager?.currentUser||null;}

  function joinSocket(){
    const socket=window.ChatterApp?.socket,u=me();
    if(!socket||!u)return false;
    const identify=()=>socket.emit('user_join',{id:u.id,name:u.name,phone:u.phone,avatar:u.avatar,email:u.email});
    if(socket.connected)identify();
    if(!socket.__gpIdentityV112){socket.__gpIdentityV112=true;socket.on('connect',identify);}
    return true;
  }

  async function postMessage(payload){
    const r=await fetch(`${base()}/api/messages`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':token()?`Bearer ${token()}`:''},body:JSON.stringify(payload)});
    let data=null;try{data=await r.json();}catch(_){}
    if(!r.ok)throw new Error(data?.error||`HTTP ${r.status}`);
    return data?.message||payload;
  }
  function resolveRecipient(chat){
    if(!chat)return null;
    if(chat.isGroup||String(chat.id||'').startsWith('group_'))return chat.id;
    const p=norm(chat.phone),users=window.ChatEngine?.registeredUsers||[];
    const m=users.find(u=>String(u.id)===String(chat.id)||(p&&norm(u.phone)===p));
    return m?.id||chat.id;
  }
  function isForMe(msg){
    const u=me();if(!u)return false;
    if(String(msg.senderId||'')===String(u.id||''))return false;
    return String(msg.recipientId||'')===String(u.id||'') || (norm(msg.recipientPhone)&&norm(msg.recipientPhone)===norm(u.phone)) || String(msg.chatId||'').startsWith('group_');
  }
  function deliverIncoming(msg){
    const chat=window.ChatEngine;if(!chat||!msg)return;
    const key=String(msg.id||`${msg.senderId}:${msg.timestamp||msg.createdAt}:${msg.text||msg.type||''}`);
    if(seenIncoming.has(key)||!isForMe(msg))return;
    seenIncoming.add(key);if(seenIncoming.size>1500)seenIncoming.clear();
    try{chat.onReceiveMessage?.(msg);}catch(e){console.error('[MESSAGE V112] receive merge failed',e);}
  }
  function bindIncoming(){
    const socket=window.ChatterApp?.socket;if(!socket)return false;
    joinSocket();
    if(socket.__messageIncomingV112)return true;
    socket.__messageIncomingV112=true;
    ['receive_message','chat_message'].forEach(ev=>socket.on(ev,deliverIncoming));
    return true;
  }
  function patchSend(){
    const chat=window.ChatEngine;if(!chat||chat.__messageDeliveryV112)return !!chat;
    chat.__messageDeliveryV112=true;
    chat.sendMessage=async function(customPayload=null){
      if(window.VoiceRecorder?.isRecording){window.VoiceRecorder.stopRecording(d=>d?.audioUrl&&this.sendVoiceNote(d));this.resetRecordingUI?.();return;}
      document.getElementById('emoji-picker-container')?.classList.remove('active');document.getElementById('chat-attach-popup')?.classList.remove('active');
      const active=this.getActiveChat?.();if(!active)return;
      const ta=document.getElementById('chat-input-textarea'),text=ta?.value?.trim()||'';if(!customPayload&&!text)return;
      const u=me();if(!u||!token()){alert('Please log in again before sending a message.');return;}
      joinSocket();
      const recipientId=resolveRecipient(active);if(!recipientId){alert('This contact is not resolved on GitPit yet. Refresh contacts and try again.');return;}
      const now=Date.now(),msg={id:`msg_${now}_${Math.random().toString(36).slice(2,8)}`,chatId:active.isGroup?active.id:recipientId,senderId:u.id,senderName:u.name||'You',senderAvatar:u.avatar||'',senderPhone:u.phone||'',recipientId,recipientPhone:active.phone||'',text,time:new Date(now).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),timestamp:now,createdAt:now,status:'sending',quote:this.replyingToMessage?{...this.replyingToMessage}:null,...(customPayload||{})};
      active.messages=active.messages||[];active.messages.push(msg);if(ta){ta.value='';ta.style.height='22px';}this.clearReplyQuote?.();this.saveChats?.();this.renderMessages?.();this.renderChatList?.();this.scrollToBottom?.();
      if(active.isAi||active.id==='chat_ai'){msg.status='sent';this.saveChats?.();this.renderMessages?.();setTimeout(()=>this.handleClientAiReply?.(msg.text,u.name),250);return;}
      try{
        const saved=await postMessage(msg);Object.assign(msg,saved||{},{status:'sent'});this.saveChats?.();this.renderMessages?.();this.renderChatList?.();
        // REST saves durably; socket emission supplies immediate receiver delivery.
        window.ChatterApp?.socket?.emit('send_message',{...msg,...saved});
      }catch(err){msg.status='failed';msg.deliveryError=err.message;this.saveChats?.();this.renderMessages?.();console.error('[MESSAGE V112] delivery failed',err);alert(`Message not delivered: ${err.message}`);}
    };
    return true;
  }
  let tries=0;const timer=setInterval(()=>{tries++;const a=patchSend(),b=bindIncoming();if((a&&b)||tries>100)clearInterval(timer);},250);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){joinSocket();bindIncoming();}});window.addEventListener('online',()=>{joinSocket();bindIncoming();});
})();
