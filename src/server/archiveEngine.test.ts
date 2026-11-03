import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveEngine } from './archiveEngine';
import { CloudStatus, SearchMode, SyncPolicy } from '../core/types';

test('ArchiveEngine seeds SQLite + FTS5 and matches Persian/Arabic variants across messages', () => {
  const engine = new ArchiveEngine(':memory:');
  try {
    const stats = engine.getStats();
    assert.ok(stats.totalMessages >= 14);
    assert.equal(stats.ftsRowCount, stats.totalMessages);

    // Search Persian "فیزیولوژی کلیه" -> must match both Persian "فیزیولوژی کلیه" (msg 101) AND Arabic "فيزيولوژي كليه" (msg 102)
    const physioSearch = engine.searchMessages({
      q: 'فیزیولوژی کلیه',
      mode: SearchMode.FLEXIBLE,
    });
    const matchedIds = physioSearch.items.map((m) => m.messageId);
    assert.ok(matchedIds.includes(101), 'Matches Persian spelling');
    assert.ok(matchedIds.includes(102), 'Matches Arabic Yeh/Kaf variant');

    // Search "می‌روم" -> must match "می روم" (msg 105), "می‌روم" (msg 302), and "میروم" (msg 501)
    const verbSearch = engine.searchMessages({
      q: 'می‌روم',
      mode: SearchMode.FLEXIBLE,
    });
    const verbMsgIds = verbSearch.items.map((m) => m.messageId);
    assert.ok(verbMsgIds.includes(105), 'Matches spaced می روم');
    assert.ok(verbMsgIds.includes(302), 'Matches ZWNJ می‌روم');
    assert.ok(verbMsgIds.includes(501), 'Matches joined میروم');
  } finally {
    engine.close();
  }
});

test('ArchiveEngine preserves reply threads, personal notes, tags, and LOCAL_ONLY sync isolation', () => {
  const engine = new ArchiveEngine(':memory:');
  try {
    const detail = engine.getMessageDetail(-1001450201, 101);
    assert.ok(detail);
    assert.equal(detail.replies.length, 1);
    assert.equal(detail.replies[0].messageId, 102);

    // Saved personal message 501 is important=true in a LOCAL_ONLY chat -> cloudStatus MUST be NOT_SELECTED
    const privateMsg = engine.getMessage(77001100, 501);
    assert.ok(privateMsg);
    assert.equal(privateMsg.isImportant, true);
    assert.equal(privateMsg.cloudStatus, CloudStatus.NOT_SELECTED);

    // Add tag and personal note
    engine.addTagToMessage(-1001450201, 104, 'نفرولوژی');
    const updated = engine.savePersonalNote(-1001450201, 104, 'بررسی مکانیسم قوس هنله');
    assert.ok(updated.tags.includes('نفرولوژی'));
    assert.equal(updated.personalNote, 'بررسی مکانیسم قوس هنله');
  } finally {
    engine.close();
  }
});

test('ArchiveEngine executes resumable Checkpoint batch imports without duplicates and processes Outbox', () => {
  const engine = new ArchiveEngine(':memory:');
  try {
    const before = engine.listChats().find((c) => c.chatId === -1001450201)!;
    assert.equal(before.checkpointMsgId, 105);
    assert.equal(before.stagedRemaining, 4);

    // Import batch of 2
    const step1 = engine.runCheckpointImportBatch(-1001450201, 2);
    assert.equal(step1.importedInBatch, 2);
    assert.equal(step1.checkpointMsgId, 107);
    assert.equal(step1.chat.stagedRemaining, 2);

    // Pause and resume remaining
    const paused = engine.setImportPauseState(-1001450201, true);
    assert.equal(paused.importStatus, 'PAUSED');

    const step2 = engine.runCheckpointImportBatch(-1001450201, 5);
    assert.equal(step2.importedInBatch, 2);
    assert.equal(step2.checkpointMsgId, 109);
    assert.equal(step2.chat.stagedRemaining, 0);
    assert.equal(step2.chat.importStatus, 'COMPLETED');

    // Outbox batch processing marks pending items SYNCED
    const syncRes = engine.processOutboxBatch(50);
    assert.ok(syncRes.syncedCount > 0);
    assert.equal(engine.getStats().outboxPending, 0);

    // Import Telegram JSON without creating duplicates on second run
    const sampleJson = JSON.stringify({
      name: 'کانال آزمایشی ایمپورت',
      type: 'public_channel',
      id: 554433,
      messages: [
        { id: 1, type: 'message', date: '2026-11-01T10:00:00Z', text: 'پیام اول آزمایشی' },
        { id: 2, type: 'message', date: '2026-11-01T10:05:00Z', text: 'پیام دوم حاوی لینک https://example.org/doc' },
      ],
    });
    const imp1 = engine.importTelegramJsonExport(sampleJson, SyncPolicy.LOCAL_ONLY);
    assert.equal(imp1.importedCount, 2);
    assert.equal(imp1.skippedDuplicates, 0);

    const imp2 = engine.importTelegramJsonExport(sampleJson, SyncPolicy.LOCAL_ONLY);
    assert.equal(imp2.importedCount, 0);
    assert.equal(imp2.skippedDuplicates, 2);
  } finally {
    engine.close();
  }
});
