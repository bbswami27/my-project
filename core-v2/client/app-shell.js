'use strict';

(function(){
  class GitPitCoreAppShell{
    constructor({chatService=null,chatUI=null,statusUI=null,callService=null}={}){
      this.chatService=chatService;this.chatUI=chatUI;this.statusUI=statusUI;this.callService=callService;
      this.root=null;this.active='chats';this.history=[];
    }

    mount(){
      if(this.root)return this.root;
      const root=document.createElement('div');root.className='gp2-shell';root.id='gp2-core-shell';
      root.innerHTML=`
        <header class="gp2-topbar"><strong class="gp2-brand">GitPit</strong><button type="button" data-new aria-label="New chat">✎</button></header>
        <main class="gp2-content">
          <section class="gp2-panel active" data-panel="chats"><div data-chats class="gp2-list"></div><div data-chats-empty class="gp2-empty">No chats yet. Tap ✎ to start a new chat.</div></section>
          <section class="gp2-panel" data-panel="status"><div class="gp2-status-host" data-status-host></div></section>
          <section class="gp2-panel" data-panel="calls"><div data-calls class="gp2-empty">No call history yet.</div></section>
        </main>
        <button class="gp2-fab" type="button" data-fab aria-label="New chat">✎</button>
        <nav class="gp2-bottomnav">
          <button class="active" type="button" data-nav="chats"><span>💬</span>Chats</button>
          <button type="button" data-nav="status"><span>◉</span>Status</button>
          <button type="button" data-nav="calls"><span>☎</span>Calls</button>
        </nav>`;
      document.body.appendChild(root);this.root=root;
      root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>this.show(b.dataset.nav));
      root.querySelector('[data-new]').onclick=()=>this.openNewChat();
      root.querySelector('[data-fab]').onclick=()=>this.openNewChat();
      window.addEventListener('popstate',()=>this.back());
      document.addEventListener('keydown',e=>{if(e.key==='Escape')this.back();});
      this.renderChats();
      return root;
    }

    show(name,push=true){
      if(!['chats','status','calls'].includes(name))name='chats';
      this.active=name;
      this.root?.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('active',p.dataset.panel===name));
      this.root?.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));
      const fab=this.root?.querySelector('[data-fab]');if(fab)fab.style.display=name==='chats'?'block':'none';
      if(name==='status'&&this.statusUI){const host=this.root.querySelector('[data-status-host]');try{this.statusUI.mount?.(host);this.statusUI.load?.();}catch(e){console.warn('[CORE V2 SHELL] status load',e);}}
      if(push){this.history.push(name);try{history.pushState({gp2:name},'',location.href);}catch(_){}}
    }

    openNewChat(){
      if(!window.GitPitCoreNewChat?.open)return alert('Contacts module is not ready.');
      window.GitPitCoreNewChat.open(peer=>this.openChat(peer));
    }

    async openChat(peer){
      const normalized={id:peer.id||peer.userId,userId:peer.userId||peer.id,name:peer.name,phone:peer.phone,avatar:peer.avatar||''};
      if(!normalized.id)return;
      this.history.push('chat');
      try{await this.chatUI?.open(normalized);this.rememberPeer(normalized);}catch(e){alert(e.message||'Unable to open chat');}
    }

    rememberPeer(peer){
      let arr=[];try{arr=JSON.parse(localStorage.getItem('gp2_recent_peers')||'[]');}catch(_){}
      arr=[peer,...arr.filter(x=>x.id!==peer.id)].slice(0,50);localStorage.setItem('gp2_recent_peers',JSON.stringify(arr));this.renderChats();
    }

    renderChats(){
      const box=this.root?.querySelector('[data-chats]'),empty=this.root?.querySelector('[data-chats-empty]');if(!box)return;
      let peers=[];try{peers=JSON.parse(localStorage.getItem('gp2_recent_peers')||'[]');}catch(_){}
      empty.style.display=peers.length?'none':'block';
      box.innerHTML='';
      peers.forEach(peer=>{
        const b=document.createElement('button');b.type='button';b.className='gp2-row';
        const initials=String(peer.name||peer.phone||'G').trim().slice(0,1).toUpperCase();
        b.innerHTML=`<span class="gp2-avatar">${initials}</span><span class="gp2-row-main"><b></b><small></small></span>`;
        b.querySelector('b').textContent=peer.name||peer.phone||'GitPit User';b.querySelector('small').textContent=peer.phone||'';b.onclick=()=>this.openChat(peer);box.appendChild(b);
      });
    }

    back(){
      const chat=document.getElementById('gp2-chat-screen');if(chat){this.chatUI?.close?.();return true;}
      const newChat=document.getElementById('gp2-new-chat');if(newChat&&!newChat.hidden){newChat.hidden=true;return true;}
      const statusViewer=document.getElementById('gp2-status-viewer');if(statusViewer){statusViewer.remove();return true;}
      if(this.active!=='chats'){this.show('chats',false);return true;}
      return false;
    }
  }

  window.GitPitCoreAppShell=GitPitCoreAppShell;
})();
