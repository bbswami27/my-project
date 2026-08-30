'use strict';

const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/js/app.js', 'utf8');
const chat = fs.readFileSync('public/js/chat.js', 'utf8');
const stories = fs.readFileSync('public/js/stories.js', 'utf8');
const loader = fs.readFileSync('public/js/post-auth-repairs-v15.js', 'utf8');
const css = fs.readFileSync('public/css/main.css', 'utf8');
const database = fs.readFileSync('database.js', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');

assert(!/id="btn-chat-attach"[^>]*onclick=/.test(html), 'chat attachment has duplicate inline handler');
assert(!/id="btn-publish-status"[^>]*onclick=/.test(html), 'status publish has duplicate inline handler');
assert(!/id="status-media-file-input"[^>]*onchange=/.test(html), 'status input has duplicate inline handler');
assert(chat.includes("attachBtn.addEventListener('click'"), 'chat attachment binding missing');
assert(stories.includes("mediaInput.addEventListener('change'"), 'status file binding missing');
assert(stories.includes("publishButton.addEventListener('click'"), 'status publish binding missing');
assert(app.includes("sidebar.classList.remove('mobile-hidden')"), 'mobile sidebar reset missing');
assert(app.includes("chatMain.classList.remove('mobile-active')"), 'mobile chat reset missing');
assert(loader.includes("'status-reliability-v6.js'"), 'reliable status runtime not loaded');
assert(css.includes('.three-dots-dropdown.ungrouped-menu .dropdown-panel'), 'ungrouped menu CSS missing');
assert((html.match(/<option value=/g) || []).length >= 10, 'ten app themes are not available');
const chatStartup = chat.slice(0, chat.indexOf('  clearOldChatsCache()'));
assert(!chatStartup.includes("localStorage.removeItem('gitpit_phonebook')"), 'phonebook is erased during startup');
assert(!chat.includes('Ensure all 4 official demo users'), 'demo chat seeding remains enabled');
assert(!chat.includes('window.MOCK_DATA.demoUsers'), 'demo users remain in contact sync fallback');
assert(!/constructor\(\)\s*\{[\s\S]{0,180}this\.seedDummyUsers\(\)/.test(database), 'backend seeds dummy users at startup');
assert(server.includes('Demo-user reset is disabled.'), 'destructive demo reset endpoint remains enabled');

console.log('PASS: UI regression checks');
