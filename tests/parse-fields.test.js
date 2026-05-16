import assert from 'node:assert/strict';
import { approvalToRow, parseApprovalInstance } from '../src/approval-parser.js';

const detail = {
  result: {
    processInstanceId: 'pi-001',
    businessId: 'PAY-20260504-001',
    title: '\u4ed8\u6b3e\u5ba1\u6279',
    originatorUserId: 'user-001',
    originatorDeptName: '\u8d22\u52a1\u90e8',
    finishTime: 1777891200000,
    status: 'COMPLETED',
    result: 'agree',
    formComponentValues: [
      { name: '\u4ed8\u6b3e\u91d1\u989d', value: '1234.56' },
      { name: '\u4ed8\u6b3e\u5bf9\u8c61', value: 'Acme Ltd.' },
      { name: '\u4ed8\u6b3e\u7528\u9014', value: '\u5408\u540c\u5c3e\u6b3e' },
      { name: '\u5907\u6ce8', value: '\u5df2\u6838\u5bf9\u53d1\u7968' },
      {
        name: '\u9644\u4ef6',
        value: JSON.stringify([{ name: 'invoice.pdf', url: 'https://example.com/invoice.pdf' }]),
      },
    ],
  },
};

const approval = await parseApprovalInstance(detail);
const row = approvalToRow(approval);

assert.equal(row[0], 'pi-001');
assert.equal(row[1], 'PAY-20260504-001');
assert.equal(row[6], '1234.56');
assert.equal(row[7], 'Acme Ltd.');
assert.equal(row[8], '\u5408\u540c\u5c3e\u6b3e');
assert.equal(row[9], '\u5df2\u6838\u5bf9\u53d1\u7968');
assert.equal(row[10], 'https://example.com/invoice.pdf');

const spacedDetail = {
  result: {
    processInstanceId: 'pi-002',
    status: 'COMPLETED',
    result: 'agree',
    formComponentValues: [
      { name: '\u4ed8\u6b3e\u91d1\u989d\uff08MXN\uff09', value: '888.00' },
    ],
  },
};

const spacedApproval = await parseApprovalInstance(spacedDetail);
assert.equal(approvalToRow(spacedApproval)[6], '888.00');

const spanishDetail = {
  result: {
    processInstanceId: 'pi-003',
    status: 'COMPLETED',
    result: 'agree',
    formComponentValues: [
      { name: 'Motivo de pago', value: 'NOMINA COLABORADORES INTERNOS 01Q05' },
      { name: 'Monto Total', value: '33685.00' },
      { name: 'Proveedor', value: 'NEXOLU SA DE CV' },
    ],
  },
};

const spanishRow = approvalToRow(await parseApprovalInstance(spanishDetail));
assert.equal(spanishRow[6], '33685.00');
assert.equal(spanishRow[7], 'NEXOLU SA DE CV');
assert.equal(spanishRow[8], 'NOMINA COLABORADORES INTERNOS 01Q05');

console.log('parse-fields.test.js passed');
