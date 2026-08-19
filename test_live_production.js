// ChatterPatter - Safe Automated Live Backend Verification Test Suite
// Production Target: https://chitchat-chatterpatter.onrender.com
// Safety Guarantee:
// - Uses isolated test phone numbers (+910000000001 and +910000000002) to avoid contacting real phone numbers.
// - Performs isolated verification without deleting, wiping, or modifying existing production users or other user data.
// - Does not leak secrets, API keys, or private environment variables.

const PROD_URL = 'https://chitchat-chatterpatter.onrender.com';

async function runLiveTests() {
  console.log(`====================================================`);
  console.log(`🚀 SAFE LIVE PRODUCTION TEST SUITE`);
  console.log(`🌐 Target Server: ${PROD_URL}`);
  console.log(`🔒 Dedicated Test Identifiers: +910000000001 & +910000000002`);
  console.log(`====================================================\n`);

  const results = {};

  // Helper for JSON HTTP requests
  async function api(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${PROD_URL}${endpoint}`, opts);
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = await res.text();
    }
    return { status: res.status, data };
  }

  // 1. Health & Ping Verification
  console.log('1. [HEALTH CHECK] Testing /api/health and /health...');
  try {
    const h1 = await api('/api/health');
    const h2 = await api('/health');
    if (h1.status === 200 && h2.status === 200) {
      console.log('   ✅ Health endpoint live & responsive:', h1.data);
      results['Health Endpoint'] = 'PASS';
    } else {
      console.log('   ❌ Health endpoint failed:', h1.status, h2.status);
      results['Health Endpoint'] = 'FAIL';
    }
  } catch (e) {
    console.log('   ❌ Health endpoint error:', e.message);
    results['Health Endpoint'] = 'FAIL';
  }

  // 2. Authentication: Test User 1 (+910000000001)
  console.log('\n2. [AUTH USER 1] Testing OTP dispatch & verification for Test User 1 (+910000000001)...');
  let user1Token = null;
  let user1Id = null;
  try {
    const sendRes = await api('/api/auth/send-otp', 'POST', { phone: '+910000000001' });
    console.log('   • OTP Request Status:', sendRes.status, sendRes.data.message || sendRes.data);
    const otp = sendRes.data.codeHint || '123456';
    
    // Verify OTP
    const verifyRes = await api('/api/auth/verify-otp', 'POST', {
      phone: '+910000000001',
      otp: otp,
      name: 'Test Account Alpha',
      bio: 'ChatterPatter Automated Test Account'
    });
    if (verifyRes.status === 200 && verifyRes.data.token && verifyRes.data.user.phoneVerified) {
      user1Token = verifyRes.data.token;
      user1Id = verifyRes.data.user.id;
      console.log(`   ✅ User 1 Verified: ID=${user1Id}, phoneVerified=true`);
      results['Auth & OTP (User 1)'] = 'PASS';
    } else {
      console.log('   ❌ Verification failed:', verifyRes.data);
      results['Auth & OTP (User 1)'] = 'FAIL';
    }
  } catch (e) {
    console.log('   ❌ Auth Error:', e.message);
    results['Auth & OTP (User 1)'] = 'FAIL';
  }

  // 3. Authentication: Test User 2 (+910000000002)
  console.log('\n3. [AUTH USER 2] Testing OTP dispatch & verification for Test User 2 (+910000000002)...');
  let user2Token = null;
  let user2Id = null;
  try {
    const sendRes = await api('/api/auth/send-otp', 'POST', { phone: '+910000000002' });
    const otp = sendRes.data.codeHint || '123456';
    
    // Verify OTP
    const verifyRes = await api('/api/auth/verify-otp', 'POST', {
      phone: '+910000000002',
      otp: otp,
      name: 'Test Account Beta',
      bio: 'ChatterPatter Automated Test Account'
    });
    if (verifyRes.status === 200 && verifyRes.data.token && verifyRes.data.user.phoneVerified) {
      user2Token = verifyRes.data.token;
      user2Id = verifyRes.data.user.id;
      console.log(`   ✅ User 2 Verified: ID=${user2Id}, phoneVerified=true`);
      results['Auth & OTP (User 2)'] = 'PASS';
    } else {
      console.log('   ❌ Verification failed:', verifyRes.data);
      results['Auth & OTP (User 2)'] = 'FAIL';
    }
  } catch (e) {
    console.log('   ❌ Auth Error:', e.message);
    results['Auth & OTP (User 2)'] = 'FAIL';
  }

  // 4. Session Validation & 401 Unauthorized Protection
  console.log('\n4. [SECURITY & PERMISSIONS] Validating session tokens & 401 protection...');
  try {
    const validRes = await api('/api/auth/session', 'GET', null, user1Token);
    const unauthRes = await api('/api/auth/session', 'GET', null, 'invalid_session_token_xyz');
    if (validRes.status === 200 && unauthRes.status === 401) {
      console.log('   ✅ Authenticated token accepted (200), invalid token rejected (401)');
      results['Session Security & Auth Guard'] = 'PASS';
    } else {
      results['Session Security & Auth Guard'] = 'FAIL';
    }
  } catch (e) {
    results['Session Security & Auth Guard'] = 'FAIL';
  }

  // 5. Contact Sync
  console.log('\n5. [CONTACT SYNC] Matching normalized phonebook (+910000000002)...');
  try {
    const syncRes = await api('/api/contacts/sync', 'POST', {
      phoneNumbers: ['+910000000002', '+919999999999']
    }, user1Token);
    if (syncRes.status === 200 && syncRes.data.matchedUsers && syncRes.data.matchedUsers.length > 0) {
      console.log('   ✅ Matched contact successfully:', syncRes.data.matchedUsers[0].name);
      results['Phonebook Contact Sync'] = 'PASS';
    } else {
      results['Phonebook Contact Sync'] = 'FAIL';
    }
  } catch (e) {
    results['Phonebook Contact Sync'] = 'FAIL';
  }

  // 6. Real Messaging & Database Persistence
  console.log('\n6. [MESSAGING PERSISTENCE] Sending isolated test message and verifying retrieval...');
  try {
    const chatId = `chat_${user1Id}_${user2Id}`;
    const msgRes = await api('/api/messages', 'POST', {
      chatId,
      recipientId: user2Id,
      recipientPhone: '+910000000002',
      text: 'Verified production message test between Alpha & Beta.',
      type: 'text'
    }, user1Token);

    // Retrieve conversation history
    const getRes = await api(`/api/messages/${chatId}`, 'GET', null, user2Token);
    if (msgRes.status === 200 && getRes.status === 200 && getRes.data.length > 0) {
      console.log('   ✅ Message saved to database and retrieved with 200 OK');
      results['Messaging Persistence & Retrieval'] = 'PASS';
    } else {
      results['Messaging Persistence & Retrieval'] = 'FAIL';
    }
  } catch (e) {
    results['Messaging Persistence & Retrieval'] = 'FAIL';
  }

  // 7. Durable Media Storage Upload
  console.log('\n7. [DURABLE MEDIA] Uploading test sample payload to /api/media/upload...');
  try {
    const sampleBase64 = 'data:image/jpeg;base64,' + Buffer.from('ChatterPatter Verified Test Image').toString('base64');
    const mediaRes = await api('/api/media/upload', 'POST', {
      dataUrl: sampleBase64,
      fileName: 'test_sample.jpg'
    }, user1Token);
    if (mediaRes.status === 200 && mediaRes.data.mediaUrl) {
      console.log('   ✅ Media file written to storage with URL:', mediaRes.data.mediaUrl);
      results['Media Storage Upload'] = 'PASS';
    } else {
      results['Media Storage Upload'] = 'FAIL';
    }
  } catch (e) {
    results['Media Storage Upload'] = 'FAIL';
  }

  // 8. STUN ICE Servers & Call Logs
  console.log('\n8. [WEBRTC CALLING & LOGS] Testing STUN ICE configuration & Call logs...');
  try {
    const iceRes = await api('/api/webrtc/ice-servers', 'GET');
    const callRes = await api('/api/calls', 'POST', {
      receiverId: user2Id,
      receiverName: 'Test Account Beta',
      type: 'video',
      duration: '01:30',
      durationSeconds: 90,
      status: 'completed'
    }, user1Token);
    const getCalls = await api('/api/calls', 'GET', null, user1Token);
    if (iceRes.status === 200 && callRes.status === 200 && getCalls.data.callLogs.length > 0) {
      console.log('   ✅ STUN servers active and call log recorded successfully');
      results['WebRTC ICE & Call Logging'] = 'PASS';
    } else {
      results['WebRTC ICE & Call Logging'] = 'FAIL';
    }
  } catch (e) {
    results['WebRTC ICE & Call Logging'] = 'FAIL';
  }

  // 9. User Blocking & Privacy Protection
  console.log('\n9. [PRIVACY & BLOCKING] Testing block list and blocked message rejection...');
  try {
    await api('/api/user/block', 'POST', { targetUserId: user2Id }, user1Token);
    const blockedMsgRes = await api('/api/messages', 'POST', {
      chatId: `chat_${user1Id}_${user2Id}`,
      recipientId: user2Id,
      text: 'This message should be rejected'
    }, user1Token);
    await api('/api/user/unblock', 'POST', { targetUserId: user2Id }, user1Token);

    if (blockedMsgRes.status === 403) {
      console.log('   ✅ Blocking enforced: Blocked sender correctly received 403 Forbidden');
      results['Privacy & Blocking Enforcement'] = 'PASS';
    } else {
      results['Privacy & Blocking Enforcement'] = 'FAIL';
    }
  } catch (e) {
    results['Privacy & Blocking Enforcement'] = 'FAIL';
  }

  // 10. Cloud Backup Export & Restore
  console.log('\n10. [CLOUD BACKUP] Testing encrypted export & lossless restore...');
  try {
    const exportRes = await api('/api/backup/export', 'POST', {}, user1Token);
    const restoreRes = await api('/api/backup/restore', 'POST', { backupData: exportRes.data.backup }, user1Token);
    if (exportRes.status === 200 && restoreRes.status === 200 && restoreRes.data.success) {
      console.log('   ✅ Backup exported and verified restore successfully');
      results['Cloud Backup Export/Restore'] = 'PASS';
    } else {
      results['Cloud Backup Export/Restore'] = 'FAIL';
    }
  } catch (e) {
    results['Cloud Backup Export/Restore'] = 'FAIL';
  }

  // 11. Push Token Registration
  console.log('\n11. [PUSH NOTIFICATIONS] Testing push token registration...');
  try {
    const pushRes = await api('/api/push/register', 'POST', {
      token: 'fcm_test_device_token_' + Date.now(),
      platform: 'android'
    }, user1Token);
    if (pushRes.status === 200 && pushRes.data.pushToken) {
      console.log('   ✅ FCM device token registered for user');
      results['Push Token Registration'] = 'PASS';
    } else {
      results['Push Token Registration'] = 'FAIL';
    }
  } catch (e) {
    results['Push Token Registration'] = 'FAIL';
  }

  // 12. Session Logout
  console.log('\n12. [LOGOUT & REVOCATION] Testing session invalidation...');
  try {
    const logoutRes = await api('/api/auth/logout', 'POST', {}, user1Token);
    const checkRes = await api('/api/auth/session', 'GET', null, user1Token);
    if (logoutRes.status === 200 && checkRes.status === 401) {
      console.log('   ✅ Session successfully invalidated (401)');
      results['Session Logout & Revocation'] = 'PASS';
    } else {
      results['Session Logout & Revocation'] = 'FAIL';
    }
  } catch (e) {
    results['Session Logout & Revocation'] = 'FAIL';
  }

  console.log(`\n====================================================`);
  console.log(`📊 FINAL PRODUCTION VERIFICATION SUMMARY`);
  console.log(`====================================================`);
  console.table(results);
}

runLiveTests();
