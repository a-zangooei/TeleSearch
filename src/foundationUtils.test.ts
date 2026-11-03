import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePytestOutput, parseSqlSchemaTables } from './foundationUtils';

test('parseSqlSchemaTables extracts composite and single primary keys accurately', () => {
  const sampleSql = `
    CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY,
        title TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        text TEXT,
        PRIMARY KEY (chat_id, message_id),
        FOREIGN KEY (chat_id) REFERENCES chats (id)
    );
  `;

  const parsed = parseSqlSchemaTables(sampleSql);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'chats');
  assert.deepEqual(parsed[0].columns, ['id', 'title', 'updated_at']);
  assert.equal(parsed[0].primaryKey, 'id (PRIMARY KEY)');

  assert.equal(parsed[1].name, 'messages');
  assert.deepEqual(parsed[1].columns, ['chat_id', 'message_id', 'text']);
  assert.equal(parsed[1].primaryKey, 'PRIMARY KEY (chat_id, message_id)');
});

test('parsePytestOutput extracts passed and failed counts', () => {
  const summary = parsePytestOutput('====== 18 passed in 0.24s ======', 0);
  assert.equal(summary.passed, 18);
  assert.equal(summary.failed, 0);
  assert.equal(summary.rawExitZero, true);

  const failingSummary = parsePytestOutput('=== 1 failed, 17 passed in 0.31s ===', 1);
  assert.equal(failingSummary.passed, 17);
  assert.equal(failingSummary.failed, 1);
  assert.equal(failingSummary.rawExitZero, false);
});
