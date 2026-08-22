'use strict';

(function(){
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function mount(){
    let root=document.getElementById('gp2-new-chat');
    if(root)return root;
    root=document.createElement('section');
    root.id='gp2-new-chat';
    root.hidden=true;
    root.innerHTML=`<div class="gp2-newchat-card">
      <header><button type="button" data-back aria-label="Back">‹</button><strong>New Chat</strong><button type="button" data-refresh>Refresh</button></header>
      <nav><button type="button" data-tab="registered" class="active">GitPit Registered</button><button type="button" data-tab="phonebook">Phonebook</button></nav>
      <input type="search" data-search placeholder="Search name or mobile number">
      <div data-state></div><div data-list></div>
    </div>`;
    document.body.appendChild(root);
    return root;
  }

  function open(onSelect){
    const root=mount(); let tab='registered'; let state=window.GitPitCoreContacts?.cached?.()||{registered:[],phonebook:[]};
    root.hidden=false;
    const list=root.querySelector('[data-list]'), status=root.querySelector('[data-state]'), search=root.querySelector('[data-search]');

    const render=()=>{
      const q=(search.value||'').trim().toLowerCase();
      const rows=(tab==='registered'?state.registered:state.phonebook).filter(x=>!q||String(x.name||x.gitpitName||'').toLowerCase().includes(q)||String(x.phone||'').includes(q));
      list.innerHTML='';
      for(const x of rows){
        const b=document.createElement('button'); b.type='button'; b.className='gp2-contact-row';
        const title=x.name||x.gitpitName||x.phone; const sub=x.phone||'';
        b.innerHTML=`<span><b>${esc(title)}</b><small>${esc(sub)}</small></span><em>${x.registered?'GitPit':'Phonebook'}</em>`;
        if(x.registered)b.onclick=()=>{ root.hidden=true; onSelect?.({ userId:x.userId||x.id, name:title, phone:x.phone, avatar:x.avatar||'' }); };
        else b.onclick=()=>alert('This contact is not registered on GitPit.');
        list.appendChild(b);
      }
      status.textContent=rows.length?'':(tab==='registered'?'No registered GitPit contacts found.':'No phonebook contacts found.');
    };

    async function refresh(){
      status.textContent='Syncing phone contacts…';
      try{ state=await window.GitPitCoreContacts.sync(); render(); }
      catch(e){ status.textContent=e.message||'Unable to sync contacts'; render(); }
    }

    root.querySelector('[data-back]').onclick=()=>{root.hidden=true;};
    root.querySelector('[data-refresh]').onclick=refresh;
    root.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{tab=btn.dataset.tab;root.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===btn));render();});
    search.oninput=render;
    render(); refresh();
  }

  window.GitPitCoreNewChat={ open };
})();
