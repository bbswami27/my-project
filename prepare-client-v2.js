'use strict';

const fs=require('fs');
const path=require('path');

const repairNames=[
  'identity-routing-v2.js','ui-stability-v4.js','contact-refresh-privacy-v4.js','contact-directory-v5.js','contact-native-v16.js',
  'message-delivery-v4.js','call-reliability-v5.js','status-reliability-v6.js','email-compose-v7.js','meeting-invites-v8.js',
  'screen-share-recipient-v9.js','star-chat-v10.js','chat-group-preference-v11.js','universal-back-v12.js','anti-fraud-menu-v13.js',
  'responsive-ui-v14.js','safe-ui-final-v20.js','v111-ui-data-fixes.js','v111-realtime-contact-fixes.js','post-auth-repairs-v15.js'
];

const runtimeNames=[
  'contact-native-v16.js','message-delivery-v4.js','call-reliability-v5.js','status-reliability-v6.js',
  'meeting-invites-v8.js','screen-share-recipient-v9.js','safe-ui-final-v20.js','v111-ui-data-fixes.js',
  'v111-realtime-contact-fixes.js','post-auth-repairs-v15.js'
];

function prepareHtml(filePath){
  if(!fs.existsSync(filePath))return;
  let html=fs.readFileSync(filePath,'utf8');
  for(const name of repairNames){
    if(name==='post-auth-repairs-v15.js')continue;
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    html=html.replace(new RegExp(`\\s*<script src="js/${escaped}"><\\/script>\\s*`,'g'),'\n');
  }
  html=html.replace(/\s*<script src="js\/message-routing-v3\.js"><\/script>\s*/g,'\n');
  const bootstrap='<script src="js/post-auth-repairs-v15.js?v=111b"></script>';
  html=html.replace(/\s*<script src="js\/post-auth-repairs-v15\.js(?:\?[^\"]*)?"><\/script>\s*/g,'\n');
  html=html.replace('</body>',`  ${bootstrap}\n</body>`);
  fs.writeFileSync(filePath,html,'utf8');
  console.log(`[PREPARE V23] v1.1.1 production client prepared in ${filePath}`);
}

function bumpCache(filePath){
  if(!fs.existsSync(filePath))return;
  let sw=fs.readFileSync(filePath,'utf8');
  sw=sw.replace(/const CACHE_NAME = 'gitpit-web-v[^']+';/,"const CACHE_NAME = 'gitpit-web-v1.1.1-b';");
  for(const name of repairNames){
    const escaped=`./js/${name}`.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    sw=sw.replace(new RegExp(`\\s*'${escaped}',?`,'g'),'');
  }
  if(!sw.includes("'./js/post-auth-repairs-v15.js'"))sw=sw.replace("'./js/locationService.js',","'./js/locationService.js',\n  './js/post-auth-repairs-v15.js',");
  fs.writeFileSync(filePath,sw,'utf8');
}

function mirror(name){
  const src=path.join(__dirname,'public','js',name),dst=path.join(__dirname,'js',name);
  if(fs.existsSync(src)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst);}
}
for(const name of runtimeNames)mirror(name);
prepareHtml(path.join(__dirname,'public','index.html'));
prepareHtml(path.join(__dirname,'index.html'));
bumpCache(path.join(__dirname,'public','sw.js'));
bumpCache(path.join(__dirname,'sw.js'));
console.log('[PREPARE V23] GitPit v1.1.1 repair client packaging complete');
