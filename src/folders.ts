import { TFolder, type App, type Vault } from 'obsidian';
import {
  DEFAULT_PATHS, derivePaths, inferRoot, LEGACY_DEFAULT_PATHS, normalizeFolderPaths, normalizeVaultPath,
  type FolderPaths, type ShiguangConfig
} from './config';

export function hasCollectionFolders(vault: Vault, paths: FolderPaths): boolean {
  return [paths.inbox, paths.bookmarks].some(path => vault.getAbstractFileByPath(path) instanceof TFolder);
}

export function useExistingFolders(vault: Vault, proposed: FolderPaths): FolderPaths {
  const paths = normalizeFolderPaths(proposed);
  for (const path of Object.values(paths)) {
    const entry = vault.getAbstractFileByPath(path);
    if (entry && !(entry instanceof TFolder)) throw new Error(`「${path}」已被同名文件占用。`);
  }
  if (!hasCollectionFolders(vault, paths)) {
    throw new Error('目标位置没有可用的 Inbox 或 Bookmarks。可选择现有收藏目录，或明确移动现有收藏根目录。');
  }
  return paths;
}

export function detectCollectionFolders(vault: Vault, config: ShiguangConfig): FolderPaths | undefined {
  if (hasCollectionFolders(vault, config.paths)) return config.paths;
  if (config.initialized) return undefined;
  if (hasCollectionFolders(vault, DEFAULT_PATHS)) return { ...DEFAULT_PATHS };
  if (hasCollectionFolders(vault, LEGACY_DEFAULT_PATHS)) return { ...LEGACY_DEFAULT_PATHS };
  return undefined;
}

export async function initializeFolders(vault: Vault, proposed: FolderPaths): Promise<void> {
  const directories = new Set<string>();
  for (const path of Object.values(normalizeFolderPaths(proposed))) {
    const segments = path.split('/');
    for (let depth = 1; depth <= segments.length; depth++) {
      const current = segments.slice(0, depth).join('/');
      const entry = vault.getAbstractFileByPath(current);
      if (entry && !(entry instanceof TFolder)) throw new Error(`「${current}」已被同名文件占用。`);
      directories.add(current);
    }
  }
  for (const path of directories) {
    if (vault.getAbstractFileByPath(path) instanceof TFolder) continue;
    try {
      await vault.createFolder(path);
    } catch (error) {
      if (!(vault.getAbstractFileByPath(path) instanceof TFolder)) throw error;
    }
  }
}

export function followFolderRename(
  config: ShiguangConfig, oldPath: string, newPath: string
): { root?: string; paths: FolderPaths } | undefined {
  if (oldPath === newPath) return undefined;
  const follow = (path: string): string =>
    path === oldPath || path.startsWith(oldPath + '/') ? newPath + path.slice(oldPath.length) : path;
  if (config.root) {
    const root = follow(config.root);
    if (root === config.root) return undefined;
    const paths = derivePaths(root);
    return { root, paths };
  }
  const { inbox, bookmarks, cache, covers } = config.paths;
  const changed = { inbox: follow(inbox), bookmarks: follow(bookmarks), cache: follow(cache), covers: follow(covers) };
  if (changed.inbox === inbox && changed.bookmarks === bookmarks && changed.cache === cache && changed.covers === covers) {
    return undefined;
  }
  const paths = normalizeFolderPaths(changed);
  return { root: inferRoot(paths), paths };
}

export function prepareRootMove(app: App, config: ShiguangConfig, target: string) {
  const oldRoot = config.root;
  if (!oldRoot) throw new Error('当前为高级目录配置。请在 Obsidian 文件管理器中移动相应文件夹。');
  const root = normalizeVaultPath(target);
  const normalizedOld = oldRoot.normalize('NFC').toLowerCase();
  const normalizedNew = root.normalize('NFC').toLowerCase();
  if (normalizedOld === normalizedNew || normalizedNew.startsWith(normalizedOld + '/') ||
      normalizedOld.startsWith(normalizedNew + '/')) {
    throw new Error('目标不能是原目录本身、父目录或子目录。');
  }
  const paths = derivePaths(root);
  const { vault } = app;
  const source = vault.getAbstractFileByPath(oldRoot);
  if (!(source instanceof TFolder)) throw new Error('当前收藏根目录不存在。');
  if (vault.getAbstractFileByPath(root)) throw new Error('目标已存在。可选择使用已有目录，移动不会合并或覆盖。');
  const targetParent = root.split('/').slice(0, -1).join('/');
  if (targetParent && !(vault.getAbstractFileByPath(targetParent) instanceof TFolder)) {
    throw new Error('请先在 Obsidian 文件管理器中创建目标父目录。');
  }
  return {
    root,
    paths,
    async move() {
      if (vault.getAbstractFileByPath(oldRoot) !== source || vault.getAbstractFileByPath(root)) {
        throw new Error('源或目标目录已变化，请重新检查位置。');
      }
      await vault.rename(source, root);
      if (vault.getAbstractFileByPath(root) !== source) throw new Error('无法确认移动后的目录位置。');
    },
    async rollback() {
      if (vault.getAbstractFileByPath(oldRoot) === source) return;
      if (vault.getAbstractFileByPath(root) !== source || vault.getAbstractFileByPath(oldRoot)) {
        throw new Error('无法自动恢复原目录。请在 Vault 中检查原位置及目标位置。');
      }
      await vault.rename(source, oldRoot);
      if (vault.getAbstractFileByPath(oldRoot) !== source) throw new Error('无法确认原目录已经恢复。');
    }
  };
}
