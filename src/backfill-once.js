import { config, validateConfig } from './config.js';
import { BackfillService } from './backfill-service.js';
import { DingTalkClient } from './dingtalk-client.js';
import { GoogleSheetsClient } from './google-sheets-client.js';
import { logger } from './logger.js';

validateConfig({ forServer: false });

const lookbackMinutes = Number(process.env.BACKFILL_LOOKBACK_MINUTES || config.poll.lookbackMinutes);
const dryRun = ['1', 'true', 'yes'].includes(String(process.env.BACKFILL_DRY_RUN || '').toLowerCase());

const backfillService = new BackfillService({
  dingtalkClient: new DingTalkClient(),
  sheetsClient: new GoogleSheetsClient(),
});

const result = await backfillService.backfill({ lookbackMinutes, dryRun });
logger.info('Backfill completed', result);
