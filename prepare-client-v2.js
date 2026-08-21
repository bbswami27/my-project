'use strict';

const fs = require('fs');
const path = require('path');

const repairNames = [
  'identity-routing-v2.js','ui-stability-v4.js','contact-refresh-privacy-v4.js','contact-directory-v5.js',
  'message-delivery-v4.js','call-reliability-v5.js','status-reliability-v6.js','email-compose-v7.js',
  'meeting-invites-v8.js','screen-share-recipient-v9.js','star-chat-v10.js','chat-group-preference-v11.js',
  'universal-back-v12.js','anti-fraud-menu-v13.js','responsive-ui-v14.js','post-auth-repairs-v15.js'
];

function prepareHtml(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');

  // Remove all direct repair module tags so none can interfere with login/OTP UI.
  for (const name of repairNames) {
    if (name === 'post-auth-repairs-v15.js') continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`\\s*<script src="js/${escaped}"><\\/script>\\s*`, 'g'), '\n');
  }
  html = html.replace(/\s*<script src="js\/message-routing-v3\.js"><\/script>\s*/g, '\n');

  const bootstrap='<script src="js/post-auth-repairs-v15.js"></script>';
  if (!html.includes('post-auth-repairs-v15.js')) html = html.replace('</body>', `  ${bootstrap}\n</body>`);

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[PREPARE V18] login isolated; post-auth repair bootstrap injected into ${filePath}`);
}

function bumpCache(filePath) {
  if (!fs.existsSync(filePath)) return;
  let sw = fs.readFileSync(filePath, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'gitpit-web-v[^']+';/, "const CACHE_NAME = 'gitpit-web-v1.0.20';");

  // Do not pre-cache direct repair modules on login; only bootstrap is needed initially.
  for (const name of repairNames) {
    if (name === 'post-auth-repairs-v15.js') continue;
    const asset = `./js/${name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sw = sw.replace(new RegExp(`\\s*'${asset}',?`, 'g'), '');
  }
  if (!sw.includes("'./js/post-auth-repairs-v15.js'")) {
    sw = sw.replace("'./js/locationService.js',", "'./js/locationService.js',\n  './js/post-auth-repairs-v15.js',");
  }
  fs.writeFileSync(filePath, sw, 'utf8');
}

function mirrorPublicScript(name) {
  const publicFile = path.join(__dirname, 'public', 'js', name);
  const rootFile = path.join(__dirname, 'js', name);
  if (fs.existsSync(publicFile)) {
    fs.mkdirSync(path.dirname(rootFile), { recursive: true });
    fs.copyFileSync(publicFile, rootFile);
  }
}

for (const name of repairNames) mirrorPublicScript(name);
prepareHtml(path.join(__dirname, 'public', 'index.html'));
prepareHtml(path.join(__dirname, 'index.html'));
bumpCache(path.join(__dirname, 'public', 'sw.js'));
bumpCache(path.join(__dirname, 'sw.js'));
console.log('[PREPARE V18] GitPit v1.0.6 login-safe client preparation complete');
