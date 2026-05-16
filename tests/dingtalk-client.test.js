import assert from 'node:assert/strict';
import { buildInstanceIdQueryPayload } from '../src/dingtalk-client.js';

const startTime = new Date('2026-05-01T00:00:00.000Z');
const endTime = new Date('2026-05-16T00:00:00.000Z');

const firstPage = buildInstanceIdQueryPayload({ startTime, endTime });
assert.equal(firstPage.nextToken, '');

const nextPage = buildInstanceIdQueryPayload({ startTime, endTime, nextToken: 'abc' });
assert.equal(nextPage.nextToken, 'abc');

console.log('dingtalk-client.test.js passed');
