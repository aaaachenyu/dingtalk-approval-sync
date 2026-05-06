import express from 'express';
import { config } from './config.js';
import { decryptCallback, encryptCallbackResponse } from './dingtalk-crypto.js';
import { logger } from './logger.js';

function isFinishEvent(event) {
  const eventType = event.EventType || event.eventType || event.event_type;
  const type = event.type || event.eventTypeValue || event.action;
  return eventType === 'bpms_instance_change' && ['finish', 'finished', 'complete', 'completed'].includes(String(type || '').toLowerCase());
}

function extractProcessInstanceId(event) {
  return (
    event.processInstanceId ||
    event.process_instance_id ||
    event.processInstanceID ||
    event.instanceId ||
    event.instance_id
  );
}

function queryStringValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function createServer({ syncService }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.post('/dingtalk/events', (req, res) => {
    const msgSignature = queryStringValue(req.query.msg_signature);
    const legacySignature = queryStringValue(req.query.signature);
    const timestamp = queryStringValue(req.query.timestamp);
    const nonce = queryStringValue(req.query.nonce);
    const encrypted = req.body?.encrypt;
    let event;
    let encryptedResponse;

    logger.info('Received DingTalk event callback', {
      hasMsgSignature: Boolean(msgSignature),
      hasLegacySignature: Boolean(legacySignature),
      hasTimestamp: Boolean(timestamp),
      hasNonce: Boolean(nonce),
      hasEncrypt: Boolean(encrypted),
    });

    try {
      if (encrypted) {
        event = decryptCallback({
          token: config.dingtalk.callbackToken,
          encodingAesKey: config.dingtalk.callbackAesKey,
          ownerKey: config.dingtalk.callbackOwnerKey,
          signature: msgSignature,
          timestamp,
          nonce,
          encrypt: encrypted,
        });

        encryptedResponse = encryptCallbackResponse({
          token: config.dingtalk.callbackToken,
          encodingAesKey: config.dingtalk.callbackAesKey,
          ownerKey: config.dingtalk.callbackOwnerKey,
          timestamp,
          nonce,
        });
      } else if (config.dingtalk.allowPlaintextCallback) {
        event = req.body;
      } else {
        res.status(400).json({ error: 'Encrypted DingTalk callback body is required' });
        return;
      }
    } catch (error) {
      logger.warn('Invalid DingTalk event callback', { message: error.message });
      res.status(400).json({ error: error.message });
      return;
    }

    if (encryptedResponse) {
      res.json(encryptedResponse);
    } else {
      res.json({ success: true });
    }

    if (!isFinishEvent(event)) {
      logger.debug('Ignored DingTalk event', { event });
      return;
    }

    const processInstanceId = extractProcessInstanceId(event);
    setImmediate(async () => {
      try {
        await syncService.syncApprovalInstance(processInstanceId, { source: 'event' });
      } catch (error) {
        logger.error('Failed to sync approval from DingTalk event', {
          processInstanceId,
          message: error.response?.data?.message || error.message,
        });
      }
    });
  });

  return app;
}
