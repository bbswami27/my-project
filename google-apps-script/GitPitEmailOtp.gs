/**
 * GitPit testing-only Gmail OTP relay via Google Apps Script HTTPS.
 * No OAuth tokens or Gmail passwords are stored in the GitHub repository.
 * Setup: Script Properties > GITPIT_SHARED_SECRET (32+ random chars)
 *                        > GITPIT_ALLOWED_EMAILS (2 comma-separated addresses)
 * Deploy web app: Execute as Me; Who has access: Anyone.
 *
 * SECURITY: Keep the URL and secret private. This is a limited testing relay,
 * not a public email service. Authorized recipients are enforced independently.
 */
function authorizeGitPitMail() {
  // Run once in Apps Script editor to authorize MailApp permission.
  Logger.log('Remaining daily recipients: ' + MailApp.getRemainingDailyQuota());
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const expected = props.getProperty('GITPIT_SHARED_SECRET') || '';
    const permitted = (props.getProperty('GITPIT_ALLOWED_EMAILS') || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (expected.length < 32 || permitted.length === 0 || permitted.length > 5) {
      return reply({success:false,error:'Relay not configured'});
    }
    if (!e || !e.postData || !e.postData.contents || e.postData.contents.length > 2000) {
      return reply({success:false,error:'Invalid request'});
    }
    const data = JSON.parse(e.postData.contents);
    const supplied = typeof data.secret === 'string' ? data.secret : '';
    // SHA-256 checksum avoids comparing arbitrarily long supplied secrets.
    const hash = s => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s)
      .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
    if (!supplied || hash(supplied) !== hash(expected)) {
      return reply({success:false,error:'Unauthorized'});
    }
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const code = typeof data.code === 'string' ? data.code : '';
    if (!permitted.includes(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
      return reply({success:false,error:'Invalid recipient or code'});
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return reply({success:false,error:'Daily Gmail quota reached'});
    }
    MailApp.sendEmail({
      to: email,
      subject: 'Your GitPit verification code',
      body: 'Your GitPit verification code is ' + code +
        '. It expires in 10 minutes. Never share this code with anyone.',
      name: 'GitPit Testing'
    });
    return reply({success:true});
  } catch (err) {
    console.error('GitPit email relay failed: ' + (err && err.name || 'Error'));
    return reply({success:false,error:'Email service error'});
  }
}

function reply(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
