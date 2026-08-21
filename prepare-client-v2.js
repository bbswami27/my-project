'use strict';

const fs = require('fs');
const path = require('path');

function injectScripts(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');
  const tags = [
    '<script src="js/identity-routing-v2.js"></script>',
    '<script src="js/ui-stability-v4.js"></script>',
    '<script src="js/contact-refresh-privacy-v4.js"></script>',
    '<script src="js/contact-directory-v5.js"></script>',
    '<script src="js/message-delivery-v4.js"></script>',
    '<script src="js/call-reliability-v5.js"></script>',
    '<script src="js/status-reliability-v6.js"></script>',
    '<script src="js/email-compose-v7.js"></script>',
    '<script src="js/meeting-invites-v8.js"></script>',
    '<script src="js/screen-share-recipient-v9.js"></script>',
    '<script src="js/star-chat-v10.js"></script>',
    '<script src="js/chat-group-preference-v11.js"></script>',
    '<script src="js/universal-back-v12.js"></script>',
    '<script src="js/anti-fraud-menu-v13.js"></script>',
    '<script src="js/responsive-ui-v14.js"></script>'
  ];
  html = html.replace(/\s*<script src="js\/message-routing-v3\.js"><\/script>\s*/g, '\n');
  for (const tag of tags) {
    const src = tag.match(/src="([^"]+)"/)[1];
    if (!html.includes(src)) html = html.replace('</body>', `  ${tag}\n</body>`);
  }
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[PREPARE V17] injected complete v1.0.4 repair scripts into ${filePath}`);
}

function bumpCache(filePath) {
  if (!fs.existsSync(filePath)) return;
  let sw = fs.readFileSync(filePath, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'gitpit-web-v[^']+';/, "const CACHE_NAME = 'gitpit-web-v1.0.18';");
  sw = sw.replace(/\s*'\.\/js\/message-routing-v3\.js',?/g, '');
  for (const asset of ['./js/identity-routing-v2.js','./js/ui-stability-v4.js','./js/contact-refresh-privacy-v4.js','./js/contact-directory-v5.js','./js/message-delivery-v4.js','./js/call-reliability-v5.js','./js/status-reliability-v6.js','./js/email-compose-v7.js','./js/meeting-invites-v8.js','./js/screen-share-recipient-v9.js','./js/star-chat-v10.js','./js/chat-group-preference-v11.js','./js/universal-back-v12.js','./js/anti-fraud-menu-v13.js','./js/responsive-ui-v14.js']) {
    if (!sw.includes(`'${asset}'`)) sw = sw.replace("'./js/locationService.js',", "'./js/locationService.js',\n  '" + asset + "',");
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

for (const name of ['identity-routing-v2.js','ui-stability-v4.js','contact-refresh-privacy-v4.js','contact-directory-v5.js','message-delivery-v4.js','call-reliability-v5.js','status-reliability-v6.js','email-compose-v7.js','meeting-invites-v8.js','screen-share-recipient-v9.js','star-chat-v10.js','chat-group-preference-v11.js','universal-back-v12.js','anti-fraud-menu-v13.js','responsive-ui-v14.js']) mirrorPublicScript(name);
injectScripts(path.join(__dirname, 'public', 'index.html'));
injectScripts(path.join(__dirname, 'index.html'));
bumpCache(path.join(__dirname, 'public', 'sw.js'));
bumpCache(path.join(__dirname, 'sw.js'));
console.log('[PREPARE V17] GitPit v1.0.4 complete client preparation');
