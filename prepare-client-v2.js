'use strict';

const fs = require('fs');
const path = require('path');

function injectScript(filePath) {
  if (!fs.existsSync(filePath)) return;
  let html = fs.readFileSync(filePath, 'utf8');
  const tag = '<script src="js/identity-routing-v2.js"></script>';
  if (!html.includes('identity-routing-v2.js')) {
    html = html.replace('</body>', `  ${tag}\n</body>`);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`[PREPARE V2] injected identity repair into ${filePath}`);
  }
}

function bumpCache(filePath) {
  if (!fs.existsSync(filePath)) return;
  let sw = fs.readFileSync(filePath, 'utf8');
  sw = sw.replace(/const CACHE_NAME = 'gitpit-web-v[^']+';/, "const CACHE_NAME = 'gitpit-web-v1.0.3';");
  if (!sw.includes("'./js/identity-routing-v2.js'")) {
    sw = sw.replace("'./js/locationService.js',", "'./js/locationService.js',\n  './js/identity-routing-v2.js',");
  }
  fs.writeFileSync(filePath, sw, 'utf8');
}

const publicIdentity = path.join(__dirname, 'public', 'js', 'identity-routing-v2.js');
const rootIdentity = path.join(__dirname, 'js', 'identity-routing-v2.js');
if (fs.existsSync(publicIdentity)) {
  fs.mkdirSync(path.dirname(rootIdentity), { recursive: true });
  fs.copyFileSync(publicIdentity, rootIdentity);
}

injectScript(path.join(__dirname, 'public', 'index.html'));
injectScript(path.join(__dirname, 'index.html'));
bumpCache(path.join(__dirname, 'public', 'sw.js'));
bumpCache(path.join(__dirname, 'sw.js'));

console.log('[PREPARE V2] GitPit client preparation complete');
