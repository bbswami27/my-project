'use strict';

const fs = require('fs');
const path = require('path');

function injectScripts(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');
  const tags = [
    '<script src="js/identity-routing-v2.js"></script>',
    '<script src="js/message-routing-v3.js"></script>',
    '<script src="js/ui-stability-v4.js"></script>',
    '<script src="js/contact-refresh-privacy-v4.js"></script>',
    '<script src="js/contact-directory-v5.js"></script>'
  ];
  for (const tag of tags) {
    const src = tag.match(/src="([^"]+)"/)[1];
    if (!html.includes(src)) {
      html = html.replace('</body>', `  ${tag}\n</body>`);
    }
  }
  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`[PREPARE V6] injected reliability scripts into ${filePath}`);
}

function bumpCache(filePath) {
  if (!fs.existsSync(filePath)) return;
  let sw = fs.readFileSync(filePath, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'gitpit-web-v[^']+';/, "const CACHE_NAME = 'gitpit-web-v1.0.7';");
  for (const asset of ['./js/identity-routing-v2.js', './js/message-routing-v3.js', './js/ui-stability-v4.js', './js/contact-refresh-privacy-v4.js', './js/contact-directory-v5.js']) {
    if (!sw.includes(`'${asset}'`)) {
      sw = sw.replace("'./js/locationService.js',", "'./js/locationService.js',\n  '" + asset + "',");
    }
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

mirrorPublicScript('identity-routing-v2.js');
mirrorPublicScript('message-routing-v3.js');
mirrorPublicScript('ui-stability-v4.js');
mirrorPublicScript('contact-refresh-privacy-v4.js');
mirrorPublicScript('contact-directory-v5.js');

injectScripts(path.join(__dirname, 'public', 'index.html'));
injectScripts(path.join(__dirname, 'index.html'));
bumpCache(path.join(__dirname, 'public', 'sw.js'));
bumpCache(path.join(__dirname, 'sw.js'));

console.log('[PREPARE V6] GitPit client preparation complete');
