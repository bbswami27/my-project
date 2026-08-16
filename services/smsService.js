// ChatterPatter - SMS Dispatch Service (Fast2SMS & Twilio)

class SmsService {
  isConfigured() {
    const provider = process.env.SMS_PROVIDER;
    if (provider === 'twilio') {
      return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
    }
    if (provider === 'fast2sms') {
      return !!process.env.FAST2SMS_API_KEY;
    }
    return false;
  }

  getProviderName() {
    if (process.env.SMS_PROVIDER === 'twilio') return 'Twilio Carrier SMS';
    if (process.env.SMS_PROVIDER === 'fast2sms') return 'Fast2SMS Carrier Gateway';
    return 'Console / Unconfigured (No Live SMS)';
  }

  async sendOtp(normalizedPhone, otp) {
    const provider = process.env.SMS_PROVIDER;

    // 1. Fast2SMS (India Bulk/OTP Route)
    if (provider === 'fast2sms' && process.env.FAST2SMS_API_KEY) {
      try {
        const clean10 = normalizedPhone.replace(/\D/g, '').slice(-10);
        const resp = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: {
            'authorization': process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            route: 'otp',
            variables_values: otp,
            numbers: clean10
          })
        });
        const data = await resp.json();
        console.log(`[SMS-SERVICE] Fast2SMS dispatched to ${clean10}:`, data);
        return { success: true, provider: 'fast2sms', response: data };
      } catch (err) {
        console.error('[SMS-SERVICE] Fast2SMS error:', err.message);
        return { success: false, error: err.message };
      }
    }

    // 2. Twilio (International & US/India)
    if (provider === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
        const body = new URLSearchParams({
          To: normalizedPhone,
          From: process.env.TWILIO_PHONE_NUMBER,
          Body: `Your ChatterPatter verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`
        });
        const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: body.toString()
        });
        const data = await resp.json();
        console.log(`[SMS-SERVICE] Twilio SMS dispatched to ${normalizedPhone}:`, data.sid || data.message);
        return { success: true, provider: 'twilio', sid: data.sid };
      } catch (err) {
        console.error('[SMS-SERVICE] Twilio error:', err.message);
        return { success: false, error: err.message };
      }
    }

    console.log(`[SMS-LOG] Unconfigured provider (${provider || 'none'}). Phone: ${normalizedPhone} | Code: [${otp}]`);
    return { success: false, reason: 'SMS_GATEWAY_NOT_CONFIGURED' };
  }
}

module.exports = new SmsService();
