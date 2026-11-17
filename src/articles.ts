import { TFile, type App } from 'obsidian';
import type { FolderPaths } from './config';

export const TOPIC_FIELD = 'shiguangTopics';
const IMAGE_PATH = /\.(avif|gif|jpe?g|png|webp)$/i;

export interface Article {
  key: string;
  title: string;
  author?: string;
  file: TFile;
  path: string;
  topics: string[];
  topicState: 'missing' | 'valid' | 'invalid';
  coverUrl?: string;
}

type EditableTopics = { topics: string[]; topicState: 'missing' | 'valid' };

export function getArticleKey(fields: Record<string, unknown>): string | undefined {
  const id = fields.id;
  if (typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)) return 'xhs:' + id.toLowerCase();
}

export function readArticleTopics(fields: Record<string, unknown>): Pick<Article, 'topics' | 'topicState'> {
  if (!Object.prototype.hasOwnProperty.call(fields, TOPIC_FIELD)) return { topics: [], topicState: 'missing' };
  const value = fields[TOPIC_FIELD];
  return Array.isArray(value) && value.every(topic => typeof topic === 'string' && topic.trim() === topic && topic.length > 0)
    ? { topics: [...value], topicState: 'valid' }
    : { topics: [], topicState: 'invalid' };
}

function findCover(app: App, file: TFile, key: string, ref: unknown, paths: FolderPaths): string | undefined {
  if (typeof ref !== 'string' || !ref || /^[/\\]|[:?#\u0000-\u001f]/.test(ref)) return;
  const source = ref.replaceAll('\\', '/');
  const normalize = (raw: string): string | undefined => {
    const parts: string[] = [];
    for (const component of raw.split('/')) {
      if (!component || component === '.') continue;
      if (component === '..') {
        if (!parts.length) return;
        parts.pop();
      } else if (component.startsWith('.')) {
        return;
      } else {
        parts.push(component);
      }
    }
    return parts.join('/');
  };
  const id = key.slice(4);
  const options = [normalize(source), normalize((file.parent?.path ?? '') + '/' + source)];
  // RedLink writes a Vault-relative path. A standard root rename keeps the ID and filename intact.
  const cacheSuffix = source.match(new RegExp('(?:^|/)RedNote/Cache/' + id + '/(.+)$', 'i'))?.[1];
  if (cacheSuffix && !cacheSuffix.split('/').some(part => part === '..')) options.push(normalize(paths.cache + '/' + id + '/' + cacheSuffix));
  const coversSuffix = source.match(/(?:^|\/)RedNote\/Covers\/(.+)$/)?.[1];
  if (coversSuffix && !coversSuffix.split('/').some(part => part === '..')) options.push(normalize(paths.covers + '/' + coversSuffix));
  for (const path of options) {
    if (!path || !IMAGE_PATH.test(path) ||
        !(path.startsWith(paths.cache + '/') || path.startsWith(paths.covers + '/'))) continue;
    const image = app.vault.getAbstractFileByPath(path);
    if (image instanceof TFile) return app.vault.getResourcePath(image);
  }
}

function inArticleFolders(file: TFile, paths: FolderPaths): boolean {
  return file.path.startsWith(paths.inbox + '/') || file.path.startsWith(paths.bookmarks + '/');
}

export function readArticle(app: App, file: TFile, paths: FolderPaths): Article | undefined {
  const fields = app.metadataCache.getFileCache(file)?.frontmatter;
  if (!fields) return;
  const key = getArticleKey(fields);
  if (!key) return;
  return {
    key,
    title: typeof fields.title === 'string' && fields.title.trim() ? fields.title : file.basename,
    author: typeof fields.author === 'string' && fields.author.trim() ? fields.author : undefined,
    file,
    path: file.path,
    ...readArticleTopics(fields),
    coverUrl: findCover(app, file, key, fields.coverPath, paths)
  };
}

export async function setArticleTopics(
  app: App, getPaths: () => FolderPaths, key: string, expected: EditableTopics, topics: string[]
): Promise<void> {
  if (readArticleTopics({ [TOPIC_FIELD]: topics }).topicState !== 'valid') {
    throw new Error('主题 ID 格式无效。');
  }
  const findCandidates = (paths: FolderPaths) => app.vault.getMarkdownFiles().filter(file => {
    if (!inArticleFolders(file, paths)) return false;
    const fields = app.metadataCache.getFileCache(file)?.frontmatter;
    return fields && getArticleKey(fields) === key;
  });
  const candidates = findCandidates(getPaths());
  if (candidates.length !== 1) throw new Error(candidates.length
    ? '找到多个同一原帖 ID 的文件。请处理重复后再保存。'
    : '未找到这篇收藏，请重新扫描后再试。');
  const file = candidates[0];
  await app.fileManager.processFrontMatter(file, fields => {
    const paths = getPaths();
    if (app.vault.getAbstractFileByPath(file.path) !== file || !inArticleFolders(file, paths) ||
        getArticleKey(fields) !== key) throw new Error('文章身份或来源目录已变化，请重新打开再试。');
    if (findCandidates(paths).some(candidate => candidate !== file)) {
      throw new Error('找到多个同一原帖 ID 的文件。请处理重复后再保存。');
    }
    const current = readArticleTopics(fields);
    if (current.topicState !== expected.topicState ||
        current.topics.length !== expected.topics.length ||
        current.topics.some((id, index) => id !== expected.topics[index])) {
      throw new Error('文章的主题属性已变化，请重新打开再编辑。');
    }
    fields[TOPIC_FIELD] = [...new Set(topics)];
  });
}
