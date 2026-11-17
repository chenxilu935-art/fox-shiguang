import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

class TFolder {
  constructor(path) { this.path = path; }
}
const { outputFiles } = await build({
  stdin: {
    contents: 'export * from "./src/config"; export * from "./src/folders";',
    resolveDir: process.cwd()
  },
  bundle: true, write: false, format: 'cjs', external: ['obsidian']
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', outputFiles[0].text)(
  name => { assert.equal(name, 'obsidian'); return { TFolder }; }, loaded, loaded.exports);
const { defaultConfig, DEFAULT_PATHS, LEGACY_DEFAULT_PATHS, derivePaths, detectCollectionFolders,
  followFolderRename, initializeFolders, prepareRootMove, useExistingFolders } = loaded.exports;

function makeVault(initial = []) {
  const entries = new Map(initial);
  const created = [];
  return {
    entries,
    created,
    getAbstractFileByPath: path => entries.get(path),
    async createFolder(path) {
      assert.equal(entries.has(path), false);
      const separator = path.lastIndexOf('/');
      if (separator !== -1) assert.ok(entries.get(path.slice(0, separator)) instanceof TFolder);
      const entry = new TFolder(path);
      entries.set(path, entry);
      created.push(path);
      return entry;
    },
    async rename(file, newPath) {
      assert.equal(entries.has(newPath), false);
      const oldPath = file.path;
      for (const [path, entry] of [...entries]) {
        if (path !== oldPath && !path.startsWith(oldPath + '/')) continue;
        entries.delete(path);
        entry.path = newPath + path.slice(oldPath.length);
        entries.set(entry.path, entry);
      }
    }
  };
}

test('create default root and four folders in the Vault order, with idempotent retry', async () => {
  const vault = makeVault();
  await initializeFolders(vault, DEFAULT_PATHS);
  assert.deepEqual(vault.created, ['小红书raw', '小红书raw/RedNote', ...Object.values(DEFAULT_PATHS)]);
  const note = { path: DEFAULT_PATHS.inbox + '/虚构收藏.md' };
  vault.entries.set(note.path, note);
  const snapshot = [...vault.entries];
  await initializeFolders(vault, DEFAULT_PATHS);
  assert.deepEqual([...vault.entries], snapshot);
  assert.equal(vault.created.length, 6);
});

test('refuse a file occupying a planned folder before creating other folders', async () => {
  const vault = makeVault([[DEFAULT_PATHS.cache, { path: DEFAULT_PATHS.cache }]]);
  await assert.rejects(initializeFolders(vault, DEFAULT_PATHS), /同名文件/);
  assert.deepEqual(vault.created, []);
});

test('recognize standard and Stage 3.1 top-level layout without writes', async () => {
  const legacy = LEGACY_DEFAULT_PATHS.inbox;
  const vault = makeVault([[legacy, new TFolder(legacy)]]);
  assert.deepEqual(detectCollectionFolders(vault, defaultConfig()), LEGACY_DEFAULT_PATHS);
  assert.equal(detectCollectionFolders(vault, { ...defaultConfig(), initialized: true }), undefined);
  assert.throws(() => useExistingFolders(vault, DEFAULT_PATHS), /没有可用/);
  await initializeFolders(vault, DEFAULT_PATHS);
  assert.deepEqual(detectCollectionFolders(vault, defaultConfig()), DEFAULT_PATHS);
  const other = derivePaths('其它路径');
  assert.throws(() => useExistingFolders(vault, other), /没有可用/);
  await initializeFolders(vault, other);
  assert.deepEqual(useExistingFolders(vault, other), other);
  assert.ok(vault.entries.has(legacy));
});

test('follow exactly a configured root or ancestor, including independently configured paths', () => {
  const root = '父目录/收藏';
  const config = { ...defaultConfig(), root, paths: derivePaths(root) };
  assert.equal(followFolderRename(config, '父目录近似', '其他'), undefined);
  assert.equal(followFolderRename(config, config.paths.inbox, '收件'), undefined);
  assert.deepEqual(followFolderRename(config, root, '新根'), { root: '新根', paths: derivePaths('新根') });
  assert.deepEqual(followFolderRename(config, '父目录', '归档/父目录'), {
    root: '归档/父目录/收藏', paths: derivePaths('归档/父目录/收藏')
  });
  const advanced = { ...config, root: undefined, paths: LEGACY_DEFAULT_PATHS };
  assert.deepEqual(followFolderRename(advanced, 'RedNote/Bookmarks', '另处/Bookmarks'), {
    root: undefined, paths: { ...LEGACY_DEFAULT_PATHS, bookmarks: '另处/Bookmarks' }
  });
});

test('explicit move refuses overlap or collisions and rolls back with unchanged contents', async () => {
  const vault = makeVault();
  await initializeFolders(vault, DEFAULT_PATHS);
  const config = defaultConfig();
  const note = { path: DEFAULT_PATHS.inbox + '/虚构收藏.md', content: '不可丢失' };
  vault.entries.set(note.path, note);
  assert.throws(() => prepareRootMove({ vault }, config, config.root + '/目标'), /子目录/);
  assert.throws(() => prepareRootMove({ vault }, config, '缺少的父目录/目标'), /父目录/);
  await initializeFolders(vault, derivePaths('已有目标'));
  assert.throws(() => prepareRootMove({ vault }, config, '已有目标'), /目标已存在/);
  const move = prepareRootMove({ vault }, config, '迁移目标');
  await move.move();
  assert.equal(vault.entries.get(move.paths.inbox + '/虚构收藏.md'), note);
  await move.rollback();
  assert.equal(vault.entries.get(DEFAULT_PATHS.inbox + '/虚构收藏.md'), note);
  assert.equal(note.content, '不可丢失');
  assert.equal(vault.entries.has(move.root), false);
});

test('leave the source in place if a target appears before the move', async () => {
  const vault = makeVault();
  await initializeFolders(vault, DEFAULT_PATHS);
  const move = prepareRootMove({ vault }, defaultConfig(), '试用目标');
  const newTarget = new TFolder(move.root);
  vault.entries.set(move.root, newTarget);
  await assert.rejects(move.move(), /目录已变化/);
  await move.rollback();
  assert.equal(vault.entries.get(move.root), newTarget);
  assert.ok(vault.entries.has(DEFAULT_PATHS.inbox));
});

test('allow rollback when the Vault reports an error after moving the folder', async () => {
  const vault = makeVault();
  await initializeFolders(vault, DEFAULT_PATHS);
  const move = prepareRootMove({ vault }, defaultConfig(), '试用目标');
  const rename = vault.rename;
  vault.rename = async (file, newPath) => {
    await rename(file, newPath);
    if (newPath === move.root) throw new Error('移动后报告失败');
  };
  await assert.rejects(move.move(), /移动后报告失败/);
  await move.rollback();
  assert.ok(vault.entries.has(DEFAULT_PATHS.inbox));
  assert.equal(vault.entries.has(move.root), false);
});
