'use strict';
const {dto}=require('./auth');
function installAuth(app,auth,db,io) {
 const wrap=f=>(req,res,next)=>Promise.resolve(f(req,res,next)).catch(next);
 const proof=req=>({timestamp:req.get('X-Device-Time'),nonce:req.get('X-Device-Nonce'),signature:req.get('X-Device-Signature')});
 const authenticate=active=>wrap(async(req,res,next)=>{
  const h=req.get('Authorization')||'';const raw=h.startsWith('Bearer ')?h.slice(7):'';
  req.security=await auth.authenticate(raw,proof(req),{method:req.method,path:req.originalUrl,body:req.rawBody||'',active});
  req.currentUser=dto(req.security.account);req.session=req.security.session;
  // Compatibility projection, not an authentication source. Legacy sessions are never consulted.
  if(active){const a=req.currentUser;const previous=db.getUser(a.id);if(!previous||previous.phone!==a.phone||previous.email!==a.email)db.saveUser({...a,id:a.id});}
  next();
 });
 const onboard=authenticate(false),active=authenticate(true);
 app.use('/api/auth',wrap(async(req,res,next)=>{await auth.limit('ip:'+req.ip,100,600000);res.set('Cache-Control','no-store');next();}));
 app.get('/api/auth/config',(req,res)=>res.json({loginMethods:['email','google'],googleEnabled:auth.providers.googleEnabled,emailEnabled:auth.providers.emailEnabled,simEnabled:auth.providers.simEnabled,androidOnly:true}));
 app.post('/api/auth/email/register',wrap(async(req,res)=>res.status(201).json(await auth.register(req.body))));
 app.post('/api/auth/email/login',wrap(async(req,res)=>res.json(await auth.login(req.body))));
 app.post('/api/auth/email/recovery/start',wrap(async(req,res)=>res.json(await auth.recoveryStart(req.body))));
 app.post('/api/auth/email/recovery/complete',wrap(async(req,res)=>res.json(await auth.recoveryComplete(req.body))));
 app.post('/api/auth/email/verify',wrap(async(req,res)=>res.json(await auth.verifyEmail(req.body))));
 app.post('/api/auth/google/start',wrap(async(req,res)=>res.json(await auth.startGoogle(req.body))));
 app.get('/api/auth/google/callback',wrap(async(req,res)=>{await auth.googleCallback(String(req.query.state||''),String(req.query.code||''));res.type('text/plain').send('Google sign-in verified. Return to the GitPit app to continue.');}));
 app.post('/api/auth/google/result',wrap(async(req,res)=>res.json(await auth.googleResult(req.body))));
 app.post('/api/auth/binding/start',onboard,wrap(async(req,res)=>res.json(await auth.beginBinding(req.security,req.body))));
 app.post('/api/auth/binding/complete',onboard,wrap(async(req,res)=>res.json(await auth.completeBinding(req.security,req.body))));
 app.post('/api/auth/binding/invalidate',onboard,wrap(async(req,res)=>res.json(await auth.invalidate(req.security))));
 app.get('/api/auth/session',active,(req,res)=>res.json({success:true,user:req.currentUser,simLeaseUntil:req.security.account.simLeaseUntil}));
 app.post('/api/auth/logout',onboard,wrap(async(req,res)=>res.json(await auth.logout(req.security))));
 app.post('/api/auth/socket-ticket',active,wrap(async(req,res)=>res.json(await auth.socketTicket(req.security))));
 // Retired endpoints remain explicitly unavailable in all environments.
 app.use('/api/auth',(req,res)=>res.status(410).json({error:'Use verified email or Google sign-in in the Android app.',code:'LEGACY_AUTH_REMOVED'}));
 app.use('/api',(req,res,next)=>{
  if(['/health'].includes(req.path))return next();
  active(req,res,next);
 });
 const profile=wrap(async(req,res)=>{
  const a=req.security.account;
  if((req.body.phone&&req.body.phone!==a.phone)||(req.body.email&&req.body.email.toLowerCase()!==a.email))return res.status(409).json({error:'Email and mobile number cannot be changed through profile editing.',code:'IDENTITY_IMMUTABLE'});
  const updated=await auth.store.transaction(async t=>{const row=await t.get('accounts',a.id);row.name=String(req.body.name||row.name).slice(0,100);row.bio=String(req.body.bio||'').slice(0,500);
   if(req.body.avatar){if(!/^https:\/\//.test(req.body.avatar))throw Object.assign(Error('Avatar must use HTTPS.'),{status:400});row.avatar=String(req.body.avatar).slice(0,2048);}await t.save('accounts',row);return row;});
  db.saveUser({...dto(updated),id:updated.id});io.to('user:'+updated.id).emit('profile_updated',dto(updated));res.json({success:true,user:dto(updated)});
 });
 app.put('/api/user/profile',profile);app.post('/api/user/profile',profile);
 app.post('/api/user/privacy',wrap(async(req,res)=>{
  if(!req.body.privacy || typeof req.body.privacy !== 'object' || Array.isArray(req.body.privacy))return res.status(400).json({error:'Invalid privacy settings.'});
  const allowed=['hidePhone','hideEmail','hideDob','hideLastSeen','videoCall','filePrivacy','restrictUnknownMedia','strangerShield','strangerShieldMode','fileReceiving','statusVisibility','lastSeen','profilePhoto','about','readReceipts','disappearingTimer','screenLock'];
  const patch=Object.fromEntries(Object.entries(req.body.privacy).filter(([key,value])=>allowed.includes(key)&&['string','boolean'].includes(typeof value)));
  const privacy=await auth.store.transaction(async t=>{const a=await t.get('accounts',req.currentUser.id);a.privacy={...(a.privacy||{}),...patch};await t.save('accounts',a);return a.privacy;});
  db.updatePrivacy(req.currentUser.id,privacy);res.json({success:true,privacy});
 }));
 app.post('/api/devices/link',(req,res)=>res.status(410).json({error:'Only one SIM-verified phone is allowed. Use account transfer.'}));
 app.get('/api/devices',(req,res)=>res.json({success:true,devices:[{id:'current',name:'Current SIM-verified phone',current:true}]}));
 app.delete('/api/devices/:id',wrap(async(req,res)=>res.json(await auth.invalidate(req.security))));
 return {active,onboard,wrap};
}
module.exports={installAuth};
