'use strict';

// GitPit v1.0.4 Point 4 - reliable call history + refresh across call filters/tabs.
(function installCallReliabilityV5(){
  function authToken(){ return (window.AuthManager&&window.AuthManager.authToken)||localStorage.getItem('gitpit_auth_token')||localStorage.getItem('chatterpatter_token')||''; }
  function apiBase(){ return window.API_BASE||'https://chitchat-chatterpatter.onrender.com'; }
  function nowTime(){ return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); }
  function accountKey(){
    const id=window.AuthManager?.currentUser?.id;
    return id ? 'gitpit_calls_account_'+id : null;
  }
  function hydrateAccount(cm){
    const key=accountKey();
    if(!key || cm.__historyAccount===key)return;
    const old=Array.isArray(cm.callLogs)?cm.callLogs:[];
    if(old.length && !localStorage.getItem('gitpit_legacy_call_backup')){
      try{localStorage.setItem('gitpit_legacy_call_backup',JSON.stringify(old));}catch(_){}
    }
    const saved=localStorage.getItem(key);
    let local=[];
    if(saved){try{const parsed=JSON.parse(saved);if(Array.isArray(parsed))local=parsed;}catch(_){}}
    // Preserve the first user's legacy history rather than overwriting it.
    if(!saved && !localStorage.getItem('gitpit_legacy_call_owner')){
      localStorage.setItem('gitpit_legacy_call_owner',key);
      local=old;
    }
    cm.__historyAccount=key;
    cm.callLogs=local;
  }
  function persist(cm){
    try {
      const key=accountKey();
      if(key) localStorage.setItem(key,JSON.stringify(cm.callLogs||[]));
      else localStorage.setItem('gitpit_calls', JSON.stringify(cm.callLogs||[]));
    } catch(_){}
    try { if(typeof cm.renderCallsTab==='function') cm.renderCallsTab(); } catch(_){}
  }
  function addOrUpdate(cm, patch){
    cm.callLogs = Array.isArray(cm.callLogs) ? cm.callLogs : [];
    let log = patch.id ? cm.callLogs.find(x=>x.id===patch.id) : null;
    if(!log && patch.sessionKey) log = cm.callLogs.find(x=>x.sessionKey===patch.sessionKey);
    if(log) Object.assign(log, patch);
    else { log={...patch}; cm.callLogs.unshift(log); }
    persist(cm); return log;
  }
  async function postServerLog(log){
    try{
      if(!log?.contactId)return;
      const r=await fetch(`${apiBase()}/api/calls`, {method:'POST', headers:{'Content-Type':'application/json','Authorization':authToken()?`Bearer ${authToken()}`:''}, body:JSON.stringify(log)});
      if(!r.ok) console.warn('[CALL HISTORY] server save rejected HTTP',r.status);
    }catch(err){console.warn('[CALL HISTORY] server save unavailable',err.message);}
  }
  async function loadServerLogs(cm){
    if(!authToken() || !accountKey()) return;
    hydrateAccount(cm);
    try{
      const r=await fetch(`${apiBase()}/api/calls`, {headers:{'Authorization':`Bearer ${authToken()}`}});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      const list=Array.isArray(d)?d:(Array.isArray(d.callLogs)?d.callLogs:[]);
      const map=new Map((cm.callLogs||[]).map(x=>[x.id||x.sessionKey,x]));
      list.forEach(x=>{
        const k=x.id||x.sessionKey;
        if(!k)return;
        const previous=map.get(k)||{};
        map.set(k,{...previous,...x,
          name:x.name||previous.name||'GitPit Member',
          contactId:x.contactId||previous.contactId||'',
          timestamp:Number(x.timestamp)||Number(x.createdAt)||Date.now()});
      });
      cm.callLogs=Array.from(map.values()).sort((a,b)=>Number(b.createdAt||b.timestamp||0)-Number(a.createdAt||a.timestamp||0));
      persist(cm);
      console.log('[CALL HISTORY] loaded records',list.length);
    }catch(err){console.warn('[CALL HISTORY] fetch failed',err.message);}
  }
  function patch(){
    const cm=window.CallManager;
    if(!cm||cm.__callReliabilityV5) return !!cm;
    cm.__callReliabilityV5=true;
    hydrateAccount(cm);

    const originalStart=typeof cm.startCall==='function'?cm.startCall.bind(cm):null;
    if(originalStart){
      cm.startCall=async function(name,avatar,type='audio',contactId=null){
        const key=`call_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const target=(window.ChatEngine&&window.ChatEngine.chats||[]).find(c=>c.id===contactId)||{};
        this.__activeHistoryKey=key;
        addOrUpdate(this,{id:key,sessionKey:key,name:name||target.name||'Contact',avatar:avatar||target.avatar||'assets/logo-icon.svg',contactId:contactId||target.id||'',phone:target.phone||'',type,direction:'outgoing',status:'ringing',time:nowTime(),timestamp:Date.now(),createdAt:Date.now(),duration:0});
        try { return await originalStart(name,avatar,type,contactId); }
        catch(e){ addOrUpdate(this,{sessionKey:key,status:'failed',endedAt:Date.now()}); throw e; }
      };
    }

    const originalIncoming=typeof cm.showIncomingCallPrompt==='function'?cm.showIncomingCallPrompt.bind(cm):null;
    if(originalIncoming){
      cm.showIncomingCallPrompt=function(name,avatar,type='audio',callerId=null,callerSocketId=null,signalData=null,callerPhone=''){
        const key=`incoming_${callerId||callerPhone||'unknown'}_${Date.now()}`;
        this.__pendingHistoryKey=key;
        addOrUpdate(this,{id:key,sessionKey:key,name:name||callerPhone||'Incoming Caller',avatar:avatar||'assets/logo-icon.svg',contactId:callerId||'',phone:callerPhone||'',type,direction:'incoming',status:'ringing',time:nowTime(),timestamp:Date.now(),createdAt:Date.now(),duration:0});
        return originalIncoming(name,avatar,type,callerId,callerSocketId,signalData,callerPhone);
      };
    }

    const originalAnswer=typeof cm.answerIncomingCall==='function'?cm.answerIncomingCall.bind(cm):null;
    if(originalAnswer){
      cm.answerIncomingCall=async function(type='audio'){
        const key=this.__pendingHistoryKey;
        if(key) this.__activeHistoryKey=key;
        if(key) addOrUpdate(this,{sessionKey:key,status:'connected',answeredAt:Date.now(),type});
        return await originalAnswer(type);
      };
    }

    const originalDecline=typeof cm.declineIncomingCall==='function'?cm.declineIncomingCall.bind(cm):null;
    if(originalDecline){
      cm.declineIncomingCall=function(){
        const key=this.__pendingHistoryKey;
        if(key){ const log=addOrUpdate(this,{sessionKey:key,status:'missed',endedAt:Date.now(),duration:0}); postServerLog(log); }
        this.__pendingHistoryKey=null;
        return originalDecline();
      };
    }

    const originalAccepted=typeof cm.handleCallAccepted==='function'?cm.handleCallAccepted.bind(cm):null;
    if(originalAccepted){
      cm.handleCallAccepted=async function(data){
        if(this.__activeHistoryKey) addOrUpdate(this,{sessionKey:this.__activeHistoryKey,status:'connected',answeredAt:Date.now()});
        return await originalAccepted(data);
      };
    }

    const originalRejected=typeof cm.handleCallRejected==='function'?cm.handleCallRejected.bind(cm):null;
    if(originalRejected){
      cm.handleCallRejected=function(data){
        if(this.__activeHistoryKey){ const log=addOrUpdate(this,{sessionKey:this.__activeHistoryKey,status:'rejected',endedAt:Date.now(),duration:this.callSeconds||0}); postServerLog(log); }
        return originalRejected(data);
      };
    }

    const originalEnd=typeof cm.endCall==='function'?cm.endCall.bind(cm):null;
    if(originalEnd){
      cm.endCall=function(...args){
        const key=this.__activeHistoryKey||this.__pendingHistoryKey;
        if(key){
          const existing=(this.callLogs||[]).find(x=>x.sessionKey===key);
          const finalStatus=existing&&existing.status==='ringing' ? (existing.direction==='incoming'?'missed':'no-answer') : ((existing&&existing.status)||'completed');
          const log=addOrUpdate(this,{sessionKey:key,status:finalStatus==='connected'?'completed':finalStatus,endedAt:Date.now(),duration:this.callSeconds||0});
          postServerLog(log);
        }
        this.__activeHistoryKey=null; this.__pendingHistoryKey=null;
        return originalEnd(...args);
      };
    }

    // Keep Calls tab synchronized whenever user opens it or returns to foreground.
    document.addEventListener('click',e=>{
      const t=e.target.closest('[data-tab="calls"], [data-filter="calls"], .calls-filter-chip, [data-call-filter]');
      if(t) setTimeout(()=>{ loadServerLogs(cm); try{cm.renderCallsTab();}catch(_){} },50);
    });
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setTimeout(()=>loadServerLogs(cm),150); });
    window.addEventListener('online',()=>setTimeout(()=>loadServerLogs(cm),150));
    loadServerLogs(cm);
    window.addEventListener('gitpit-authenticated',()=>loadServerLogs(cm));
    console.log('[CALL V5] Point 4 call reliability/history installed');
    return true;
  }
  let n=0; const timer=setInterval(()=>{n++; if(patch()||n>80) clearInterval(timer);},250);
})();
