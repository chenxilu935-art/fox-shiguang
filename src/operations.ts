import { TFile, TFolder, type App } from 'obsidian';
import { getArticleKey, type Article } from './articles';
import type { FolderPaths } from './config';

export interface OperationResult {
  completed: string[];
  failed: { key: string; error: string }[];
}

function currentArticle(app: App, paths: FolderPaths, article: Article): TFile {
  const candidates = app.vault.getMarkdownFiles().filter(file =>
    (file.path.startsWith(paths.inbox + '/') || file.path.startsWith(paths.bookmarks + '/')) &&
    getArticleKey(app.metadataCache.getFileCache(file)?.frontmatter ?? {}) === article.key);
  if (candidates.length !== 1) throw Error('文章不存在或原帖 ID 重复，请重新扫描。');
  const file = candidates[0];
  if (!(file instanceof TFile) || file !== article.file || file.path !== article.path ||
      app.vault.getAbstractFileByPath(file.path) !== file) throw Error('文章位置已变化，请重新扫描。');
  return file;
}

async function operate(app: App, getPaths: () => FolderPaths, articles: Article[], retain: boolean): Promise<OperationResult> {
  const result: OperationResult = { completed: [], failed: [] };
  for (const article of new Map(articles.map(article => [article.key, article])).values()) {
    try {
      const paths = getPaths();
      const file = currentArticle(app, paths, article);
      if (retain) {
        if (!file.path.startsWith(paths.inbox + '/')) throw Error('只能保留待整理目录中的文章。');
        if (!(app.vault.getAbstractFileByPath(paths.bookmarks) instanceof TFolder)) throw Error('已保留目录不存在。');
        const destination = paths.bookmarks + '/' + file.name;
        const canonical = (path: string) => path.normalize('NFC').toLocaleLowerCase();
        if (app.vault.getAbstractFileByPath(destination) || app.vault.getMarkdownFiles()
          .some(other => canonical(other.path) === canonical(destination))) throw Error('已保留目录已有同名文件，未覆盖。');
        // Vault.rename keeps the Markdown bytes and existing local media references intact.
        await app.vault.rename(file, destination);
      } else {
        // Obsidian honors the user's trash preference. Shared media are never removed.
        await app.fileManager.trashFile(file);
      }
      result.completed.push(article.key);
    } catch (error) {
      result.failed.push({ key: article.key, error: error instanceof Error ? error.message : '操作失败，请重新扫描。' });
    }
  }
  return result;
}

export const retainArticles = (app: App, getPaths: () => FolderPaths, articles: Article[]) => operate(app, getPaths, articles, true);
export const trashArticles = (app: App, getPaths: () => FolderPaths, articles: Article[]) => operate(app, getPaths, articles, false);
