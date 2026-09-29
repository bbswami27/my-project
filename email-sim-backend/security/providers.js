'use strict';
const {OAuth2Client}=require('google-auth-library');
class ProviderError extends Error { constructor(message){super(message);this.status=503;this.code='PROVIDER_UNAVAILABLE';} }
function providers(env=process.env) {
 const client = new OAuth2Client(env.GOOGLE_CLIENT_ID,env.GOOGLE_CLIENT_SECRET,env.GOOGLE_REDIRECT_URI);
 return {
  googleEnabled: !!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.GOOGLE_REDIRECT_URI),
  emailEnabled: !!(env.RESEND_API_KEY&&env.EMAIL_FROM),
  simEnabled: !!(env.SIM_BROKER_URL&&env.SIM_BROKER_TOKEN),
  googleUrl(state,nonce,challenge) {
   return client.generateAuthUrl({scope:['openid','email','profile'],state,nonce,prompt:'select_account',
    code_challenge:challenge,code_challenge_method:'S256',access_type:'online'});
  },
  async googleExchange(code,verifier,nonce) {
   const {tokens}=await client.getToken({code,codeVerifier:verifier,redirect_uri:env.GOOGLE_REDIRECT_URI});
   const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:env.GOOGLE_CLIENT_ID});
   const p=ticket.getPayload();
   if (!p?.sub||!p.email_verified||p.nonce!==nonce) throw new Error('Google identity verification failed');
   return {sub:p.sub,email:p.email,name:p.name||'GitPit user'};
  },
  async sendEmail(email,code) {
   if (!this.emailEnabled) throw new ProviderError('Email delivery is not configured. Contact the app operator.');
   const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:'Verify your GitPit email',text:`Your GitPit email verification code is ${code}. It expires in 10 minutes. Do not share it.`})});
   if (!response.ok) throw new ProviderError('Email could not be sent. Please try again later.');
  },
  async verifySim(input) {
   if (!this.simEnabled) throw new ProviderError('SIM verification service is not configured. Access remains locked.');
   const base=new URL(env.SIM_BROKER_URL);
   if(base.protocol!=='https:') throw new ProviderError('SIM verification requires HTTPS.');
   // A deployment-specific trusted carrier/attestation adapter must implement this contract.
   // This endpoint is NOT an SMS OTP endpoint. Never derive success from caller-supplied phone/SIM flags.
   const response=await fetch(new URL('/v1/device-sim/verify',base),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Bearer ${env.SIM_BROKER_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(input)});
   if(!response.ok) throw new ProviderError('SIM verification could not be completed.');
   return response.json();
  }
 };
}
module.exports={providers,ProviderError};
