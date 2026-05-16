import { approvalToRow, parseApprovalInstance } from './approval-parser.js';
import { logger } from './logger.js';
import { needsPurposeTranslation, shouldUpdatePurposeTranslation } from './purpose-translator.js';

const COLS = {
  approvalInstanceId: 0,
  approvalNumber: 1,
  paymentAmount: 6,
  payee: 7,
  purpose: 8,
  remark: 9,
  attachments: 10,
};

function normalize(value) {
  return String(value || '').trim();
}

function key(value) {
  return normalize(value).toLowerCase();
}

function rowNeedsBackfill(row) {
  return (
    !normalize(row[COLS.approvalInstanceId]) ||
    !normalize(row[COLS.paymentAmount]) ||
    !normalize(row[COLS.payee]) ||
    !normalize(row[COLS.purpose]) ||
    needsPurposeTranslation(row[COLS.purpose]) ||
    !normalize(row[COLS.remark]) ||
    !normalize(row[COLS.attachments])
  );
}

function fillMissing(existingRow, parsedRow) {
  const row = [...existingRow];
  let changed = false;

  for (const index of Object.values(COLS)) {
    if (!normalize(row[index]) && normalize(parsedRow[index])) {
      row[index] = parsedRow[index];
      changed = true;
    }
  }

  if (shouldUpdatePurposeTranslation(row[COLS.purpose], parsedRow[COLS.purpose])) {
    row[COLS.purpose] = parsedRow[COLS.purpose];
    changed = true;
  }

  return { row, changed };
}

export class BackfillService {
  constructor({ dingtalkClient, sheetsClient }) {
    this.dingtalkClient = dingtalkClient;
    this.sheetsClient = sheetsClient;
  }

  async loadApprovalsByKey({ lookbackMinutes }) {
    const ids = await this.dingtalkClient.listCompletedInstanceIds({ lookbackMinutes });
    const byInstanceId = new Map();
    const byApprovalNumber = new Map();

    for (const processInstanceId of ids) {
      try {
        const detail = await this.dingtalkClient.getInstanceDetail(processInstanceId);
        const approval = await parseApprovalInstance(detail, {
          dingtalkClient: this.dingtalkClient,
          processInstanceId,
        });
        const parsedRow = approvalToRow(approval);

        if (approval.approvalInstanceId) byInstanceId.set(key(approval.approvalInstanceId), parsedRow);
        if (approval.approvalNumber) byApprovalNumber.set(key(approval.approvalNumber), parsedRow);
      } catch (error) {
        logger.error('Failed to load DingTalk approval for backfill', {
          processInstanceId,
          message: error.response?.data?.message || error.message,
        });
      }
    }

    return { byInstanceId, byApprovalNumber };
  }

  async backfill({ lookbackMinutes, dryRun = false } = {}) {
    const rows = await this.sheetsClient.getRows();
    const dataRows = rows.slice(1);
    const candidates = dataRows
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => rowNeedsBackfill(row));

    logger.info('Loaded Google Sheet rows for backfill', {
      totalRows: dataRows.length,
      candidateRows: candidates.length,
      dryRun,
    });

    if (!candidates.length) return { updated: 0, candidates: 0, dryRun };

    const approvals = await this.loadApprovalsByKey({ lookbackMinutes });
    const updates = [];

    for (const { row, rowNumber } of candidates) {
      const match =
        approvals.byInstanceId.get(key(row[COLS.approvalInstanceId])) ||
        approvals.byApprovalNumber.get(key(row[COLS.approvalNumber]));

      if (!match) continue;

      const result = fillMissing(row, match);
      if (result.changed) {
        updates.push({ rowNumber, row: result.row });
      }
    }

    logger.info('Prepared Google Sheet backfill updates', {
      updateRows: updates.length,
      dryRun,
    });

    if (!dryRun && updates.length) {
      await this.sheetsClient.updateRows(updates);
      logger.info('Applied Google Sheet backfill updates', { updateRows: updates.length });
    }

    return { updated: updates.length, candidates: candidates.length, dryRun };
  }
}
