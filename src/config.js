import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(filePath = path.resolve('.env')) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadDotEnv();

const parseList = (value, fallback = []) => {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const bool = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

export const config = {
  port: Number(process.env.PORT || 3000),
  logLevel: process.env.LOG_LEVEL || 'info',

  dingtalk: {
    appKey: process.env.DINGTALK_APP_KEY,
    appSecret: process.env.DINGTALK_APP_SECRET,
    processCode: process.env.DINGTALK_PROCESS_CODE,
    callbackToken: process.env.DINGTALK_CALLBACK_TOKEN,
    callbackAesKey: process.env.DINGTALK_CALLBACK_AES_KEY,
    callbackOwnerKey:
      process.env.DINGTALK_CALLBACK_OWNER_KEY ||
      process.env.DINGTALK_APP_KEY ||
      process.env.DINGTALK_CORP_ID,
    allowPlaintextCallback: bool(process.env.ALLOW_PLAINTEXT_CALLBACK, false),
    pollStatuses: parseList(process.env.DINGTALK_POLL_STATUSES, ['COMPLETED']),
  },

  poll: {
    enabled: bool(process.env.POLL_ENABLED, true),
    cron: process.env.POLL_CRON || '*/10 * * * *',
    lookbackMinutes: Number(process.env.POLL_LOOKBACK_MINUTES || 1440),
  },

  google: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    range: process.env.GOOGLE_SHEET_RANGE || 'Approvals!A:K',
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },

  fields: {
    paymentAmount: parseList(process.env.FIELD_PAYMENT_AMOUNT, [
      '\u4ed8\u6b3e\u91d1\u989d',
      '\u91d1\u989d',
      '\u652f\u4ed8\u91d1\u989d',
    ]),
    payee: parseList(process.env.FIELD_PAYEE, [
      '\u4ed8\u6b3e\u5bf9\u8c61',
      '\u6536\u6b3e\u65b9',
      '\u4f9b\u5e94\u5546',
      '\u5ba2\u6237',
    ]),
    purpose: parseList(process.env.FIELD_PURPOSE, [
      '\u4ed8\u6b3e\u7528\u9014',
      '\u7528\u9014',
      '\u4ed8\u6b3e\u4e8b\u7531',
    ]),
    remark: parseList(process.env.FIELD_REMARK, ['\u5907\u6ce8', '\u8bf4\u660e']),
    attachments: parseList(process.env.FIELD_ATTACHMENTS, [
      '\u9644\u4ef6',
      '\u4ed8\u6b3e\u9644\u4ef6',
      '\u4e0a\u4f20\u9644\u4ef6',
    ]),
  },
};

export function validateConfig({ forServer = true } = {}) {
  const missing = [];
  const requireValue = (value, name) => {
    if (!value) missing.push(name);
  };

  requireValue(config.dingtalk.appKey, 'DINGTALK_APP_KEY');
  requireValue(config.dingtalk.appSecret, 'DINGTALK_APP_SECRET');
  requireValue(config.dingtalk.processCode, 'DINGTALK_PROCESS_CODE');
  requireValue(config.google.sheetId, 'GOOGLE_SHEET_ID');

  if (!config.google.serviceAccountJson && !config.google.credentialsPath) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
  }

  if (forServer) {
    requireValue(config.dingtalk.callbackToken, 'DINGTALK_CALLBACK_TOKEN');
    requireValue(config.dingtalk.callbackAesKey, 'DINGTALK_CALLBACK_AES_KEY');
    requireValue(config.dingtalk.callbackOwnerKey, 'DINGTALK_CALLBACK_OWNER_KEY');
  }

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
