import { config } from './config.js';
import { logger } from './logger.js';

const headers = [
  'approval_instance_id',
  '\u5ba1\u6279\u7f16\u53f7',
  '\u5ba1\u6279\u6807\u9898',
  '\u7533\u8bf7\u4eba',
  '\u90e8\u95e8',
  '\u5ba1\u6279\u5b8c\u6210\u65f6\u95f4',
  '\u4ed8\u6b3e\u91d1\u989d',
  '\u4ed8\u6b3e\u5bf9\u8c61',
  '\u4ed8\u6b3e\u7528\u9014',
  '\u5907\u6ce8',
  '\u9644\u4ef6\u94fe\u63a5',
];

export { headers };

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function compact(value) {
  return normalize(value).replace(/[\s_\-:：()[\]（）]/g, '');
}

function maybeParseJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function flattenComponentValues(values = []) {
  const output = [];

  for (const item of values || []) {
    output.push(item);
    const parsedValue = maybeParseJson(item.value);
    const parsedExtValue = maybeParseJson(item.extValue);

    for (const candidate of [parsedValue, parsedExtValue]) {
      if (Array.isArray(candidate)) {
        for (const child of candidate) {
          if (Array.isArray(child?.rowValue)) output.push(...child.rowValue);
          if (Array.isArray(child?.details)) output.push(...child.details);
          if (Array.isArray(child)) output.push(...child);
        }
      }
    }
  }

  return output;
}

function componentName(component) {
  return component.name || component.label || component.title || component.componentName || component.bizAlias || '';
}

function componentNames(component) {
  return [
    componentName(component),
    component.bizAlias,
    component.id,
    component.componentId,
    component.label,
    component.title,
  ].filter(Boolean);
}

function matchComponent(components, names) {
  const wanted = new Set(names.map(normalize));
  const compactWanted = new Set(names.map(compact));
  return components.find((component) => {
    const candidates = componentNames(component).map(normalize);
    const compactCandidates = componentNames(component).map(compact);
    return (
      candidates.some((candidate) => wanted.has(candidate)) ||
      compactCandidates.some((candidate) => compactWanted.has(candidate)) ||
      compactCandidates.some((candidate) => [...compactWanted].some((name) => name && candidate.includes(name)))
    );
  });
}

function extractValue(component) {
  if (!component) return '';
  const candidates = [component.value, component.extValue, component.text, component.name];

  for (const raw of candidates) {
    if (raw == null || raw === '') continue;
    const parsed = maybeParseJson(raw);
    const value = stringifyValue(parsed);
    if (value) return value;
  }

  return '';
}

function stringifyValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(stringifyValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return (
      value.value ||
      value.text ||
      value.name ||
      value.title ||
      value.url ||
      value.downloadUrl ||
      value.fileId ||
      JSON.stringify(value)
    );
  }
  return '';
}

function formatTime(value) {
  if (!value) return '';
  const date = typeof value === 'number' || /^\d+$/.test(String(value)) ? new Date(Number(value)) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function collectAttachmentRefs(components, attachmentComponent) {
  const refs = new Set();
  const sources = attachmentComponent ? [attachmentComponent] : components;

  for (const source of sources) {
    for (const raw of [source.value, source.extValue]) {
      const parsed = maybeParseJson(raw);
      collectAttachmentValue(parsed, refs);
    }
  }

  return [...refs];
}

function collectAttachmentValue(value, refs) {
  if (!value) return;
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) refs.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAttachmentValue(item, refs));
    return;
  }
  if (typeof value === 'object') {
    const url = value.url || value.downloadUrl || value.previewUrl;
    const fileId = value.fileId || value.file_id || value.mediaId || value.media_id;
    if (url) refs.add(url);
    if (fileId) refs.add(`dingtalk-file:${fileId}`);
    for (const nested of Object.values(value)) collectAttachmentValue(nested, refs);
  }
}

function isCompleted(detail) {
  const status = normalize(detail.status || detail.processInstanceStatus);
  const result = normalize(detail.result || detail.approveResult);
  return ['completed', 'finish', 'finished', 'agree', 'agreed'].includes(status) || ['agree', 'agreed'].includes(result);
}

function logMissingAmount({ approvalInstanceId, components }) {
  logger.warn('Payment amount field was not matched in DingTalk approval form', {
    approvalInstanceId,
    configuredNames: config.fields.paymentAmount,
    receivedFields: components.map((component) => ({
      name: componentName(component),
      bizAlias: component.bizAlias,
      id: component.id || component.componentId,
    })),
  });
}

export async function parseApprovalInstance(rawDetail, { dingtalkClient, processInstanceId } = {}) {
  const detail = rawDetail.result || rawDetail;
  const approvalInstanceId = detail.processInstanceId || detail.instanceId || detail.id || processInstanceId;
  const components = flattenComponentValues(detail.formComponentValues || detail.formComponentValueVOS || []);

  const amountComponent = matchComponent(components, config.fields.paymentAmount);
  const payeeComponent = matchComponent(components, config.fields.payee);
  const purposeComponent = matchComponent(components, config.fields.purpose);
  const remarkComponent = matchComponent(components, config.fields.remark);
  const attachmentComponent = matchComponent(components, config.fields.attachments);

  const attachmentRefs = collectAttachmentRefs(components, attachmentComponent);
  const attachmentLinks = [];
  for (const ref of attachmentRefs) {
    if (!ref.startsWith('dingtalk-file:')) {
      attachmentLinks.push(ref);
      continue;
    }
    if (!dingtalkClient || !approvalInstanceId) continue;
    const url = await dingtalkClient.createAttachmentDownloadUrl({
      processInstanceId: approvalInstanceId,
      fileId: ref.replace('dingtalk-file:', ''),
    });
    if (url) attachmentLinks.push(url);
  }

  const finishedTime =
    detail.finishTime ||
    detail.completedTime ||
    detail.completeTime ||
    detail.endTime ||
    detail.gmtModified ||
    detail.createTime;

  if (!amountComponent) {
    logMissingAmount({ approvalInstanceId, components });
  }

  return {
    approvalInstanceId,
    approvalNumber: detail.businessId || detail.serialNumber || detail.approvalNumber || '',
    title: detail.title || detail.processInstanceTitle || detail.processName || '',
    applicant: detail.originatorUserName || detail.originatorUserId || detail.startUserId || '',
    department: detail.originatorDeptName || detail.originatorDeptId || detail.department || '',
    finishedTime: formatTime(finishedTime),
    paymentAmount: extractValue(amountComponent),
    payee: extractValue(payeeComponent),
    purpose: extractValue(purposeComponent),
    remark: extractValue(remarkComponent),
    attachmentLinks: attachmentLinks.join('\n'),
    status: detail.status || detail.processInstanceStatus || '',
    result: detail.result || detail.approveResult || '',
    completed: isCompleted(detail),
  };
}

export function approvalToRow(approval) {
  return [
    approval.approvalInstanceId,
    approval.approvalNumber,
    approval.title,
    approval.applicant,
    approval.department,
    approval.finishedTime,
    approval.paymentAmount,
    approval.payee,
    approval.purpose,
    approval.remark,
    approval.attachmentLinks,
  ];
}
