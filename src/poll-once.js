import { config, validateConfig } from './config.js';
import { DingTalkClient } from './dingtalk-client.js';
import { GoogleSheetsClient } from './google-sheets-client.js';
import { StateStore } from './state-store.js';
import { SyncService } from './sync-service.js';
import { logger } from './logger.js';

validateConfig({ forServer: false });

const syncService = new SyncService({
  dingtalkClient: new DingTalkClient(),
  sheetsClient: new GoogleSheetsClient(),
  stateStore: new StateStore(),
});

const results = await syncService.pollCompletedApprovals({
  lookbackMinutes: config.poll.lookbackMinutes,
});

logger.info('One-time poll completed', {
  total: results.length,
  synced: results.filter((result) => result.synced).length,
});
