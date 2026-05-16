import { config } from './config.js';

const summaryRules = [
  {
    pattern: /NOMINA\s+COLABORADORES?\s+INTERNOS?/i,
    label: '\u5185\u90e8\u5458\u5de5\u5de5\u8d44',
  },
  {
    pattern: /COLABORADOR(?:ES)?\s+INTERNO(?:S)?/i,
    label: '\u5185\u90e8\u5458\u5de5\u5de5\u8d44',
  },
  {
    pattern: /PAGO\s+DE\s+NOMINA|NOMINA/i,
    label: '\u5de5\u8d44\u4ed8\u6b3e',
  },
  {
    pattern: /FACTURA\s+PENDIENTE/i,
    label: '\u5f85\u5f00\u53d1\u7968',
  },
  {
    pattern: /FINIQUITOS?|LIQUIDACIONES?/i,
    label: '\u79bb\u804c\u7ed3\u7b97/\u8865\u507f\u91d1',
  },
];

function normalize(value) {
  return String(value || '').trim();
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function pruneLabels(labels) {
  const internalPayroll = '\u5185\u90e8\u5458\u5de5\u5de5\u8d44';
  const payroll = '\u5de5\u8d44\u4ed8\u6b3e';
  if (labels.includes(internalPayroll)) {
    return labels.filter((label) => label !== payroll);
  }
  return labels;
}

export function stripPurposeTranslation(purpose) {
  const text = normalize(purpose);
  if (!text) return '';

  const withoutSummary = text.replace(/\n*\s*\u4e2d\u6587[\uFF1A:][\s\S]*$/u, '').trim();
  const lines = withoutSummary
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s*\/\s*[\u3400-\u9fff].*$/u, '').trim())
    .filter(Boolean);

  return unique(lines).join('\n\n');
}

export function summarizePurposeToChinese(purpose) {
  if (!config.translation.purposeToChinese) return '';

  const text = stripPurposeTranslation(purpose);
  if (!text) return '';

  const labels = pruneLabels(unique(
    summaryRules
      .filter((rule) => rule.pattern.test(text))
      .map((rule) => rule.label),
  ));

  return labels.join('\uff0c');
}

export function appendPurposeTranslation(purpose) {
  const original = stripPurposeTranslation(purpose);
  if (!original) return '';

  const summary = summarizePurposeToChinese(original);
  if (!summary) return original;

  return `${original}\n\n\u4e2d\u6587\uff1a${summary}`;
}

export function shouldUpdatePurposeTranslation(currentPurpose, parsedPurpose) {
  const current = normalize(currentPurpose);
  const parsed = normalize(parsedPurpose);
  if (!current || !parsed) return false;

  const rewrittenCurrent = appendPurposeTranslation(current);
  const rewrittenParsed = appendPurposeTranslation(parsed);
  return (
    rewrittenCurrent !== current ||
    (rewrittenParsed !== parsed && rewrittenParsed !== current)
  );
}

export function needsPurposeTranslation(purpose) {
  const text = normalize(purpose);
  if (!text) return false;
  if (containsChinese(text) && text.includes('\u4e2d\u6587\uff1a')) return false;
  return appendPurposeTranslation(text) !== text;
}
