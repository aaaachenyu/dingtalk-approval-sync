import assert from 'node:assert/strict';
import {
  appendPurposeTranslation,
  stripPurposeTranslation,
} from '../src/purpose-translator.js';

assert.equal(
  appendPurposeTranslation('NOMINA COLABORADORES INTERNOS 01Q05\n\nFACTURA PENDIENTE'),
  'NOMINA COLABORADORES INTERNOS 01Q05\n\nFACTURA PENDIENTE\n\n\u4e2d\u6587\uff1a\u5185\u90e8\u5458\u5de5\u5de5\u8d44\uff0c\u5f85\u5f00\u53d1\u7968',
);

assert.equal(
  stripPurposeTranslation('NOMINA CDMX 01Q05 / \u5de5\u8d44 CDMX 01Q05\n\nFACTURA PENDIENTE'),
  'NOMINA CDMX 01Q05\n\nFACTURA PENDIENTE',
);

assert.equal(
  appendPurposeTranslation('NOMINA CDMX 01Q05 / \u5de5\u8d44 CDMX 01Q05'),
  'NOMINA CDMX 01Q05\n\n\u4e2d\u6587\uff1a\u5de5\u8d44\u4ed8\u6b3e',
);

assert.equal(
  appendPurposeTranslation('NOMINA AGUILA 01Q04\n\n\nFACTURA PENDIENTE / \u5de5\u8d44 AGUILA 01Q04\n\n\nFACTURA PENDIENTE'),
  'NOMINA AGUILA 01Q04\n\nFACTURA PENDIENTE\n\n\u4e2d\u6587\uff1a\u5de5\u8d44\u4ed8\u6b3e\uff0c\u5f85\u5f00\u53d1\u7968',
);

console.log('purpose-translator.test.js passed');
