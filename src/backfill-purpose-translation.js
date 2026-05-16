import { validateConfig } from './config.js';
import { GoogleSheetsClient } from './google-sheets-client.js';
import { appendPurposeTranslation } from './purpose-translator.js';
import { logger } from './logger.js';

const PURPOSE_COLUMN = 'I';
const PURPOSE_INDEX = 8;

validateConfig({ forServer: false });

const dryRun = ['1', 'true', 'yes'].includes(String(process.env.BACKFILL_DRY_RUN || '').toLowerCase());
const sheetsClient = new GoogleSheetsClient();

try {
  const rows = await sheetsClient.getRows();
  const updates = [];
  const samples = [];

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const currentPurpose = row[PURPOSE_INDEX] || '';
    const translatedPurpose = appendPurposeTranslation(currentPurpose);

    if (samples.length < 5) {
      samples.push({
        rowNumber,
        currentPurpose,
        translatedPurpose,
        changed: translatedPurpose !== currentPurpose,
      });
    }

    if (translatedPurpose && translatedPurpose !== currentPurpose) {
      updates.push({
        range: `${sheetsClient.sheetName()}!${PURPOSE_COLUMN}${rowNumber}`,
        value: translatedPurpose,
      });
    }
  });

  logger.info('Prepared purpose translation backfill updates', {
    updateCells: updates.length,
    dryRun,
    samples,
  });

  if (!dryRun && updates.length) {
    await sheetsClient.updateCells(updates);
    logger.info('Applied purpose translation backfill updates', {
      updateCells: updates.length,
    });
  }
} catch (error) {
  logger.error('Purpose translation backfill failed', {
    message: error.response?.data?.message || error.message,
    code: error.code || error.response?.data?.code,
    status: error.status || error.response?.status,
  });
  process.exitCode = 1;
}
