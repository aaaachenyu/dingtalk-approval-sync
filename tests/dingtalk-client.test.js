import assert from 'node:assert/strict';
import { buildInstanceIdQueryPayload } from '../src/dingtalk-client.js';

const startTime = new Date('2026-05-01T00:00:00.000Z');
const endTime = new Date('2026-05-16T00:00:00.000Z');

const firstPage = buildInstanceIdQueryPayload({ processCode: 'PROC-A', startTime, endTime });
assert.equal(firstPage.processCode, 'PROC-A');
assert.equal(firstPage.nextToken, 0);
assert.deepEqual(firstPage.statuses, ['COMPLETED']);

const nextPage = buildInstanceIdQueryPayload({ processCode: 'PROC-B', startTime, endTime, nextToken: 'abc' });
assert.equal(nextPage.processCode, 'PROC-B');
assert.equal(nextPage.nextToken, 'abc');

console.log('dingtalk-client.test.js passed');
