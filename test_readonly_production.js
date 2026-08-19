// ChatterPatter - Strictly 100% GET-Only Read-Only Production Verification Suite
// Target Server: https://chitchat-chatterpatter.onrender.com
//
// STRICT SAFETY PROPERTIES:
// 1. 100% GET requests ONLY (NO POST, PUT, PATCH, or DELETE methods exist in this script).
// 2. Zero data mutation possibility.
// 3. Zero SMS or OTP requests.
// 4. Verifies liveness, non-sensitive public configuration, and 401 unauthorized rejection guards on protected GET endpoints.

const PROD_URL = 'https://chitchat-chatterpatter.onrender.com';

async function runReadOnlyProductionTests() {
  console.log(`================================================================`);
  console.log(`🔍 STRICTLY 100% GET-ONLY LIVE PRODUCTION VERIFICATION SUITE`);
  console.log(`🌐 Target URL: ${PROD_URL}`);
  console.log(`🔒 Absolute Read-Only Guarantee: Zero Mutating HTTP Methods`);
  console.log(`================================================================\n`);

  const results = {};

  // Pure GET-Only Helper
  async function httpGet(endpoint, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${PROD_URL}${endpoint}`, {
      method: 'GET',
      headers
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
    return { status: res.status, data };
  }

  // 1. GET /api/health
  console.log('1. [READ-ONLY] Testing GET /api/health...');
  try {
    const res = await httpGet('/api/health');
    if (res.status === 200 && res.data && res.data.status === 'ok') {
      console.log('   ✅ /api/health responded 200 OK:', res.data);
      results['GET /api/health'] = 'PASS';
    } else {
      console.log('   ❌ /api/health failed with status:', res.status);
      results['GET /api/health'] = 'FAIL';
    }
  } catch (e) {
    console.log('   ❌ /api/health error:', e.message);
    results['GET /api/health'] = 'FAIL';
  }

  // 2. GET /health (Liveness Probe)
  console.log('\n2. [READ-ONLY] Testing GET /health...');
  try {
    const res = await httpGet('/health');
    if (res.status === 200) {
      console.log('   ✅ /health responded 200 OK (Liveness probe healthy)');
      results['GET /health (Liveness)'] = 'PASS';
    } else {
      console.log('   ❌ /health failed with status:', res.status);
      results['GET /health (Liveness)'] = 'FAIL';
    }
  } catch (e) {
    console.log('   ❌ /health error:', e.message);
    results['GET /health (Liveness)'] = 'FAIL';
  }

  // 3. GET /ping
  console.log('\n3. [READ-ONLY] Testing GET /ping...');
  try {
    const res = await httpGet('/ping');
    if (res.status === 200 && res.data && res.data.status === 'live') {
      console.log('   ✅ /ping responded 200 OK:', res.data);
      results['GET /ping'] = 'PASS';
    } else {
      results['GET /ping'] = 'FAIL';
    }
  } catch (e) {
    results['GET /ping'] = 'FAIL';
  }

  // 4. Invalid Token 401 Rejection on GET /api/auth/session
  console.log('\n4. [READ-ONLY] Testing invalid auth token rejection on GET /api/auth/session...');
  try {
    const res = await httpGet('/api/auth/session', 'invalid_session_probe_token_99999');
    if (res.status === 401) {
      console.log('   ✅ Invalid token correctly rejected with 401 Unauthorized');
      results['Invalid Token 401 Rejection (GET /api/auth/session)'] = 'PASS';
    } else {
      console.log('   ❌ Expected 401 but received status:', res.status);
      results['Invalid Token 401 Rejection (GET /api/auth/session)'] = 'FAIL';
    }
  } catch (e) {
    results['Invalid Token 401 Rejection (GET /api/auth/session)'] = 'FAIL';
  }

  // 5. Unauthenticated GET Requests to Protected Endpoints (401 Auth Guards)
  console.log('\n5. [READ-ONLY] Testing 401 Auth Guards across protected GET endpoints...');
  const protectedGetEndpoints = [
    { name: 'GET /api/users', path: '/api/users' },
    { name: 'GET /api/messages/:chatId', path: '/api/messages/chat_unauth_guard_probe' },
    { name: 'GET /api/calls', path: '/api/calls' },
    { name: 'GET /api/user/blocked', path: '/api/user/blocked' },
    { name: 'GET /api/devices/:userId', path: '/api/devices/usr_unauth_probe' },
    { name: 'GET /api/groups', path: '/api/groups' },
    { name: 'GET /api/status', path: '/api/status' }
  ];

  let allGuardsPassed = true;
  for (const ep of protectedGetEndpoints) {
    try {
      const res = await httpGet(ep.path, null);
      if (res.status === 401) {
        console.log(`   ✅ ${ep.name} -> Rejected unauthenticated request (401)`);
      } else {
        console.log(`   ❌ ${ep.name} -> Unexpected status ${res.status}`);
        allGuardsPassed = false;
      }
    } catch (e) {
      allGuardsPassed = false;
    }
  }
  results['Protected GET Endpoints 401 Auth Guards (7 routes)'] = allGuardsPassed ? 'PASS' : 'FAIL';

  // 6. Public Configuration & Non-Sensitive GET Endpoints
  console.log('\n6. [READ-ONLY] Testing public configuration & content GET endpoints...');
  try {
    const iceRes = await httpGet('/api/webrtc/ice-servers');
    const newsRes = await httpGet('/api/news');
    const flashRes = await httpGet('/api/news/flash');

    const iceValid = iceRes.status === 200 && Array.isArray(iceRes.data.iceServers) && iceRes.data.iceServers.length > 0;
    const newsValid = newsRes.status === 200 && Array.isArray(newsRes.data);
    const flashValid = flashRes.status === 200 && Array.isArray(flashRes.data.ticker);

    if (iceValid && newsValid && flashValid) {
      console.log('   ✅ Public WebRTC STUN ICE & News configuration verified non-sensitive:', {
        iceServersCount: iceRes.data.iceServers.length,
        newsArticlesCount: newsRes.data.length,
        flashItemsCount: flashRes.data.ticker.length
      });
      results['Public Config Endpoints (STUN/News)'] = 'PASS';
    } else {
      results['Public Config Endpoints (STUN/News)'] = 'FAIL';
    }
  } catch (e) {
    results['Public Config Endpoints (STUN/News)'] = 'FAIL';
  }

  // Summary Table
  console.log(`\n================================================================`);
  console.log(`📊 READ-ONLY PRODUCTION VERIFICATION AUDIT`);
  console.log(`================================================================`);
  console.table(results);

  return results;
}

runReadOnlyProductionTests();
