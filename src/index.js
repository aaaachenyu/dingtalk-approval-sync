import cron from 'node-cron';
import { config, validateConfig } from './config.js';
import { DingTalkClient } from './dingtalk-client.js';
import { GoogleSheetsClient } from './google-sheets-client.js';
import { StateStore } from './state-store.js';
import { SyncService } from './sync-service.js';
import { createServer } from './server.js';
import { logger } from './logger.js';

validateConfig({ forServer: true });

const dingtalkClient = new DingTalkClient();
const sheetsClient = new GoogleSheetsClient();
const stateStore = new StateStore();
await stateStore.load();

const syncService = new SyncService({ dingtalkClient, sheetsClient, stateStore });
const app = createServer({ syncService });

app.listen(config.port, config.host, () => {
  logger.info(`Server listening on ${config.host}:${config.port}`);
});

if (config.poll.enabled) {
  cron.schedule(config.poll.cron, async () => {
    try {
      await syncService.pollCompletedApprovals({ lookbackMinutes: config.poll.lookbackMinutes });
    } catch (error) {
      logger.error('Scheduled poll failed', { message: error.response?.data?.message || error.message });
    }
  });
  logger.info('Scheduled DingTalk polling fallback', { cron: config.poll.cron });
}
