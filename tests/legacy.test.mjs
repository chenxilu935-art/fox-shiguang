import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/legacy.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  plugins: [{
    name: 'obsidian-stub',
    setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub' }));
      builder.onLoad({ filter: /./, namespace: 'stub' }, () => ({ contents: 'export class Modal {}' }));
    }
  }]
});
const { parseLegacyTopics, planLegacyTopics } =
  await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

const key = (suffix) => 'xhs:' + suffix.toString(16).padStart(24, '0');
const category = (id, name) => ({ id, name, icon: 'tag', color: '#65806a' });
const note = (id, topicState = 'missing', topics = []) =>
  ({ key: key(id), title: '测试笔记', path: 'RedNote/Inbox/' + id + '.md', topicState, topics });

test('legacy preview preserves existing property, reports conflicting definitions and unmatched keys', () => {
  const source = {
    version: 1,
    revision: 3,
    categories: [
      { id: 'same', name: '阅读' }, { id: 'new', name: '生活' },
      { id: 'renamed', name: '旧名称' }, { id: 'other', name: '我的主题' }
    ],
    assignments: {
      [key(1)]: ['same', 'new'], [key(2)]: ['renamed'], [key(3)]: ['same'],
      'demo:sample': ['new'], [key(4)]: ['new'], [key(5)]: ['unknown'],
      [key(6)]: ['new'], [key(7)]: ['new'], [key(8)]: []
    }
  };
  const before = structuredClone(source);
  const old = parseLegacyTopics(JSON.stringify(source));
  const existing = [category('same', '阅读'), category('renamed', '新名称'), category('custom', '我的主题')];
  const duplicate = { ...note(6), path: 'RedNote/Bookmarks/测试副本.md' };
  const articles = [note(1), note(2), note(3), note(4, 'valid', []), note(5),
    note(6), duplicate, note(7, 'invalid'), note(8)];
  const articlesBefore = structuredClone(articles);
  const preview = planLegacyTopics(old, existing, articles.filter(article => article.key !== key(3)));

  assert.equal(preview.revision, 3);
  assert.deepEqual(preview.categories.map(row => row.status), ['existing', 'add', 'conflict', 'conflict']);
  assert.deepEqual(preview.assignments.map(row => row.status), [
    'apply', 'conflict', 'unmatched', 'unmatched', 'keep', 'conflict', 'conflict', 'conflict', 'empty'
  ]);
  assert.deepEqual(preview.assignments[0].legacyIds, ['same', 'new']);
  assert.deepEqual(preview.assignments[2].legacyIds, ['same']);
  assert.deepEqual(preview.assignments[4].articles[0].topics, []);
  assert.deepEqual(preview.assignments[6].articles.map(article => article.path),
    ['RedNote/Inbox/6.md', 'RedNote/Bookmarks/测试副本.md']);
  assert.deepEqual(source, before);
  assert.deepEqual(articles, articlesBefore);
});

test('rejects incompatible legacy revision, category IDs, and unstable association keys', () => {
  const valid = { version: 1, revision: 0, categories: [], assignments: {} };
  assert.deepEqual(parseLegacyTopics('\uFEFF' + JSON.stringify(valid)), { revision: 0, categories: [], assignments: {} });
  assert.throws(() => parseLegacyTopics(JSON.stringify({ ...valid, revision: -1 })), /格式/);
  assert.throws(() => parseLegacyTopics(JSON.stringify({ ...valid,
    categories: [{ id: '__proto__', name: '无效' }]
  })), /分类/);
  assert.throws(() => parseLegacyTopics(JSON.stringify({ ...valid, assignments: { '标记为标题.md': ['new'] } })), /原帖键/);
});
