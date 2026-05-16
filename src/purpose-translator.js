import { config } from './config.js';

const dictionary = [
  {
    source: 'NOMINA COLABORADORES INTERNOS',
    target: '\u5185\u90e8\u5458\u5de5\u5de5\u8d44',
  },
  {
    source: 'PAGO DE NOMINA',
    target: '\u5de5\u8d44\u4ed8\u6b3e',
  },
  {
    source: 'NOMINA',
    target: '\u5de5\u8d44',
  },
  {
    source: 'FACTURA PENDIENTE',
    target: '\u5f85\u5f00\u53d1\u7968',
  },
];

function normalize(value) {
  return String(value || '').trim();
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''));
}

function hasAppendedChinese(value) {
  const text = String(value || '');
  return text.includes(' / ') && containsChinese(text.split(' / ').slice(1).join(' / '));
}

export function translatePurposeToChinese(purpose) {
  if (!config.translation.purposeToChinese) return '';

  const text = normalize(purpose);
  if (!text || containsChinese(text)) return '';

  const upperText = text.toUpperCase();
  const match = dictionary.find((item) => upperText.includes(item.source));
  if (!match) return '';

  return text.replace(new RegExp(match.source, 'i'), match.target);
}

export function appendPurposeTranslation(purpose) {
  const text = normalize(purpose);
  if (!text || hasAppendedChinese(text)) return text;

  const translation = translatePurposeToChinese(text);
  if (!translation || translation === text) return text;

  return `${text} / ${translation}`;
}

export function shouldUpdatePurposeTranslation(currentPurpose, parsedPurpose) {
  const current = normalize(currentPurpose);
  const parsed = normalize(parsedPurpose);
  if (!current || !parsed) return false;
  if (hasAppendedChinese(current) || containsChinese(current)) return false;
  return hasAppendedChinese(parsed) && parsed.startsWith(current);
}

export function needsPurposeTranslation(purpose) {
  const text = normalize(purpose);
  if (!text || hasAppendedChinese(text) || containsChinese(text)) return false;
  return Boolean(translatePurposeToChinese(text));
}
