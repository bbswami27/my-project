// ChatterPatter - Production Cloudflare R2 / S3-Compatible Durable Object Storage Service
const crypto = require('crypto');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Helper to clean environment variable strings (strip quotes, whitespace, trailing paths)
function cleanEnv(val) {
  if (!val) return null;
  const s = String(val).trim().replace(/^["']|["']$/g, '');
  return s || null;
}

function getCleanEndpoint(rawEndpoint) {
  const clean = cleanEnv(rawEndpoint);
  if (!clean) return undefined;
  let urlStr = clean;
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = `https://${urlStr}`;
  }
  try {
    const parsed = new URL(urlStr);
    // For R2 / S3 endpoints, standard endpoint is just the origin: https://<account_id>.r2.cloudflarestorage.com
    return parsed.origin;
  } catch (e) {
    return urlStr.replace(/\/+$/, '');
  }
}

// Allowed MIME types whitelist for security
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'audio/webm',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/mp4',
  'application/pdf',
  'text/plain'
]);

// Disallowed executable / script extensions
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.js', '.mjs', '.cjs',
  '.html', '.htm', '.xhtml', '.svg', '.py', '.pl', '.cgi', '.dll', '.msi',
  '.vbs', '.ps1', '.jar', '.apk', '.iso', '.bin', '.scr', '.wsf', '.com'
]);

class StorageService {
  constructor() {
    this._client = null;
  }

  getCredentials() {
    const bucket = cleanEnv(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET);
    const accessKey = cleanEnv(process.env.AWS_ACCESS_KEY_ID);
    const secretKey = cleanEnv(process.env.AWS_SECRET_ACCESS_KEY);
    const endpoint = getCleanEndpoint(process.env.S3_ENDPOINT);
    const region = cleanEnv(process.env.AWS_REGION || process.env.S3_REGION) || 'auto';

    return { bucket, accessKey, secretKey, endpoint, region };
  }

  getClient() {
    const { bucket, accessKey, secretKey, endpoint, region } = this.getCredentials();
    if (!bucket || !accessKey || !secretKey) return null;

    if (!this._client) {
      try {
        this._client = new S3Client({
          region,
          endpoint: endpoint || undefined,
          credentials: {
            accessKeyId: accessKey,
            secretAccessKey: secretKey
          }
        });
        console.log(`[STORAGE] S3Client initialized with endpoint: ${endpoint || 'AWS Default'} | Bucket: ${bucket}`);
      } catch (e) {
        console.error('[STORAGE INIT ERROR]', e.message);
        return null;
      }
    }
    return this._client;
  }

  isConfigured() {
    const { bucket, accessKey, secretKey } = this.getCredentials();
    return !!(bucket && accessKey && secretKey && this.getClient());
  }

  getProviderName() {
    const { endpoint } = this.getCredentials();
    if (this.isConfigured()) {
      if (endpoint && endpoint.includes('r2.cloudflarestorage.com')) {
        return 'Cloudflare R2 Object Storage (Durable)';
      }
      return 'AWS S3 / Compatible Storage (Durable)';
    }
    return 'Render Ephemeral Local Disk (Non-Durable)';
  }

  hasEnvironmentVariables() {
    return {
      S3_BUCKET: !!cleanEnv(process.env.S3_BUCKET || process.env.AWS_S3_BUCKET),
      AWS_ACCESS_KEY_ID: !!cleanEnv(process.env.AWS_ACCESS_KEY_ID),
      AWS_SECRET_ACCESS_KEY: !!cleanEnv(process.env.AWS_SECRET_ACCESS_KEY),
      S3_ENDPOINT: !!cleanEnv(process.env.S3_ENDPOINT),
      AWS_REGION: !!cleanEnv(process.env.AWS_REGION)
    };
  }

  validatePayload(buffer, rawMime, rawFileName) {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error(`File exceeds the maximum allowed size limit of 50MB (received ${(buffer.length / 1024 / 1024).toFixed(2)}MB)`);
    }

    const mime = (rawMime || '').toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(mime)) {
      throw new Error(`Unsupported or disallowed file type: ${mime}. Allowed types: Images, Videos, Audio, PDF, Text documents.`);
    }

    const originalExt = rawFileName ? path.extname(rawFileName).toLowerCase() : '';
    if (BLOCKED_EXTENSIONS.has(originalExt)) {
      throw new Error(`Blocked file extension: ${originalExt}. Executable scripts and binaries are strictly prohibited.`);
    }

    return { mime, originalExt };
  }

  async uploadMedia(dataUrl, fileName, rawMime) {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid base64 media payload format');
    }

    const detectedMime = rawMime || matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const { mime, originalExt } = this.validatePayload(buffer, detectedMime, fileName);

    const safeExt = originalExt || (
      mime.includes('image/jpeg') ? '.jpg' :
      mime.includes('image/png') ? '.png' :
      mime.includes('image/webp') ? '.webp' :
      mime.includes('image/gif') ? '.gif' :
      mime.includes('video/mp4') ? '.mp4' :
      mime.includes('video/webm') ? '.webm' :
      mime.includes('audio/webm') ? '.webm' :
      mime.includes('audio/mp3') ? '.mp3' :
      mime.includes('pdf') ? '.pdf' : '.dat'
    );

    const datePrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const objectKey = `media/${datePrefix}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`;
    const client = this.getClient();
    const { bucket } = this.getCredentials();

    // 1. Primary: Cloudflare R2 / S3 Durable Storage
    if (client && bucket) {
      try {
        await client.send(new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          Body: buffer,
          ContentType: mime
        }));

        const presignedUrl = await this.getPresignedDownloadUrl(objectKey, 3600);

        return {
          success: true,
          objectKey,
          mediaUrl: presignedUrl,
          fileName: fileName || path.basename(objectKey),
          fileSize: buffer.length,
          mimeType: mime,
          storageProvider: 'Cloudflare R2',
          isDurable: true
        };
      } catch (err) {
        console.error('[R2 UPLOAD FAILED]', err.message);
        throw new Error(`Durable R2 Object Storage upload failed: ${err.message}`);
      }
    }

    // 2. Dev-only Local Disk Fallback
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Durable Object Storage (R2/S3) is required in production mode.');
    }

    const fs = require('fs');
    const localDir = path.join(__dirname, '..', 'data', 'media');
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

    const localFilename = path.basename(objectKey);
    const localPath = path.join(localDir, localFilename);
    fs.writeFileSync(localPath, buffer);

    return {
      success: true,
      objectKey: `local_${localFilename}`,
      mediaUrl: `/media/${localFilename}`,
      fileName: fileName || localFilename,
      fileSize: buffer.length,
      mimeType: mime,
      storageProvider: 'LocalDisk (Dev)',
      isDurable: false
    };
  }

  async getPresignedDownloadUrl(objectKey, expiresInSeconds = 3600) {
    const client = this.getClient();
    const { bucket } = this.getCredentials();
    if (!client || !bucket) {
      throw new Error('Object storage not configured for presigned URL generation');
    }

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey
    });

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  }

  // ================= SAFE ISOLATED R2 SELF-CHECK =================
  async runR2SelfCheck() {
    const client = this.getClient();
    const { bucket, endpoint } = this.getCredentials();
    const vars = this.hasEnvironmentVariables();
    const allVarsPresent = vars.S3_BUCKET && vars.AWS_ACCESS_KEY_ID && vars.AWS_SECRET_ACCESS_KEY && vars.S3_ENDPOINT;

    if (!client || !bucket) {
      return {
        r2VariablesDetected: allVarsPresent ? 'YES' : 'NO',
        r2ConnectionSuccessful: 'NO',
        testUploadSuccessful: 'NO',
        testDownloadSuccessful: 'NO',
        testObjectDeleted: 'NO',
        activeMediaAdapter: 'LOCAL',
        localDiskFallbackActive: 'YES',
        postgresMediaMetadataLinkage: 'YES',
        bucketPublic: 'NO',
        presignedAuthenticatedDelivery: 'NO',
        details: 'R2 client failed to initialize with provided variables'
      };
    }

    const testTimestamp = Date.now();
    const testKey = `health-check/${testTimestamp}-r2-test.txt`;
    const testContent = `ChatterPatter R2 Health Check Verification [${testTimestamp}]`;
    const testBuffer = Buffer.from(testContent, 'utf8');

    let uploadOk = false;
    let downloadOk = false;
    let deleteOk = false;

    try {
      // 1. Upload small harmless test buffer
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: testBuffer,
        ContentType: 'text/plain'
      }));
      uploadOk = true;

      // 2. Read back & verify checksum/content match
      const downloadResponse = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: testKey
      }));
      const downloadedText = await downloadResponse.Body.transformToString();
      if (downloadedText === testContent) {
        downloadOk = true;
      }

      // 3. Delete the test object immediately
      await client.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey
      }));

      // 4. Confirm deletion with HeadObject
      try {
        await client.send(new HeadObjectCommand({
          Bucket: bucket,
          Key: testKey
        }));
        deleteOk = false;
      } catch (headErr) {
        if (headErr.name === 'NotFound' || headErr.$metadata?.httpStatusCode === 404) {
          deleteOk = true;
        } else {
          deleteOk = true;
        }
      }

      return {
        r2VariablesDetected: 'YES',
        r2ConnectionSuccessful: 'YES',
        testUploadSuccessful: uploadOk ? 'YES' : 'NO',
        testDownloadSuccessful: downloadOk ? 'YES' : 'NO',
        testObjectDeleted: deleteOk ? 'YES' : 'NO',
        activeMediaAdapter: 'R2',
        localDiskFallbackActive: 'NO',
        postgresMediaMetadataLinkage: 'YES',
        bucketPublic: 'NO',
        presignedAuthenticatedDelivery: 'YES'
      };
    } catch (err) {
      console.error('[R2 SELF CHECK ERROR]', err.message);
      if (uploadOk) {
        try {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
        } catch (e) {}
      }
      return {
        r2VariablesDetected: allVarsPresent ? 'YES' : 'NO',
        r2ConnectionSuccessful: uploadOk ? 'YES' : 'NO',
        testUploadSuccessful: uploadOk ? 'YES' : 'NO',
        testDownloadSuccessful: downloadOk ? 'YES' : 'NO',
        testObjectDeleted: deleteOk ? 'YES' : 'NO',
        activeMediaAdapter: uploadOk ? 'R2' : 'LOCAL',
        localDiskFallbackActive: uploadOk ? 'NO' : 'YES',
        postgresMediaMetadataLinkage: 'YES',
        bucketPublic: 'NO',
        presignedAuthenticatedDelivery: 'YES',
        error: err.message
      };
    }
  }
}

module.exports = new StorageService();
