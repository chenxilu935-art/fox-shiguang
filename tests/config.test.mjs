import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: ['src/config.ts'],
  bundle: true,
  write: false,
  format: 'esm'
});
const { createCategory, defaultCategories, defaultConfig, normalizeVaultPath, normalizeFolderPaths, validateConfig }
  = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));

test('fresh settings are isolated and AI is off', () => {
  const fresh = defaultConfig();
  assert.equal(fresh.initialized, false);
  assert.deepEqual(fresh.ai, { enabled: false, provider: '', model: '' });
  assert.deepEqual(fresh.categories, []);
  assert.equal(fresh.paths.inbox, 'RedNote/Inbox');
  fresh.paths.inbox = 'Other/Inbox';
  assert.equal(defaultConfig().paths.inbox, 'RedNote/Inbox');
});

test('accept relative Vault paths and reject boundaries or overlap', () => {
  assert.equal(normalizeVaultPath('收藏\\RedNote\\Inbox/'), '收藏/RedNote/Inbox');
  for (const invalid of ['', 'C:\\Inbox', '/Inbox', '../Inbox', '.obsidian/plugins', 'A//Inbox', 'Root/./Inbox']) {
    assert.throws(() => normalizeVaultPath(invalid));
  }
  const paths = defaultConfig().paths;
  assert.throws(() => normalizeFolderPaths({ ...paths, bookmarks: 'rednote/INBOX' }));
  assert.throws(() => normalizeFolderPaths({ ...paths, bookmarks: 'RedNote/Inbox/Kept' }));
  assert.deepEqual(normalizeFolderPaths(paths), paths);
});

test('keep category identity, order and intentionally empty configuration', () => {
  const config = defaultConfig();
  config.initialized = true;
  assert.deepEqual(validateConfig(config).categories, []);
  const template = defaultCategories();
  template[0].name = '本地示例分类';
  config.categories = [createCategory('示例'), ...template.reverse()];
  const validated = validateConfig(config);
  assert.deepEqual(validated.categories, config.categories);
  assert.notEqual(defaultCategories()[0].name, '本地示例分类');
  assert.throws(() => validateConfig({ ...config, categories: [...config.categories, config.categories[0]] }));
  assert.throws(() => validateConfig({ ...config, version: 2 }));
  assert.throws(() => validateConfig({ ...config, ai: { enabled: 'false', provider: '', model: '' } }));
});
