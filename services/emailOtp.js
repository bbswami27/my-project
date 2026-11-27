'use strict';
const crypto = require('crypto');
const normalize = email => email.trim().toLowerCase();
const valid = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const digest = (email, code) => crypto.createHmac('sha256', process.env.EMAIL_OTP_SECRET).update(email + ':' + code).digest('hex');
const safeUser = u => ({id:u.id,name:u.name,username:u.username,phone:u.phone||'',phoneVerified:!!u.phoneVerified,email:u.email||'',emailVerified:!!u.emailVerified,avatar:u.avatar,bio:u.bio,status:u.status,privacy:u.privacy||{}});
module.exports = async function installEmailOtp(app, db, io) {
  await db.ready;
  if (!db.isPostgres || !db.pgPool) throw new Error('Email OTP requires PostgreSQL');
  await db.pgPool.query("ALTER TABLE cp_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE");
  await db.pgPool.query("CREATE UNIQUE INDEX IF NOT EXISTS cp_users_email_lower_unique ON cp_users (lower(email)) WHERE email IS NOT NULL AND email <> ''");
  await db.pgPool.query("CREATE TABLE IF NOT EXISTS cp_email_otps (email VARCHAR(254) PRIMARY KEY, code_hash VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0, last_sent_at BIGINT NOT NULL, request_count INT NOT NULL DEFAULT 0, window_start BIGINT NOT NULL)");
  const users = await db.pgPool.query('SELECT id, email_verified FROM cp_users');
  for(const row of users.rows){const u=db.getUser(row.id);if(u)u.emailVerified=!!row.email_verified;}
  const ready=()=>!!(process.env.EMAIL_OTP_SECRET && process.env.EMAIL_OTP_SECRET.length>=32 && ((process.env.RESEND_API_KEY && process.env.EMAIL_FROM) || (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)));
  app.get('/api/auth/email/config',(_req,res)=>res.json({enabled:ready(),method:'email-otp'}));
  const noStore=(_req,res,next)=>{res.set('Cache-Control','no-store');next();};

  app.post('/api/auth/email/send-code',noStore,async(req,res)=>{
    const {email,name}=req.body||{};
    if(!valid(email)||(name&&(typeof name!=='string'||name.length>100)))return res.status(400).json({success:false,error:'Enter a valid email address.'});
    if(!ready())return res.status(503).json({success:false,error:'Email verification is not configured yet.'});
    const addr=normalize(email);
    const allowList=(process.env.EMAIL_TEST_ALLOWLIST||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!allowList.length)return res.status(503).json({success:false,error:'Testing email allowlist is not configured.'});
    if(!allowList.includes(addr))return res.status(403).json({success:false,error:'This email is not enrolled in the GitPit testing program.'});
    const now=Date.now(),client=await db.pgPool.connect();
    let code,hash;
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[addr]);
      const prior=await client.query('SELECT * FROM cp_email_otps WHERE email=$1 FOR UPDATE',[addr]);
      const old=prior.rows[0];
      if(old&&now-Number(old.last_sent_at)<60000){await client.query('ROLLBACK');return res.status(429).json({success:false,error:'Wait 60 seconds before requesting another code.'});}
      const windowStart=old&&now-Number(old.window_start)<600000?Number(old.window_start):now;
      const count=old&&windowStart===Number(old.window_start)?Number(old.request_count)+1:1;
      if(count>4){await client.query('ROLLBACK');return res.status(429).json({success:false,error:'Too many codes requested. Try later.'});}
      code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
      hash=digest(addr,code);
      await client.query('INSERT INTO cp_email_otps(email,code_hash,expires_at,attempts,last_sent_at,request_count,window_start) VALUES($1,$2,$3,0,$4,$5,$6) ON CONFLICT(email) DO UPDATE SET code_hash=$2,expires_at=$3,attempts=0,last_sent_at=$4,request_count=$5,window_start=$6',[addr,hash,now+600000,now,count,windowStart]);
      await client.query('COMMIT');
    }catch(err){try{await client.query('ROLLBACK');}catch{}console.error('[EMAIL OTP] Store error',err.code||'unknown');return res.status(503).json({success:false,error:'Unable to request code.'});}finally{client.release();}
    try{
      let response;
      if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN && (process.env.EMAIL_PROVIDER === 'mailgun' || !process.env.RESEND_API_KEY)) {
        // Mailgun sandbox domains permit verified/authorized recipient addresses.
        const domain=process.env.MAILGUN_DOMAIN;
        if(!/^[a-z0-9.-]+$/i.test(domain))throw new Error('Invalid sender domain');
        const fields=new URLSearchParams({
          from:process.env.EMAIL_FROM || ('GitPit Testing <postmaster@'+domain+'>'),
          to:addr,subject:'Your GitPit verification code',
          text:'Your GitPit verification code is '+code+'. It expires in 10 minutes. Never share it.'
        });
        response=await fetch('https://'+(process.env.MAILGUN_REGION==='eu'?'api.eu.mailgun.net':'api.mailgun.net')+'/v3/'+domain+'/messages',{
          method:'POST',signal:AbortSignal.timeout(12000),
          headers:{Authorization:'Basic '+Buffer.from('api:'+process.env.MAILGUN_API_KEY).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},
          body:fields.toString()
        });
      } else {
        if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)throw new Error('Resend unavailable');
        response=await fetch('https://api.resend.com/emails',{
          method:'POST',signal:AbortSignal.timeout(12000),
          headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({from:process.env.EMAIL_FROM,to:[addr],subject:'Your GitPit verification code',text:'Your GitPit verification code is '+code+'. It expires in 10 minutes. Never share it.'})
        });
      }
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.id){await db.pgPool.query("UPDATE cp_email_otps SET code_hash='',expires_at=0 WHERE email=$1 AND code_hash=$2",[addr,hash]);console.warn('[EMAIL OTP] Delivery rejected HTTP',response.status);return res.status(503).json({success:false,error:'Email delivery unavailable. Please retry later.'});}
      return res.json({success:true,expiresIn:600,cooldown:60,message:'Verification code sent.'});
    }catch(err){await db.pgPool.query('DELETE FROM cp_email_otps WHERE email=$1 AND code_hash=$2',[addr,hash]).catch(()=>{});return res.status(503).json({success:false,error:'Email delivery unavailable.'});}
  });

  app.post('/api/auth/email/verify-code',noStore,async(req,res)=>{
    const {email,code,name}=req.body||{};
    if(!valid(email)||typeof code!=='string'||!/^\d{6}$/.test(code)||(name&&(typeof name!=='string'||name.length>100)))return res.status(400).json({success:false,error:'Valid email and six-digit code required.'});
    if(!ready())return res.status(503).json({success:false,error:'Email verification is not configured yet.'});
    const addr=normalize(email);
    const allowList=(process.env.EMAIL_TEST_ALLOWLIST||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
    if(!allowList.length)return res.status(503).json({success:false,error:'Testing email allowlist is not configured.'});
    if(!allowList.includes(addr))return res.status(403).json({success:false,error:'This email is not enrolled in the GitPit testing program.'});
    const now=Date.now(),client=await db.pgPool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[addr]);
      const r=await client.query('SELECT * FROM cp_email_otps WHERE email=$1 FOR UPDATE',[addr]);const otp=r.rows[0];
      if(!otp||Number(otp.expires_at)<=now||otp.attempts>=5){await client.query('ROLLBACK');return res.status(400).json({success:false,error:'Code expired or unavailable. Request another code.'});}
      await client.query('UPDATE cp_email_otps SET attempts=attempts+1 WHERE email=$1',[addr]);
      const expected=Buffer.from(otp.code_hash,'hex'),actual=Buffer.from(digest(addr,code),'hex');
      if(expected.length!==actual.length||!crypto.timingSafeEqual(actual,expected)){await client.query('COMMIT');return res.status(400).json({success:false,error:'Invalid code.'});}
      const existing=await client.query('SELECT * FROM cp_users WHERE lower(email)=$1 FOR UPDATE',[addr]);let u=existing.rows[0];
      if(u&&u.phone_verified&&!u.email_verified){await client.query('ROLLBACK');return res.status(409).json({success:false,error:'Existing phone account requires separate account-linking verification.'});}
      if(!u){
        const id='usr_email_'+crypto.randomUUID(),displayName=String(name||'GitPit User').trim().slice(0,100)||'GitPit User';
        const inserted=await client.query('INSERT INTO cp_users(id,name,username,phone,phone_verified,email,email_verified,avatar,bio,status) VALUES($1,$2,$3,NULL,false,$4,true,$5,$6,$7) RETURNING *',[id,displayName,'@'+id.slice(10,22),addr,'https://api.dicebear.com/7.x/bottts/svg?seed='+encodeURIComponent(id),'Using GitPit','Available']);u=inserted.rows[0];
      }else if(!u.email_verified){const updated=await client.query('UPDATE cp_users SET email_verified=true,updated_at=NOW() WHERE id=$1 RETURNING *',[u.id]);u=updated.rows[0];}
      await client.query('DELETE FROM cp_email_otps WHERE email=$1',[addr]);
      const token=crypto.randomBytes(32).toString('hex'),expiresAtMs=now+30*86400000,expiresAt=new Date(expiresAtMs).toISOString();
      await client.query('INSERT INTO cp_sessions(token,user_id,expires_at,expires_at_ms) VALUES($1,$2,$3,$4)',[token,u.id,expiresAt,expiresAtMs]);
      await client.query('COMMIT');
      const loaded={id:u.id,name:u.name,username:u.username,phone:u.phone||'',phoneVerified:!!u.phone_verified,email:addr,emailVerified:true,avatar:u.avatar,bio:u.bio,status:u.status,privacy:u.privacy||{}};
      const idx=db.data.users.findIndex(x=>x.id===u.id);if(idx>=0)db.data.users[idx]={...db.data.users[idx],...loaded};else db.data.users.push(loaded);
      db.data.sessions.push({token,userId:u.id,expiresAt,expiresAtMs,createdAt:new Date(now).toISOString()});
      io.to('user_'+u.id).emit('user_registered',safeUser(loaded));
      return res.json({success:true,user:safeUser(loaded),token,expiresAt});
    }catch(err){try{await client.query('ROLLBACK');}catch{}console.error('[EMAIL OTP] Verify error',err.code||'unknown');return res.status(503).json({success:false,error:'Unable to verify email right now.'});}finally{client.release();}
  });
};