import { approvalToRow, parseApprovalInstance } from './approval-parser.js';
import { logger } from './logger.js';

export class SyncService {
  constructor({ dingtalkClient, sheetsClient, stateStore }) {
    this.dingtalkClient = dingtalkClient;
    this.sheetsClient = sheetsClient;
    this.stateStore = stateStore;
  }

  async syncApprovalInstance(processInstanceId, { source = 'unknown' } = {}) {
    if (!processInstanceId) {
      logger.warn('Missing processInstanceId in sync request', { source });
      return { synced: false, reason: 'missing_id' };
    }

    if (await this.stateStore.hasApprovalId(processInstanceId)) {
      logger.info('Skipped duplicate approval from local state', { processInstanceId, source });
      return { synced: false, reason: 'duplicate_local' };
    }

    if (await this.sheetsClient.hasApprovalId(processInstanceId)) {
      await this.stateStore.markApprovalId(processInstanceId);
      logger.info('Skipped duplicate approval from Google Sheet', { processInstanceId, source });
      return { synced: false, reason: 'duplicate_sheet' };
    }

    const detail = await this.dingtalkClient.getInstanceDetail(processInstanceId);
    const approval = await parseApprovalInstance(detail, { dingtalkClient: this.dingtalkClient });

    if (!approval.completed) {
      logger.info('Skipped non-completed approval instance', {
        processInstanceId,
        status: approval.status,
        result: approval.result,
        source,
      });
      return { synced: false, reason: 'not_completed' };
    }

    await this.sheetsClient.appendRow(approvalToRow(approval));
    await this.stateStore.markApprovalId(processInstanceId);

    logger.info('Synced approval instance to Google Sheet', { processInstanceId, source });
    return { synced: true, approval };
  }

  async pollCompletedApprovals({ lookbackMinutes }) {
    const ids = await this.dingtalkClient.listCompletedInstanceIds({ lookbackMinutes });
    const results = [];

    for (const id of ids) {
      try {
        results.push(await this.syncApprovalInstance(id, { source: 'poll' }));
      } catch (error) {
        logger.error('Failed to sync approval instance during poll', {
          processInstanceId: id,
          message: error.response?.data?.message || error.message,
        });
        results.push({ synced: false, reason: 'error', id, error: error.message });
      }
    }

    await this.stateStore.markPollComplete();
    return results;
  }
}
