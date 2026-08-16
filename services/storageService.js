// ChatterPatter - Durable External Object Storage Service (AWS S3 / Cloudflare R2 / Supabase / Cloudinary)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let s3Client = null;
let s3Bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || null;

// Initialize AWS S3 / Compatible Object Storage if credentials exist
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && s3Bucket) {
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3Client = new S3Client({
      region: process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined, // For Cloudflare R2 or Supabase S3
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    console.log(`[STORAGE] External S3 Object Storage initialized for bucket: ${s3Bucket}`);
  } catch (err) {
    console.error('[STORAGE] Error initializing S3 client:', err.message);
  }
}

class StorageService {
  isConfigured() {
    return !!(s3Client && s3Bucket);
  }

  getProviderName() {
    if (s3Client && s3Bucket) return 'AWS S3 / Compatible Object Storage';
    return 'Render Ephemeral Local Disk (Non-Durable)';
  }

  async uploadMedia(dataUrl, fileName, mimeType) {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 media payload');
    }

    const mime = mimeType || matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    // Max 50MB check
    if (buffer.length > 50 * 1024 * 1024) {
      throw new Error('File exceeds 50MB size limit');
    }

    const ext = (fileName && fileName.includes('.')) 
      ? path.extname(fileName) 
      : (mime.includes('image') ? '.jpg' : mime.includes('video') ? '.mp4' : mime.includes('audio') ? '.webm' : '.bin');
    
    const key = `media/${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;

    // 1. If S3 configured, upload to durable cloud storage
    if (s3Client && s3Bucket) {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await s3Client.send(new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        ACL: 'public-read'
      }));

      const publicUrl = process.env.S3_PUBLIC_URL_PREFIX 
        ? `${process.env.S3_PUBLIC_URL_PREFIX.replace(/\/$/, '')}/${key}`
        : `https://${s3Bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

      return {
        mediaUrl: publicUrl,
        fileName: fileName || path.basename(key),
        fileSize: buffer.length,
        mimeType: mime,
        storageProvider: 'S3'
      };
    }

    // 2. Fallback to local disk (Ephemeral)
    const localDir = path.join(__dirname, '..', 'data', 'media');
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    const localFilename = path.basename(key);
    const localPath = path.join(localDir, localFilename);
    fs.writeFileSync(localPath, buffer);

    return {
      mediaUrl: `/media/${localFilename}`,
      fileName: fileName || localFilename,
      fileSize: buffer.length,
      mimeType: mime,
      storageProvider: 'LocalDisk'
    };
  }
}

module.exports = new StorageService();
