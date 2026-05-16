import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

const API_BASE = 'https://api.dingtalk.com';

export function buildInstanceIdQueryPayload({ startTime, endTime, nextToken = '' }) {
  const data = {
    processCode: config.dingtalk.processCode,
    startTime: startTime.getTime(),
    endTime: endTime.getTime(),
    maxResults: 20,
    nextToken,
  };

  if (config.dingtalk.pollStatuses.length) {
    data.status = config.dingtalk.pollStatuses[0];
  }

  return data;
}

export class DingTalkClient {
  constructor() {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return this.accessToken;
    }

    const response = await axios.post(`${API_BASE}/v1.0/oauth2/accessToken`, {
      appKey: config.dingtalk.appKey,
      appSecret: config.dingtalk.appSecret,
    });

    this.accessToken = response.data.accessToken;
    this.expiresAt = Date.now() + Number(response.data.expireIn || 7200) * 1000;
    return this.accessToken;
  }

  async request(method, path, { params, data } = {}) {
    const token = await this.getAccessToken();
    try {
      const response = await axios.request({
        method,
        url: `${API_BASE}${path}`,
        params,
        data,
        headers: {
          'x-acs-dingtalk-access-token': token,
        },
        timeout: 15_000,
      });
      return response.data;
    } catch (error) {
      const responseData = error.response?.data;
      const safeError = new Error(responseData?.message || error.message);
      safeError.code = responseData?.code;
      safeError.status = error.response?.status;
      safeError.response = { data: responseData };
      throw safeError;
    }
  }

  async queryCompletedInstanceIds({ startTime, endTime, nextToken } = {}) {
    const data = buildInstanceIdQueryPayload({ startTime, endTime, nextToken: nextToken || '' });
    return this.request('POST', '/v1.0/workflow/processes/instanceIds/query', { data });
  }

  async listCompletedInstanceIds({ lookbackMinutes }) {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - lookbackMinutes * 60_000);
    const ids = [];
    let nextToken;

    do {
      const page = await this.queryCompletedInstanceIds({ startTime, endTime, nextToken });
      const pageIds = page.result?.list || page.result?.processInstanceIds || page.list || [];
      ids.push(...pageIds);
      nextToken = page.result?.nextToken || page.nextToken;
    } while (nextToken);

    logger.info('DingTalk poll found instance ids', { count: ids.length });
    return [...new Set(ids)];
  }

  async getInstanceDetail(processInstanceId) {
    return this.request('GET', '/v1.0/workflow/processInstances', {
      params: { processInstanceId },
    });
  }

  async createAttachmentDownloadUrl({ processInstanceId, fileId }) {
    try {
      const result = await this.request('POST', '/v1.0/workflow/processInstances/attachments/downloadUrls', {
        data: { processInstanceId, fileId },
      });
      return result.downloadUrl || result.result?.downloadUrl || result.result;
    } catch (error) {
      logger.warn('Could not create DingTalk attachment download url', {
        processInstanceId,
        fileId,
        message: error.response?.data?.message || error.message,
      });
      return null;
    }
  }
}
