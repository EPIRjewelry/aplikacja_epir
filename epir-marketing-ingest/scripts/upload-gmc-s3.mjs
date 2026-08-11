import fs from 'node:fs';
import crypto from 'node:crypto';
import https from 'node:https';

const accountId = '73283c24dc79f92edef30dcdbc98f230';
const bucket = 'epir-gmc-feed';
const key = 'gmc_feed.csv';
const region = 'auto';
const service = 's3';
const host = `${accountId}.r2.cloudflarestorage.com`;

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('CLOUDFLARE_API_TOKEN is required');
  process.exit(1);
}

const accessKeyId = '226c43976cc07d83333711110ebf8ebb';
const secretAccessKey = crypto.createHash('sha256').update(token).digest('hex');

const filePath =
  process.argv[2] ?? 'd:/marketing/csv/gmc_feed_2026-08-08.csv';
const body = fs.readFileSync(filePath);

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data, encoding) {
  return crypto.createHmac('sha256', key).update(data).digest(encoding);
}

function signRequest(method, path, payload) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(payload);

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(
      hmac(
        hmac('AWS4' + secretAccessKey, dateStamp),
        region,
      ),
      service,
    ),
    'aws4_request',
  );

  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    amzDate,
    payloadHash,
    authorization,
  };
}

const path = `/${bucket}/${key}`;
const { amzDate, payloadHash, authorization } = signRequest('PUT', path, body);

await new Promise((resolve, reject) => {
  const req = https.request(
    {
      hostname: host,
      path,
      method: 'PUT',
      headers: {
        Host: host,
        'Content-Type': 'text/csv',
        'Content-Length': body.length,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
    },
    (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Upload OK', {
            status: res.statusCode,
            etag: res.headers.etag,
            bytes: body.length,
          });
          resolve();
          return;
        }
        console.error('Upload failed', res.statusCode, responseBody);
        reject(new Error(`HTTP ${res.statusCode}`));
      });
    },
  );
  req.on('error', reject);
  req.write(body);
  req.end();
});
