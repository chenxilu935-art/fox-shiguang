import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  stdin: {
    contents: "export * from './src/articles'; export { TFile } from 'obsidian';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
  plugins: [{
    name: 'mock-obsidian',
    setup(builder) {
      builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: 'export class TFile {}',
      }));
    },
  }],
});
const { TFile, readArticle, readArticleTopics, setArticleTopics } =
  await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

const id = 'abcd00000000000000000001';
const key = 'xhs:' + id;
const root = '示例收藏/RedNote';
const paths = {
  inbox: root + '/Inbox', bookmarks: root + '/Bookmarks', cache: root + '/Cache', covers: root + '/Covers',
};
const articlePath = paths.inbox + '/虚构文章.md';
const coverPath = paths.cache + '/' + id + '/cover.jpg';

function fixture(extra = {}) {
  const file = Object.assign(new TFile(), { path: articlePath, basename: '虚构文章' });
  const cover = Object.assign(new TFile(), { path: coverPath });
  const fields = {
    id, title: '原帖标题', tags: ['原始标签'], coverPath: '小红书raw/RedNote/Cache/' + id + '/cover.jpg',
    media: [{ kind: 'image', path: 'Cache/original' }], ...extra,
  };
  const files = [file];
  let writes = 0;
  const app = {
    vault: {
      getMarkdownFiles: () => files,
      getAbstractFileByPath: path => path === cover.path ? cover : files.find(item => item.path === path),
      getResourcePath: image => 'app://fake/' + image.path,
    },
    metadataCache: { getFileCache: () => ({ frontmatter: fields }) },
    fileManager: { processFrontMatter: async (_file, callback) => { callback(fields); writes++; } },
  };
  return { app, file, files, fields, writes: () => writes };
}

test('identity and cover survive root and article moves while original metadata stays intact', async () => {
  const { app, file, fields } = fixture();
  const article = readArticle(app, file, paths);
  assert.equal(article.key, key);
  assert.equal(article.title, '原帖标题');
  assert.equal(article.coverUrl, 'app://fake/' + coverPath);
  const original = structuredClone(fields);
  await setArticleTopics(app, () => paths, key, { topics: [], topicState: 'missing' }, ['life', 'work']);
  assert.deepEqual(fields, { ...original, shiguangTopics: ['life', 'work'] });
  file.path = paths.bookmarks + '/重新命名.md';
  fields.title = '调整后的标题';
  assert.equal(readArticle(app, file, paths).key, key);
  assert.deepEqual(readArticle(app, file, paths).topics, ['life', 'work']);
  await setArticleTopics(app, () => paths, key, { topics: ['life', 'work'], topicState: 'valid' }, []);
  assert.deepEqual(fields.shiguangTopics, []);
});

test('reject stale, malformed and duplicate assignments before a write', async () => {
  const { app, file, fields, files, writes } = fixture({ shiguangTopics: ['external'] });
  await assert.rejects(setArticleTopics(app, () => paths, key, { topics: [], topicState: 'missing' }, ['life']), /已经?变化/);
  fields.shiguangTopics = 'manual text';
  assert.equal(readArticleTopics(fields).topicState, 'invalid');
  await assert.rejects(setArticleTopics(app, () => paths, key, { topics: ['external'], topicState: 'valid' }, ['life']));
  fields.shiguangTopics = ['external'];
  files.push(Object.assign(new TFile(), { path: paths.bookmarks + '/重复.md' }));
  await assert.rejects(setArticleTopics(app, () => paths, key, { topics: ['external'], topicState: 'valid' }, ['life']), /多个/);
  assert.equal(writes(), 0);
  assert.equal(readArticle(app, file, paths).topics[0], 'external');
});

test('ignore network or unrelated media paths and leave malformed note identity untouched', () => {
  const { app, file, fields } = fixture({ coverPath: 'https://example.invalid/cover.jpg' });
  assert.equal(readArticle(app, file, paths).coverUrl, undefined);
  fields.coverPath = '不相关/cover.jpg';
  assert.equal(readArticle(app, file, paths).coverUrl, undefined);
  fields.id = 'only a title';
  assert.equal(readArticle(app, file, paths), undefined);
});
