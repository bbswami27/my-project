'use strict';

// GitPit message/link delivery repair.
// This patch is intentionally idempotent so it can safely run during npm install,
// Render startup, and Android build preparation without duplicating changes.

const fs = require('fs');
const path = require('path');

const root = __dirname;

function patchFile(relPath, transforms) {
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`[MESSAGE FIX] skip missing ${relPath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const transform of transforms) {
    if (content.includes(transform.marker)) continue;
    if (!content.includes(transform.from)) {
      console.warn(`[MESSAGE FIX] pattern not found in ${relPath}: ${transform.name}`);
      continue;
    }
    content = content.replace(transform.from, transform.to);
    changed = true;
    console.log(`[MESSAGE FIX] applied ${transform.name} -> ${relPath}`);
  }

  if (changed) fs.writeFileSync(filePath, content, 'utf8');
  return changed;
}

const chatTransforms = [
  {
    name: 'single transport message delivery',
    marker: 'GITPIT_SINGLE_TRANSPORT_FIX',
    from: `    // Broadcast over Socket.io\n    if (window.ChatterApp && window.ChatterApp.socket && window.ChatterApp.socket.connected) {\n      window.ChatterApp.socket.emit('send_message', {\n        ...newMsg,\n        senderPhone: senderPhone,\n        recipientPhone: recipientPhone,\n        recipientId: activeChat.id,\n        isAiChat: activeChat.isAi || activeChat.id === 'chat_ai'\n      });\n    }\n\n    // Direct AI Response Trigger`,
    to: `    // GITPIT_SINGLE_TRANSPORT_FIX\n    // Use Socket.io when connected. REST is a fallback only, otherwise the same\n    // message is saved/broadcast twice and can appear duplicated or misrouted.\n    let sentViaSocket = false;\n    if (window.ChatterApp && window.ChatterApp.socket && window.ChatterApp.socket.connected) {\n      window.ChatterApp.socket.emit('send_message', {\n        ...newMsg,\n        senderPhone: senderPhone,\n        recipientPhone: recipientPhone,\n        recipientId: activeChat.id,\n        isAiChat: activeChat.isAi || activeChat.id === 'chat_ai'\n      });\n      sentViaSocket = true;\n    }\n\n    // Direct AI Response Trigger`
  },
  {
    name: 'REST fallback only',
    marker: 'GITPIT_REST_FALLBACK_FIX',
    from: `    // Persist via REST API Fallback\n    try {\n      const base = window.API_BASE || '';\n      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');\n      fetch(\`${'${base}'}/api/messages\`, {`,
    to: `    // GITPIT_REST_FALLBACK_FIX\n    // Persist via REST only when the realtime socket is unavailable.\n    if (!sentViaSocket) try {\n      const base = window.API_BASE || '';\n      const token = localStorage.getItem('gitpit_auth_token') || (window.AuthManager ? window.AuthManager.authToken : '');\n      fetch(\`${'${base}'}/api/messages\`, {`
  },
  {
    name: 'recipient guard for broadcast safety',
    marker: 'GITPIT_RECIPIENT_GUARD_FIX',
    from: `    const cleanMyPhone = (currentPhone || '').replace(/\\D/g, '').slice(-10);\n\n    // If this is an incoming message from myself, don't duplicate`,
    to: `    const cleanMyPhone = (currentPhone || '').replace(/\\D/g, '').slice(-10);\n\n    // GITPIT_RECIPIENT_GUARD_FIX\n    // Ignore direct messages that are addressed to somebody else. This protects\n    // clients from legacy/global Socket.io broadcasts while preserving groups.\n    const recipientId = (msg.recipientId || '').toString();\n    const recipientPhone10 = (msg.recipientPhone || '').replace(/\\D/g, '').slice(-10);\n    const isGroupMessage = !!(msg.chatId && msg.chatId.startsWith('group_'));\n    const isAiMessage = msg.chatId === 'chat_ai' || msg.senderId === 'ai_assistant';\n    const addressedToMe = !recipientId && !recipientPhone10\n      ? true\n      : isGroupMessage || isAiMessage\n        || (currentUserId && (recipientId === currentUserId || recipientId === ('user_' + cleanMyPhone)))\n        || (cleanMyPhone && recipientPhone10 === cleanMyPhone);\n    if (!addressedToMe) return;\n\n    // If this is an incoming message from myself, don't duplicate`
  },
  {
    name: 'robust clickable links',
    marker: 'GITPIT_LINKIFY_FIX',
    from: `    // URLs to links\n    formatted = formatted.replace(/(https?:\\/\\/[^\\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');`,
    to: `    // GITPIT_LINKIFY_FIX\n    // Make http(s) and www links clickable, while keeping trailing punctuation\n    // outside the anchor so links sent in normal sentences open correctly.\n    formatted = formatted.replace(/(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+)/gi, (rawUrl) => {\n      const match = rawUrl.match(/^(.*?)([.,!?;:)]*)$/);\n      const cleanUrl = match ? match[1] : rawUrl;\n      const trailing = match ? match[2] : '';\n      const href = /^www\\./i.test(cleanUrl) ? 'https://' + cleanUrl : cleanUrl;\n      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + cleanUrl + '</a>' + trailing;\n    });`
  }
];

const serverTransforms = [
  {
    name: 'targeted socket delivery',
    marker: 'GITPIT_TARGETED_SOCKET_FIX',
    from: `    if (msgData.chatId) {\n      io.emit(\`receive_message_${'${msgData.chatId}'}\`, enrichedMsg);\n    }\n    io.emit('receive_message', enrichedMsg);\n    io.emit('chat_message', enrichedMsg);\n\n    const recipientPhone10 = (msgData.recipientPhone || '').replace(/\\D/g, '').slice(-10);\n    if (recipientPhone10) {\n      io.to(\`user_${'${recipientPhone10}'}\`).emit('receive_message', enrichedMsg);\n    }\n    if (targetId) {\n      io.to(\`user_${'${targetId}'}\`).emit('receive_message', enrichedMsg);\n    }`,
    to: `    // GITPIT_TARGETED_SOCKET_FIX\n    // Direct messages must go only to the intended user. The sender already\n    // renders its local copy, so a global receive_message broadcast is harmful.\n    const recipientPhone10 = (msgData.recipientPhone || '').replace(/\\D/g, '').slice(-10);\n    const isGroupMessage = !!(msgData.chatId && msgData.chatId.startsWith('group_'));\n    if (isGroupMessage) {\n      io.emit(\`receive_message_${'${msgData.chatId}'}\`, enrichedMsg);\n    } else {\n      if (recipientPhone10) {\n        io.to(\`user_${'${recipientPhone10}'}\`).emit('receive_message', enrichedMsg);\n      }\n      if (targetId) {\n        io.to(\`user_${'${targetId}'}\`).emit('receive_message', enrichedMsg);\n      }\n    }\n    socket.emit('message_saved', { id: enrichedMsg.id, status: 'sent' });`
  },
  {
    name: 'targeted REST delivery',
    marker: 'GITPIT_TARGETED_REST_FIX',
    from: `  if (req.body.chatId) {\n    io.emit(\`receive_message_${'${req.body.chatId}'}\`, savedMsg);\n  }\n  io.emit('receive_message', savedMsg);`,
    to: `  // GITPIT_TARGETED_REST_FIX\n  const recipientPhone10 = (req.body.recipientPhone || '').replace(/\\D/g, '').slice(-10);\n  const isGroupMessage = !!(req.body.chatId && req.body.chatId.startsWith('group_'));\n  if (isGroupMessage) {\n    io.emit(\`receive_message_${'${req.body.chatId}'}\`, savedMsg);\n  } else {\n    if (recipientPhone10) io.to(\`user_${'${recipientPhone10}'}\`).emit('receive_message', savedMsg);\n    if (targetId) io.to(\`user_${'${targetId}'}\`).emit('receive_message', savedMsg);\n  }`
  }
];

for (const rel of ['js/chat.js', 'public/js/chat.js', 'public/chat.js']) {
  patchFile(rel, chatTransforms);
}
patchFile('server.js', serverTransforms);

console.log('[MESSAGE FIX] message routing/link patch complete');

if (!process.argv.includes('--patch-only')) {
  require('./server');
}
