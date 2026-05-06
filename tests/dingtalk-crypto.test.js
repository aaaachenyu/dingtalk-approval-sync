import assert from 'node:assert/strict';
import { decryptCallback, encryptCallbackResponse, sign } from '../src/dingtalk-crypto.js';

const token = 'test-token';
const encodingAesKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const ownerKey = 'ding-test-owner';
const timestamp = '1777891200';
const nonce = 'nonce-001';

const encryptedResponse = encryptCallbackResponse({
  token,
  encodingAesKey,
  ownerKey,
  timestamp,
  nonce,
  message: JSON.stringify({ EventType: 'check_url' }),
});

assert.equal(
  encryptedResponse.msg_signature,
  sign(token, timestamp, nonce, encryptedResponse.encrypt),
);

const decrypted = decryptCallback({
  token,
  encodingAesKey,
  ownerKey,
  signature: encryptedResponse.msg_signature,
  timestamp,
  nonce,
  encrypt: encryptedResponse.encrypt,
});

assert.equal(decrypted.EventType, 'check_url');
assert.throws(() => {
  decryptCallback({
    token,
    encodingAesKey,
    ownerKey,
    signature: 'wrong-signature',
    timestamp,
    nonce,
    encrypt: encryptedResponse.encrypt,
  });
}, /Invalid DingTalk callback signature/);

console.log('dingtalk-crypto.test.js passed');
