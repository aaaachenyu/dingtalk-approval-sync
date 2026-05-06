import crypto from 'node:crypto';

const BLOCK_SIZE = 32;

function pkcs7Unpad(buffer) {
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > BLOCK_SIZE) return buffer;
  return buffer.subarray(0, buffer.length - pad);
}

function pkcs7Pad(buffer) {
  const amount = BLOCK_SIZE - (buffer.length % BLOCK_SIZE || BLOCK_SIZE);
  const pad = amount === 0 ? BLOCK_SIZE : amount;
  return Buffer.concat([buffer, Buffer.alloc(pad, pad)]);
}

function aesKey(encodingAesKey) {
  return Buffer.from(`${encodingAesKey}=`, 'base64');
}

export function sign(token, timestamp, nonce, encrypt) {
  return crypto
    .createHash('sha1')
    .update([token, timestamp, nonce, encrypt].sort().join(''))
    .digest('hex');
}

export function decryptCallback({ token, encodingAesKey, ownerKey, signature, timestamp, nonce, encrypt }) {
  if (!signature) {
    throw new Error('Missing DingTalk msg_signature');
  }
  if (!timestamp || !nonce || !encrypt) {
    throw new Error('Missing DingTalk callback timestamp, nonce, or encrypt');
  }

  const expected = sign(token, timestamp, nonce, encrypt);
  if (expected !== signature) {
    throw new Error('Invalid DingTalk callback signature');
  }

  const key = aesKey(encodingAesKey);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, key.subarray(0, 16));
  decipher.setAutoPadding(false);
  const decrypted = pkcs7Unpad(Buffer.concat([decipher.update(Buffer.from(encrypt, 'base64')), decipher.final()]));
  const messageLength = decrypted.readUInt32BE(16);
  const message = decrypted.subarray(20, 20 + messageLength).toString('utf8');
  const receiver = decrypted.subarray(20 + messageLength).toString('utf8');

  if (ownerKey && receiver && receiver !== ownerKey) {
    throw new Error(`DingTalk callback owner mismatch: expected ${ownerKey}, got ${receiver}`);
  }

  return JSON.parse(message);
}

export function encryptCallbackResponse({ token, encodingAesKey, ownerKey, timestamp, nonce, message = 'success' }) {
  const key = aesKey(encodingAesKey);
  const random = crypto.randomBytes(16);
  const messageBuffer = Buffer.from(message, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(messageBuffer.length);

  const plain = pkcs7Pad(Buffer.concat([random, length, messageBuffer, Buffer.from(ownerKey, 'utf8')]));
  const cipher = crypto.createCipheriv('aes-256-cbc', key, key.subarray(0, 16));
  cipher.setAutoPadding(false);
  const encrypt = Buffer.concat([cipher.update(plain), cipher.final()]).toString('base64');

  return {
    msg_signature: sign(token, timestamp, nonce, encrypt),
    timeStamp: timestamp,
    nonce,
    encrypt,
  };
}
