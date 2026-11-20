import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: { contents: "export * from './src/operations'; export * from './src/articles'; export { TFile, TFolder } from 'obsidian';",
    resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm',
  plugins: [{ name: 'mock-obsidian', setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export class TFile {} export class TFolder {}' }));
  } }],
});
const { TFile, TFolder, retainArticles, trashArticles, localMediaCandidates } =
  await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
const paths = { inbox: '示例/RedNote/Inbox', bookmarks: '示例/RedNote/Bookmarks', cache: '示例/RedNote/Cache', covers: '示例/RedNote/Covers' };
const key = 'xhs:' + 'a'.repeat(24);
function fixture() {
  const file = Object.assign(new TFile(), { name: '虚构笔记.md', path: paths.inbox + '/虚构笔记.md', parent: { path: paths.inbox } });
  const folder = Object.assign(new TFolder(), { path: paths.bookmarks });
  const files = [file, folder];
  const writes = [];
  const app = {
    vault: { getMarkdownFiles: () => files.filter(item => item instanceof TFile),
      getAbstractFileByPath: path => files.find(item => item.path === path),
      rename: async (item, path) => { writes.push(['rename', path]); item.path = path; } },
    metadataCache: { getFileCache: () => ({ frontmatter: { id: 'a'.repeat(24) } }) },
    fileManager: { trashFile: async item => { writes.push(['trash', item.path]); files.splice(files.indexOf(item), 1); } },
  };
  return { app, file, files, writes, article: { key, file, path: file.path } };
}
test('retain moves a note only and refuses an existing destination', async () => {
  const { app, article, files, writes } = fixture();
  files.push({ path: paths.bookmarks + '/虚构笔记.md' });
  assert.equal((await retainArticles(app, () => paths, [article])).failed.length, 1);
  assert.equal(writes.length, 0);
  files.pop();
  files.push(Object.assign(new TFile(), { path: paths.bookmarks + '/虚构笔记.MD' }));
  assert.equal((await retainArticles(app, () => paths, [article])).failed.length, 1);
  assert.equal(writes.length, 0);
  files.pop();
  assert.deepEqual(await retainArticles(app, () => paths, [article]), { completed: [key], failed: [] });
  assert.deepEqual(writes, [['rename', paths.bookmarks + '/虚构笔记.md']]);
});
test('trash uses native trash for the exact current note and rejects stale/duplicate selection', async () => {
  const { app, article, file, files, writes } = fixture();
  files.push(Object.assign(new TFile(), { path: paths.bookmarks + '/重复.md' }));
  assert.equal((await trashArticles(app, () => paths, [article])).failed.length, 1);
  files.pop();
  file.path = paths.inbox + '/改名.md';
  assert.equal((await trashArticles(app, () => paths, [article])).failed.length, 1);
  article.path = file.path;
  assert.equal((await trashArticles(app, () => paths, [article, article])).completed.length, 1);
  assert.deepEqual(writes, [['trash', article.path]]);
});
test('media candidates accept local collection media and root following, reject hidden/external references', () => {
  const { file } = fixture();
  for (const ref of ['https://example.invalid/a.png', 'C:/a.png', '/a.png', '../../../.obsidian/a.png', '%2e%2e/%2e%2e/%2e%2e/.obsidian/a.png']) {
    assert.deepEqual(localMediaCandidates(file, key, ref, paths), []);
  }
  assert.ok(localMediaCandidates(file, key, '小红书raw/RedNote/Cache/' + key.slice(4) + '/cover.png', paths)
    .includes(paths.cache + '/' + key.slice(4) + '/cover.png'));
  assert.ok(localMediaCandidates(file, key, '../Media/test.png', paths).includes('示例/RedNote/Media/test.png'));
});
