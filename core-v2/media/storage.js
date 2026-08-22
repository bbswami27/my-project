'use strict';

const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const ALLOWED = new Set([
  'image/jpeg','image/png','image/webp','image/gif',
  'video/mp4','video/webm','video/quicktime',
  'audio/webm','audio/mpeg','audio/mp3','audio/wav','audio/ogg','audio/mp4','audio/m4a',
  'application/pdf','text/plain'
]);
const BLOCKED = new Set(['.exe','.bat','.cmd','.sh','.js','.mjs','.cjs','.html','.htm','.apk','.jar','.msi','.dll','.ps1']);

function clean(v){return String(v||'').trim().replace(/^["']|["']$/g,'');}
function endpoint(v){const s=clean(v);if(!s)return undefined;const x=/^https?:\/\//i.test(s)?s:`https://${s}`;try{return new URL(x).origin;}catch{return x.replace(/\/+$/,'');}}

class CoreMediaStorage {
  constructor(){this.client=null;}
  config(){return {bucket:clean(process.env.S3_BUCKET||process.env.AWS_S3_BUCKET),accessKey:clean(process.env.AWS_ACCESS_KEY_ID),secretKey:clean(process.env.AWS_SECRET_ACCESS_KEY),endpoint:endpoint(process.env.S3_ENDPOINT),region:clean(process.env.AWS_REGION||process.env.S3_REGION)||'auto'};}
  getClient(){if(this.client)return this.client;const c=this.config();if(!c.bucket||!c.accessKey||!c.secretKey)throw new Error('R2/S3 storage is not configured');this.client=new S3Client({region:c.region,endpoint:c.endpoint,credentials:{accessKeyId:c.accessKey,secretAccessKey:c.secretKey}});return this.client;}
  validate(fileName,mime,size){const m=String(mime||'').toLowerCase();const bytes=Number(size||0);if(!ALLOWED.has(m))throw new Error('Unsupported attachment type');if(bytes<=0||bytes>50*1024*1024)throw new Error('Attachment must be between 1 byte and 50MB');const ext=path.extname(String(fileName||'')).toLowerCase();if(BLOCKED.has(ext))throw new Error('Blocked file extension');return {mime:m,ext};}
  async createUpload({userId,fileName,mime,size}){const v=this.validate(fileName,mime,size);const safeExt=v.ext||'.bin';const key=`core-v2/${userId}/${new Date().toISOString().slice(0,7)}/${Date.now()}_${crypto.randomBytes(10).toString('hex')}${safeExt}`;const c=this.config();const command=new PutObjectCommand({Bucket:c.bucket,Key:key,ContentType:v.mime,ContentLength:Number(size)});const uploadUrl=await getSignedUrl(this.getClient(),command,{expiresIn:600});return {objectKey:key,uploadUrl,expiresIn:600};}
  async createDownload(objectKey){const key=String(objectKey||'');if(!key.startsWith('core-v2/'))throw new Error('Invalid object key');const c=this.config();const url=await getSignedUrl(this.getClient(),new GetObjectCommand({Bucket:c.bucket,Key:key}),{expiresIn:3600});return {url,expiresIn:3600};}
}

module.exports = CoreMediaStorage;
