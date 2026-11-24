import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
globalThis.require = createRequire(import.meta.url);
const { outputFiles } = await build({
  stdin: { contents: "export * from './src/desk';export {TFile,TFolder} from 'obsidian'", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node', external: ['fs', 'path'],
  plugins: [{ name: 'mock-obsidian', setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: `
      export class TFile {} export class TFolder {}
      export function parseYaml(text){const v={};for(const line of text.split('\\n')){const at=line.indexOf(':');if(at<0)continue;const k=line.slice(0,at),raw=line.slice(at+1).trim();v[k]=JSON.parse(raw);}return v;}` }));
  } }],
});
const { DeskStore, getDeskStore, validateDeskContent, serializeKnowledge, publishKnowledge, findKnowledge, findKnowledgeIndex, TFile, TFolder } =
  await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
const key = 'xhs:' + 'a'.repeat(24);
const paths = { inbox: '样本/Inbox', bookmarks: '样本/Bookmarks', cache: '样本/Cache', covers: '样本/Covers' };
const categories = [{ id: 'life', name: '生活', color: '#65806a', icon: 'tag' }];
const draft = () => ({ title: '虚构知识', blocks: [
  { id: 'first', type: 'text', text: '第一段\n\n保留空行。' },
  { id: 'quote', type: 'quote', text: '原文摘录\n下一行', source: { key, title: '虚构原文', url: 'https://www.xiaohongshu.com/explore/' + key.slice(4), path: paths.bookmarks + '/虚构原文.md' } },
  { id: 'last', type: 'text', text: '最后一段自己的想法。' },
] });
function fixture() {
  const articleFile = Object.assign(new TFile(), { path: paths.bookmarks + '/虚构原文.md', name: '虚构原文.md' });
  const files = [articleFile, Object.assign(new TFolder(), { path: paths.bookmarks })];
  const texts = new Map([[articleFile, '---\nid: ' + JSON.stringify(key.slice(4)) + '\n---\n原文不会复制。']]);
  const writes = [];
  const app = { vault: {
    getMarkdownFiles: () => files.filter(f => f instanceof TFile), getFiles: () => files.filter(f => f instanceof TFile),
    getAbstractFileByPath: p => files.find(f => f.path === p), read: async f => texts.get(f) ?? '',
    createFolder: async p => { const f = Object.assign(new TFolder(), { path: p }); files.push(f); writes.push(p); return f; },
    create: async (p, text) => { if (files.some(f => f.path === p)) throw Error('exists'); const f = Object.assign(new TFile(), { path: p }); files.push(f); texts.set(f, text); writes.push(p); return f; },
  } };
  const article = { key, file: articleFile, path: articleFile.path, title: '虚构原文', sourceUrl: draft().blocks[1].source.url, topics: [] };
  return { app, article, files, texts, writes };
}
test('ordered free document serialization keeps paragraph order and quote provenance without source body', () => {
  const { article, writes } = fixture();
  const result = serializeKnowledge(article, { ...draft(), topics: ['life'] }, categories);
  assert.ok(result.indexOf('第一段\n\n保留空行。') < result.indexOf('> 原文摘录'));
  assert.ok(result.indexOf('> 原文摘录') < result.indexOf('最后一段自己的想法。'));
  assert.match(result, /topics: \["生活"\]/);
  assert.match(result, /shiguangSourceId: "xhs:/);
  assert.match(result, /返回原收藏/);
  assert.ok(!result.includes('原文不会复制。'));
  assert.deepEqual(writes, []);
});
test('draft validation refuses cross-article quotes, duplicate blocks and oversized content', () => {
  const content = draft(); content.blocks[1].source.key = 'xhs:' + 'b'.repeat(24);
  assert.throws(() => validateDeskContent(key, content), /来源不匹配/);
  const duplicate = draft(); duplicate.blocks[2].id = duplicate.blocks[0].id;
  assert.throws(() => validateDeskContent(key, duplicate), /格式无效/);
  assert.throws(() => validateDeskContent(key, { title: '', blocks: [{ id: 'a', type: 'text', text: 'x'.repeat(100001) }] }));
});
test('desktop draft survives new store instance, rejects stale revisions and preserves corrupt file', async () => {
  const parent = path.resolve('test-output'); fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'desk-'));
  const pluginDir = '.obsidian/plugins/fox-shiguang'; fs.mkdirSync(path.join(root, pluginDir), { recursive: true });
  const file = path.join(root, pluginDir, 'desk-drafts.json');
  const app = { vault: { adapter: { getBasePath: () => root } } };
  try {
    const store = getDeskStore(app, pluginDir);
    assert.equal(store, getDeskStore(app, pluginDir));
    assert.equal(await store.load(key), undefined);
    const saved = await store.save(key, draft(), 0);
    assert.equal(saved.revision, 1);
    assert.deepEqual((await new DeskStore(app, pluginDir).load(key)).blocks, draft().blocks);
    const before = fs.readFileSync(file, 'utf8');
    await assert.rejects(store.save(key, { ...draft(), title: '旧窗口' }, 0), /另一窗口/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    fs.writeFileSync(file, '{broken');
    await assert.rejects(store.save(key, draft(), 1));
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  } finally {
    assert.ok(path.resolve(root).startsWith(parent + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});
test('concurrent confirmation creates one note, preserves original and finds renamed knowledge after restart', async () => {
  const { app, article, texts, writes } = fixture();
  const original = texts.get(article.file);
  const input = { ...draft(), topics: ['life'], folder: '20-Knowledge' };
  const [first, second] = await Promise.all([publishKnowledge(app, article, paths, input, categories), publishKnowledge(app, article, paths, input, categories)]);
  assert.equal(first, second);
  assert.equal(writes.filter(p => p.endsWith('.md')).length, 1);
  assert.equal(texts.get(article.file), original);
  first.path = '20-Knowledge/改名知识.md';
  assert.equal(await findKnowledge(app, key), first);
  const newApp = { vault: app.vault };
  assert.equal(await publishKnowledge(newApp, article, paths, input, categories), first);
});
test('publication refuses Inbox, target collisions and collection-directory output without overwriting', async () => {
  const input = { ...draft(), topics: ['life'], folder: '20-Knowledge' };
  const { app, article, files, writes } = fixture();
  article.file.path = paths.inbox + '/虚构原文.md';
  await assert.rejects(publishKnowledge(app, article, paths, input, categories), /Bookmarks/);
  article.file.path = paths.bookmarks + '/虚构原文.md';
  files.push(Object.assign(new TFile(), { path: '20-Knowledge/虚构知识.MD' }));
  await assert.rejects(publishKnowledge(app, article, paths, input, categories), /同名/);
  await assert.rejects(publishKnowledge(app, article, paths, { ...input, folder: paths.cache }, categories), /之外/);
  assert.deepEqual(writes, []);
});
test('knowledge refresh scans each Markdown once and omits duplicate identities without allowing republish', async () => {
  const { app, article, files, texts } = fixture();
  const saved = await publishKnowledge(app, article, paths, { ...draft(), topics: [], folder: '20-Knowledge' }, categories);
  let reads = 0; const read = app.vault.read;
  app.vault.read = async file => { reads++; return read(file); };
  const index = await findKnowledgeIndex(app);
  assert.equal(reads, app.vault.getMarkdownFiles().length);
  assert.equal(index.get(key), saved);
  const duplicate = Object.assign(new TFile(), { path: '20-Knowledge/重复.md' });
  files.push(duplicate); texts.set(duplicate, texts.get(saved));
  assert.equal((await findKnowledgeIndex(app)).has(key), false);
  await assert.rejects(publishKnowledge(app, article, paths, { ...draft(), topics: [], folder: '20-Knowledge' }, categories), /多篇关联/);
});
