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

export function createServer({ syncService }) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.post('/dingtalk/events', (req, res) => {
    const { msg_signature: signature, timestamp, nonce } = req.query;
    const encrypted = req.body?.encrypt;
    let event;
    let encryptedResponse;

    try {
      if (encrypted) {
        event = decryptCallback({
          token: config.dingtalk.callbackToken,
          encodingAesKey: config.dingtalk.callbackAesKey,
          ownerKey: config.dingtalk.callbackOwnerKey,
          signature,
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
