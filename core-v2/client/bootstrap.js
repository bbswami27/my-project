'use strict';

(async function(){
  const apiBase=(window.CORE_V2_API_BASE||'').replace(/\/$/,'');
  const auth=new window.CoreV2AuthService({apiBase});
  const login=new window.CoreV2LoginUI(auth);

  async function start(user){
    const chatService=new window.CoreV2ChatService({apiBase,getToken:()=>auth.token()});
    await chatService.restoreSession();
    chatService.connectSocket();

    const mediaService=new window.CoreV2MediaService({apiBase,getToken:()=>auth.token()});
    const chatUI=new window.CoreV2ChatUI(chatService);
    const callService=new window.CoreV2CallService(chatService);callService.bindSocket(chatService.socket);
    const callUI=new window.CoreV2CallUI(callService);
    window.GitPitCoreCallChatIntegration?.install?.({chatUI,callService,callUI});

    const statusService=new window.CoreV2StatusService({apiBase,getToken:()=>auth.token(),mediaService});
    const statusUI=new window.CoreV2StatusUI({statusService,mediaService,currentUserId:user.id});

    const shell=new window.GitPitCoreAppShell({chatService,chatUI,statusUI,callService});
    shell.mount();
    const originalShow=shell.show.bind(shell);
    shell.show=(name,push=true)=>{if(name==='status'){statusUI.open().catch(e=>alert(e.message||'Unable to open status'));return;}originalShow(name,push);};

    window.GitPitCore={auth,user,chatService,chatUI,mediaService,callService,callUI,statusService,statusUI,shell};
    try{await window.GitPitCoreContacts?.sync?.();window.GitPitCoreContacts?.startAutoSync?.();}catch(e){console.warn('[CORE V2 BOOT] contacts sync',e.message);}
  }

  const restored=await auth.restore();
  if(restored?.user){try{await start(restored.user);}catch(e){console.error('[CORE V2 BOOT] start failed',e);auth.clear();login.mount(start);}}
  else login.mount(start);
})();
