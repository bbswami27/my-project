'use strict';
const crypto=require('crypto');
const {promisify}=require('util');
const scrypt=promisify(crypto.scrypt);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const token=()=>crypto.randomBytes(32).toString('base64url');
class AuthError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new AuthError(status,code,message);};
function email(v){ if(typeof v!=='string'||v.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400,'EMAIL_INVALID','Enter a valid email address.');return v.trim().toLowerCase(); }
function phone(v){if(typeof v!=='string')fail(400,'PHONE_INVALID','Enter your mobile number.');let n=v.replace(/[ ()-]/g,'');if(/^\d{10}$/.test(n))n='+91'+n;if(!/^\+[1-9]\d{7,14}$/.test(n))fail(400,'PHONE_INVALID','Use a valid mobile number with country code.');return n;}
function publicKey(pem){try{const k=crypto.createPublicKey(pem);if(k.asymmetricKeyType!=='rsa'||k.asymmetricKeyDetails.modulusLength<2048||k.asymmetricKeyDetails.modulusLength>4096)throw Error();return k.export({type:'spki',format:'pem'}).toString();}catch{fail(400,'DEVICE_KEY_INVALID','A valid Android device key is required.');}}
function verifySignature(key,data,signature){try{return crypto.verify('sha256',Buffer.from(data),{key,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(signature,'base64'));}catch{return false;}}
async function passwordHash(password){if(typeof password!=='string'||password.length<6||password.length>128)fail(400,'PASSWORD_INVALID','Use a password containing 6–128 characters.');const salt=crypto.randomBytes(16).toString('hex');const k=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt$${salt}$${k.toString('hex')}`;}
async function passwordMatches(password,encoded){if(typeof password!=='string'||password.length>128||!encoded)return false;const [,salt,digest]=encoded.split('$');const k=await scrypt(password,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});const b=Buffer.from(digest,'hex');return b.length===k.length&&crypto.timingSafeEqual(k,b);}
const dto=a=>({id:a.id,name:a.name,email:a.email,phone:a.phone||'',phoneVerified:!!a.phone,emailVerified:a.emailVerified,avatar:a.avatar||'assets/logo-icon.svg',bio:a.bio||'',privacy:a.privacy||{}});
class AuthService {
 constructor(store,providers,{pepper,now=()=>Date.now(),onRevoke=()=>{}}={}) {
  if(!pepper||pepper.length<32)throw Error('AUTH_PEPPER must contain at least 32 characters.');
  this.store=store;this.providers=providers;this.pepper=pepper;this.now=now;this.onRevoke=onRevoke;
 }
 codeHash(code){return crypto.createHmac('sha256',this.pepper).update(code).digest('hex');}
 async limit(key,max=10,windowMs=600000){const now=this.now();return this.store.transaction(async t=>{const id='limit:'+hash(key);let r=await t.get('nonces',id);if(!r||r.expiresAt<=now)r={id,count:0,expiresAt:now+windowMs};if(r.count>=max)fail(429,'RATE_LIMIT','Too many attempts. Please try again later.');r.count++;await t.save('nonces',r);});}
 async issue(t,a,key,scope='onboarding') {const raw=token();const s={id:hash(raw),accountId:a.id,key,scope,expiresAt:this.now()+ (scope==='active'?86400000:900000),generation:a.generation||0};await t.save('sessions',s);return {token:raw,scope,user:dto(a),expiresAt:s.expiresAt};}
 async register(body) {
  const mail=email(body.email),requestedPhone=phone(body.phone),key=publicKey(body.publicKey);
  await this.limit('email:'+mail,5);
  if(!this.providers.emailEnabled)fail(503,'EMAIL_UNAVAILABLE','Email verification is not configured. Contact the app operator.');
  const digest=await passwordHash(body.password);
  const code=crypto.randomInt(100000,1000000).toString();const id=token();
  await this.store.transaction(async t=>{
   if(await t.findAccount('email',mail))fail(409,'ACCOUNT_EXISTS','This email is already registered. Sign in or recover the account.');
   if(await t.findAccount('phone',requestedPhone))fail(409,'PHONE_LINKED','This mobile number is already linked to another account.');
   const a={id:'usr_'+crypto.randomUUID(),email:mail,name:String(body.name||'GitPit user').slice(0,100),desiredPhone:requestedPhone,passwordHash:digest,emailVerified:false,generation:0};
   await t.save('accounts',a);await t.save('challenges',{id,kind:'email',accountId:a.id,key,codeHash:this.codeHash(code),attempts:0,expiresAt:this.now()+600000});
  });
  await this.providers.sendEmail(mail,code);
  return {success:true,challengeId:id,emailVerificationRequired:true};
 }
 async login(body){const mail=email(body.email),key=publicKey(body.publicKey);await this.limit('login:'+mail,10);
  const a=await this.store.transaction(t=>t.findAccount('email',mail));
  // A fixed valid scrypt record equalizes missing-account work without revealing accounts.
  const dummy='scrypt$00000000000000000000000000000000$'+ '00'.repeat(32);
  if(!await passwordMatches(body.password,a?.passwordHash||dummy)||!a)fail(401,'LOGIN_INVALID','Email or password is incorrect.');
  if(!a.emailVerified){
   const code=crypto.randomInt(100000,1000000).toString(),id=token();
   await this.store.transaction(t=>t.save('challenges',{id,kind:'email',accountId:a.id,key,codeHash:this.codeHash(code),attempts:0,expiresAt:this.now()+600000}));
   await this.providers.sendEmail(mail,code);return {success:true,challengeId:id,emailVerificationRequired:true};
  }
  return this.store.transaction(async t=>this.issue(t,await t.get('accounts',a.id),key));
 }
 async verifyEmail(body){
  const result=await this.store.transaction(async t=>{
   const c=await t.get('challenges',String(body.challengeId||''));
   if(!c||c.kind!=='email'||c.expiresAt<=this.now()||c.attempts>=5)return {error:true};
   c.attempts++;await t.save('challenges',c);
   if(typeof body.code!=='string'||this.codeHash(body.code)!==c.codeHash)return {error:true};
   const a=await t.get('accounts',c.accountId);a.emailVerified=true;await t.save('accounts',a);await t.remove('challenges',c.id);
   return this.issue(t,a,c.key);
  });
  if(result.error)fail(400,'EMAIL_CODE_INVALID','Verification code is incorrect, expired or used.');return result;
 }
 async recoveryStart(body){
  const mail=email(body.email),key=publicKey(body.publicKey);await this.limit('recovery:'+mail,4);
  if(!this.providers.emailEnabled)fail(503,'EMAIL_UNAVAILABLE','Email delivery is unavailable.');
  const id=token(),code=crypto.randomInt(100000,1000000).toString();
  const exists=await this.store.transaction(async t=>{const a=await t.findAccount('email',mail);if(!a)return false;await t.save('challenges',{id,kind:'recovery',accountId:a.id,key,codeHash:this.codeHash(code),attempts:0,expiresAt:this.now()+600000});return true;});
  if(exists)await this.providers.sendEmail(mail,code);
  return {success:true,challengeId:id,message:'If the account exists, a verification code has been sent.'};
 }
 async recoveryComplete(body){
  const digest=await passwordHash(body.password);
  const result=await this.store.transaction(async t=>{const c=await t.get('challenges',String(body.challengeId||''));
   if(!c||c.kind!=='recovery'||c.expiresAt<=this.now()||c.attempts>=5)return {error:true};
   c.attempts++;await t.save('challenges',c);if(typeof body.code!=='string'||this.codeHash(body.code)!==c.codeHash)return {error:true};
   const a=await t.get('accounts',c.accountId);a.passwordHash=digest;a.emailVerified=true;a.generation=(a.generation||0)+1;a.simLeaseUntil=0;
   await t.save('accounts',a);await t.remove('challenges',c.id);await t.revokeSessions(a.id);return this.issue(t,a,c.key);
  });
  if(result.error)fail(400,'EMAIL_CODE_INVALID','Verification code is incorrect, expired or used.');this.onRevoke(result.user.id);return result;
 }
 async authenticate(raw,proof,{method,path,body='',active=true}={}) {
  if(!raw||raw.length>256)fail(401,'AUTH_REQUIRED','Sign in with your email.');
  return this.store.transaction(async t=>{
   const s=await t.get('sessions',hash(raw));if(!s||s.expiresAt<=this.now())fail(401,'SESSION_EXPIRED','Please sign in again.');
   const a=await t.get('accounts',s.accountId);if(!a?.emailVerified)fail(401,'AUTH_REQUIRED','Verify your email.');
   const ts=String(proof?.timestamp||''),nonce=String(proof?.nonce||'');
   if(!/^\d{13}$/.test(ts)||Math.abs(this.now()-Number(ts))>60000||! /^[a-zA-Z0-9_-]{20,100}$/.test(nonce))fail(401,'DEVICE_PROOF_INVALID','Device verification failed.');
   const canonical=['GITPIT1',method,path,hash(body),hash(raw),ts,nonce].join('\n');
   if(!verifySignature(s.key,canonical,proof?.signature))fail(401,'DEVICE_PROOF_INVALID','Use the registered app installation.');
   const replayId='proof:'+s.id+':'+nonce;if(await t.get('nonces',replayId))fail(401,'PROOF_REPLAY','Request already used.');
   await t.save('nonces',{id:replayId,expiresAt:this.now()+120000});
   if(active){
    if(s.scope!=='active'||a.generation!==s.generation||a.deviceKey!==s.key||!a.phone||!a.simLeaseUntil||a.simLeaseUntil<=this.now())fail(403,'SIM_VERIFICATION_REQUIRED','Verify the registered SIM on this phone to continue.');
   }
   return {session:s,account:a,raw};
  });
 }
 async beginBinding(ctx,body){
  if(!this.providers.simEnabled)fail(503,'SIM_PROVIDER_UNAVAILABLE','SIM verification service is not configured. Your account stays locked.');
  const number=ctx.account.phone||phone(body.phone||ctx.account.desiredPhone);
  const snapshot=body.snapshot;
  if(typeof snapshot!=='string'||! /^[a-f0-9]{64}$/.test(snapshot))fail(400,'SIM_REQUIRED','Select an active SIM on this phone.');
  await this.limit('binding:'+ctx.account.id,8);
  return this.store.transaction(async t=>{
   const owner=await t.findAccount('phone',number);if(owner&&owner.id!==ctx.account.id)fail(409,'PHONE_LINKED','This mobile number is already linked to another account.');
   const id=token();const c={id,kind:'sim',accountId:ctx.account.id,key:ctx.session.key,phone:number,snapshot,expiresAt:this.now()+300000};
   await t.save('challenges',c);return {challengeId:id,phone:number,keyHash:hash(c.key),snapshot,expiresAt:c.expiresAt};
  });
 }
 async completeBinding(ctx,body){
  await this.limit('sim-proof:'+ctx.account.id,10);
  const c=await this.store.transaction(t=>t.get('challenges',String(body.challengeId||'')));
  if(!c||c.kind!=='sim'||c.accountId!==ctx.account.id||c.key!==ctx.session.key||c.expiresAt<=this.now())fail(400,'CHALLENGE_INVALID','Start SIM verification again.');
  if(typeof body.proof!=='string'||body.proof.length<16||body.proof.length>16000)fail(400,'SIM_PROOF_REQUIRED','A carrier/device verification proof is required.');
  const p=await this.providers.verifySim({challengeId:c.id,phone:c.phone,deviceKeyHash:hash(c.key),subscriptionSnapshot:c.snapshot,proof:body.proof});
  const now=this.now();
  if(p?.verified!==true||p.sameDevice!==true||p.appId!=='com.gitpit.app'||p.challengeId!==c.id||p.phone!==c.phone||p.deviceKeyHash!==hash(c.key)||p.subscriptionSnapshot!==c.snapshot||!Number.isFinite(p.verifiedAt)||p.verifiedAt<now-60000||p.verifiedAt>now+10000||!Number.isFinite(p.expiresAt)||p.expiresAt<=now)fail(403,'SIM_MISMATCH','Registered SIM and app could not be verified on the same phone.');
  const result=await this.store.transaction(async t=>{
   const currentSession=await t.get('sessions',ctx.session.id);if(!currentSession||currentSession.expiresAt<=this.now())fail(401,'SESSION_EXPIRED','Sign in again before completing verification.');
   const live=await t.get('challenges',c.id);if(!live||live.expiresAt<=this.now())fail(400,'CHALLENGE_USED','SIM challenge expired or already used.');
   const a=await t.get('accounts',c.accountId);const owner=await t.findAccount('phone',c.phone);
   if(owner&&owner.id!==a.id)fail(409,'PHONE_LINKED','This mobile number belongs to another account.');
   if(a.phone&&a.phone!==c.phone)fail(409,'PHONE_IMMUTABLE','Use your registered mobile number.');
   if(a.deviceKey&&a.deviceKey!==c.key&&body.confirmTransfer!==true)fail(409,'TRANSFER_CONFIRMATION_REQUIRED','Confirm transferring this account to this phone.');
   a.phone=c.phone;a.deviceKey=c.key;a.subscriptionSnapshot=c.snapshot;a.simLeaseUntil=Math.min(p.expiresAt,this.now()+300000);a.generation=(a.generation||0)+1;
   await t.save('accounts',a);await t.remove('challenges',c.id);await t.revokeSessions(a.id);
   const issued=await this.issue(t,a,c.key,'active');return {...issued,simLeaseUntil:a.simLeaseUntil,snapshot:c.snapshot};
  });
  this.onRevoke(ctx.account.id);return result;
 }
 async invalidate(ctx){if(ctx.session.scope!=='active'||ctx.account.deviceKey!==ctx.session.key)fail(403,'DEVICE_MISMATCH','Only the bound device can invalidate its SIM session.');await this.store.transaction(async t=>{const a=await t.get('accounts',ctx.account.id);a.simLeaseUntil=0;a.generation=(a.generation||0)+1;await t.save('accounts',a);await t.revokeSessions(a.id);});this.onRevoke(ctx.account.id);return {success:true};}
 async logout(ctx){await this.store.transaction(t=>t.remove('sessions',ctx.session.id));this.onRevoke(ctx.account.id);return {success:true};}
 async socketTicket(ctx){const raw=token();await this.store.transaction(t=>t.save('challenges',{id:hash(raw),kind:'socket',accountId:ctx.account.id,sessionId:ctx.session.id,expiresAt:this.now()+15000}));return {ticket:raw};}
 async consumeTicket(raw){return this.store.transaction(async t=>{const c=await t.get('challenges',hash(raw||''));if(!c||c.kind!=='socket'||c.expiresAt<=this.now())fail(401,'SOCKET_AUTH','Socket authorization required.');await t.remove('challenges',c.id);return this.checkSessionInTx(t,c.sessionId);});}
 async checkSessionInTx(t,id){const s=await t.get('sessions',id);const a=s?await t.get('accounts',s.accountId):null;if(!a||s.scope!=='active'||s.expiresAt<=this.now()||a.generation!==s.generation||a.deviceKey!==s.key||a.simLeaseUntil<=this.now())fail(401,'SOCKET_AUTH','Device session expired.');return {session:s,account:a};}
 async checkSocket(id){return this.store.transaction(t=>this.checkSessionInTx(t,id));}
 async startGoogle(body){if(!this.providers.googleEnabled)fail(503,'GOOGLE_UNAVAILABLE','Google sign-in is not configured. Use email sign-in.');const key=publicKey(body.publicKey),id=token(),state=token(),nonce=token(),verifier=token();const pollSecret=token();
  await this.store.transaction(t=>t.save('challenges',{id:state,kind:'google',pollId:id,pollHash:hash(pollSecret),key,nonce,verifier,expiresAt:this.now()+600000}));
  return {state,pollSecret,url:this.providers.googleUrl(state,nonce,crypto.createHash('sha256').update(verifier).digest('base64url'))};
 }
 async googleCallback(state,code){const c=await this.store.transaction(t=>t.get('challenges',state));if(!c||c.kind!=='google'||c.identity||c.expiresAt<=this.now())fail(400,'GOOGLE_STATE','Google sign-in expired.');const identity=await this.providers.googleExchange(code,c.verifier,c.nonce);identity.email=email(identity.email);
  await this.store.transaction(async t=>{const live=await t.get('challenges',state);if(!live||live.identity||live.expiresAt<=this.now())fail(400,'GOOGLE_STATE','Google sign-in expired.');live.identity=identity;delete live.verifier;await t.save('challenges',live);});
 }
 async googleResult(body){return this.store.transaction(async t=>{
  const c=await t.get('challenges',String(body.state||''));if(!c||c.kind!=='google'||c.pollHash!==hash(body.pollSecret||'')||c.expiresAt<=this.now())fail(401,'GOOGLE_STATE','Google sign-in expired.');
  if(!verifySignature(c.key,'GITPIT-GOOGLE\n'+c.id+'\n'+c.pollHash,body.signature))fail(401,'DEVICE_PROOF_INVALID','Return to the original phone.');
  if(!c.identity)return {pending:true};
  let a=await t.findAccount('googleSub',c.identity.sub);const other=await t.findAccount('email',c.identity.email);
  if(!a&&other)fail(409,'ACCOUNT_EXISTS','An email account already exists. Use email sign-in; automatic identity linking is disabled.');
  if(!a){a={id:'usr_'+crypto.randomUUID(),email:c.identity.email,name:c.identity.name,googleSub:c.identity.sub,emailVerified:true,generation:0};await t.save('accounts',a);}
  await t.remove('challenges',c.id);return this.issue(t,a,c.key);
 });}
}
module.exports={AuthService,AuthError,hash,phone,email,dto,verifySignature,passwordHash,passwordMatches};
