'use strict';

(function(){
  class CoreV2AuthService{
    constructor(options={}){
      this.apiBase=(options.apiBase||window.CORE_V2_API_BASE||'').replace(/\/$/,'');
      this.tokenKey='gp2_auth_token';
      this.userKey='gp2_auth_user';
      this.challenge=null;
    }
    async json(path,options={}){
      const token=this.token();
      const r=await fetch(`${this.apiBase}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(options.headers||{})}});
      let d={};try{d=await r.json();}catch(_){}
      if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
      return d;
    }
    token(){return localStorage.getItem(this.tokenKey)||'';}
    user(){try{return JSON.parse(localStorage.getItem(this.userKey)||'null');}catch(_){return null;}}
    async requestOtp(phone){
      const d=await this.json('/api/v2/auth/otp/request',{method:'POST',body:JSON.stringify({phone})});
      this.challenge={phone,challengeId:d.challengeId,expiresAt:d.expiresAt};
      return d;
    }
    async verifyOtp(phone,otp,name=''){
      const challengeId=this.challenge?.challengeId;
      if(!challengeId)throw new Error('Request OTP first');
      const deviceId=localStorage.getItem('gp2_device_id')||`dev_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
      localStorage.setItem('gp2_device_id',deviceId);
      const d=await this.json('/api/v2/auth/otp/verify',{method:'POST',body:JSON.stringify({phone,otp,challengeId,name,deviceId})});
      localStorage.setItem(this.tokenKey,d.token);localStorage.setItem(this.userKey,JSON.stringify(d.user));this.challenge=null;return d;
    }
    async restore(){
      if(!this.token())return null;
      try{const d=await this.json('/api/v2/auth/session');localStorage.setItem(this.userKey,JSON.stringify(d.user));return d;}
      catch(e){this.clear();return null;}
    }
    async logout(){try{if(this.token())await this.json('/api/v2/auth/logout',{method:'POST',body:'{}'});}catch(_){}this.clear();}
    clear(){localStorage.removeItem(this.tokenKey);localStorage.removeItem(this.userKey);}
  }
  window.CoreV2AuthService=CoreV2AuthService;
})();
