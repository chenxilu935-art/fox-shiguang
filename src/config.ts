export interface FolderPaths {
  inbox: string;
  bookmarks: string;
  cache: string;
  covers: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface ShiguangConfig {
  version: 1;
  initialized: boolean;
  paths: FolderPaths;
  autoRefresh: boolean;
  defaultPage: 'inbox' | 'bookmarks';
  sort: 'name-asc' | 'name-desc';
  categories: Category[];
  ai: { enabled: boolean; provider: string; model: string };
}

export const FOLDER_LABELS: Record<keyof FolderPaths, string> = {
  inbox: 'Inbox', bookmarks: 'Bookmarks', cache: 'Cache', covers: 'Covers'
};

export const DEFAULT_PATHS: Readonly<FolderPaths> = Object.freeze({
  inbox: 'RedNote/Inbox',
  bookmarks: 'RedNote/Bookmarks',
  cache: 'RedNote/Cache',
  covers: 'RedNote/Covers'
});

export function defaultCategories(): Category[] {
  return [
    { id: 'life', name: '生活', icon: 'coffee', color: '#65806a' },
    { id: 'learning', name: '学习', icon: 'book-open', color: '#4e7893' },
    { id: 'work', name: '工作', icon: 'briefcase-business', color: '#796d95' },
    { id: 'inspiration', name: '灵感', icon: 'lightbulb', color: '#a77136' }
  ];
}

export function createCategory(name: string): Category {
  return { id: crypto.randomUUID(), name: name.trim(), icon: 'tag', color: '#65806a' };
}

export function defaultConfig(): ShiguangConfig {
  return {
    version: 1,
    initialized: false,
    paths: { ...DEFAULT_PATHS },
    autoRefresh: true,
    defaultPage: 'inbox',
    sort: 'name-asc',
    categories: [],
    ai: { enabled: false, provider: '', model: '' }
  };
}

export function normalizeVaultPath(raw: string): string {
  if (typeof raw !== 'string') throw new Error('请输入 Vault 相对目录。');
  const path = raw.trim().replaceAll('\\', '/').replace(/\/$/, '');
  const parts = path.split('/');
  if (!path || path.length > 512 || /[<>:"|?*#\u0000-\u001f]/.test(path) ||
      parts.some(part => !part || part.startsWith('.') || part.trim() !== part || part.endsWith('.'))) {
    throw new Error('请使用 Vault 内的相对文件夹路径，例如 RedNote/Inbox。');
  }
  return path;
}

export function normalizeFolderPaths(paths: FolderPaths): FolderPaths {
  const normalized = {
    inbox: normalizeVaultPath(paths.inbox),
    bookmarks: normalizeVaultPath(paths.bookmarks),
    cache: normalizeVaultPath(paths.cache),
    covers: normalizeVaultPath(paths.covers)
  };
  const folders = Object.values(normalized).map(path => path.normalize('NFC').toLowerCase());
  if (folders.some((path, index) => folders.some((other, otherIndex) =>
    index !== otherIndex && (path === other || path.startsWith(other + '/'))))) {
    throw new Error('Inbox、Bookmarks、Cache、Covers 需要使用互不重叠的文件夹。');
  }
  return normalized;
}

// Invalid or newer settings are left on disk for recovery.
export function validateConfig(value: unknown): ShiguangConfig {
  const config = value as ShiguangConfig | null;
  if (!config || config.version !== 1 || typeof config.initialized !== 'boolean' ||
      !config.paths || typeof config.autoRefresh !== 'boolean' ||
      (config.defaultPage !== 'inbox' && config.defaultPage !== 'bookmarks') ||
      (config.sort !== 'name-asc' && config.sort !== 'name-desc') ||
      !Array.isArray(config.categories) || !config.ai || typeof config.ai.enabled !== 'boolean' ||
      typeof config.ai.provider !== 'string' || typeof config.ai.model !== 'string') {
    throw new Error('设置格式无法读取，或由较新版本写入。');
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const categories = config.categories.map(category => {
    if (!category || typeof category.id !== 'string' || !category.id ||
        typeof category.name !== 'string' || !category.name.trim() || category.name.trim().length > 40 ||
        typeof category.icon !== 'string' || !/^[a-z0-9-]+$/i.test(category.icon) ||
        typeof category.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(category.color)) {
      throw new Error('分类名称、图标或颜色无效。');
    }
    const name = category.name.trim();
    const nameKey = name.normalize('NFC').toLowerCase();
    if (ids.has(category.id) || names.has(nameKey)) throw new Error('分类名称或标识重复。');
    ids.add(category.id);
    names.add(nameKey);
    return { id: category.id, name, icon: category.icon, color: category.color };
  });

  return {
    version: 1, initialized: config.initialized, paths: normalizeFolderPaths(config.paths),
    autoRefresh: config.autoRefresh, defaultPage: config.defaultPage, sort: config.sort, categories,
    ai: { enabled: config.ai.enabled, provider: config.ai.provider.trim(), model: config.ai.model.trim() }
  };
}
