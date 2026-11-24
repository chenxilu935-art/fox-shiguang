import { TFile, TFolder, parseYaml, type App } from 'obsidian';
import { getArticleKey, type Article } from './articles';
import { normalizeVaultPath, type Category, type FolderPaths } from './config';

declare const require: (name: string) => any;
export interface DeskSource { key: string; title: string; url: string; path: string }
export interface DeskBlock { id: string; type: 'text' | 'quote'; text: string; source?: DeskSource }
export interface DeskContent { title: string; blocks: DeskBlock[] }
export interface DeskDraft extends DeskContent { revision: number; updatedAt: string }
interface DraftData { version: 1; drafts: Record<string, DeskDraft> }
export interface KnowledgeInput extends DeskContent { topics: string[]; folder: string }
const validKey = (key: string) => /^xhs:[a-f0-9]{24}$/.test(key);
const sourceUrl = (key: string) => 'https://www.xiaohongshu.com/explore/' + key.slice(4);

export function validateDeskContent(key: string, value: unknown): DeskContent {
  const input = value as DeskContent;
  if (!validKey(key) || !input || typeof input.title !== 'string' || input.title.length > 240 ||
      !Array.isArray(input.blocks) || input.blocks.length > 1000) throw Error('草稿格式无效或内容过长，原草稿已保留。');
  const ids = new Set<string>();
  let length = 0;
  const blocks = input.blocks.map(block => {
    if (!block || typeof block.id !== 'string' || !/^[\w-]{1,100}$/.test(block.id) || ids.has(block.id) ||
        !['text', 'quote'].includes(block.type) || typeof block.text !== 'string' || block.text.length > 100000) {
      throw Error('段落或摘录格式无效。');
    }
    ids.add(block.id); length += block.text.length;
    if (length > 1000000) throw Error('草稿内容超过预览限制。');
    if (block.type === 'quote') {
      const source = block.source;
      if (!source || source.key !== key || typeof source.title !== 'string' || source.title.length > 500 ||
          source.url !== sourceUrl(key) || typeof source.path !== 'string') throw Error('摘录来源不匹配，已停止保存。');
      normalizeVaultPath(source.path);
      return { id: block.id, type: 'quote' as const, text: block.text, source: { ...source } };
    }
    return { id: block.id, type: 'text' as const, text: block.text };
  });
  return { title: input.title, blocks };
}

function parseDraftData(text: string | null): DraftData {
  if (text === null) return { version: 1, drafts: {} };
  const data = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (data?.version !== 1 || !data.drafts || typeof data.drafts !== 'object' || Array.isArray(data.drafts)) {
    throw Error('草稿文件格式无法读取，原文件已保留。');
  }
  for (const [key, value] of Object.entries(data.drafts) as [string, DeskDraft][]) {
    validateDeskContent(key, value);
    if (!Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.updatedAt !== 'string') {
      throw Error('草稿版本无法读取，原文件已保留。');
    }
  }
  return data;
}

/** Reuses the original desktop atomic replace strategy and optimistic revisions. */
export class DeskStore {
  constructor(private app: App, private pluginDir: string) {}
  private storage() {
    const fs = require('fs'), path = require('path');
    const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
    if (!adapter.getBasePath) throw Error('草稿保存需要桌面文件系统。');
    const base = path.resolve(adapter.getBasePath()), directory = path.resolve(base, this.pluginDir);
    if (!directory.toLowerCase().startsWith((base + path.sep).toLowerCase()) || !/[/\\]fox-shiguang$/i.test(directory)) {
      throw Error('草稿存储位置无效。');
    }
    const file = path.join(directory, 'desk-drafts.json');
    return { fs, file };
  }
  async load(key: string): Promise<DeskDraft | undefined> {
    if (!validKey(key)) throw Error('收藏标识无效。');
    const { fs, file } = this.storage();
    const data = parseDraftData(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
    return data.drafts[key] ? structuredClone(data.drafts[key]) : undefined;
  }
  async save(key: string, value: unknown, expectedRevision: number): Promise<DeskDraft> {
    const content = validateDeskContent(key, value);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw Error('草稿版本无效。');
    const { fs, file } = this.storage();
    const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    const data = parseDraftData(previous);
    if ((data.drafts[key]?.revision ?? 0) !== expectedRevision) throw Error('草稿已在另一窗口更新，请保留当前文字并重新打开。');
    const draft = { ...content, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    data.drafts[key] = draft;
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
      if (current !== previous) throw Error('草稿文件已被修改，当前内容未覆盖。');
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return structuredClone(draft);
  }
}
const stores = new WeakMap<App, DeskStore>();
export function getDeskStore(app: App, pluginDir: string): DeskStore {
  let store = stores.get(app);
  if (!store) { store = new DeskStore(app, pluginDir); stores.set(app, store); }
  return store;
}

async function frontmatter(app: App, file: TFile): Promise<Record<string, unknown> | undefined> {
  const text = await app.vault.read(file), match = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return;
  try { return parseYaml(match[1]) as Record<string, unknown>; }
  catch { if (/shiguangSourceId/.test(match[1])) throw Error('已有知识笔记的属性无法识别，请先检查。'); }
}
async function scanKnowledge(app: App): Promise<{ index: Map<string, TFile>; duplicates: Set<string> }> {
  const index = new Map<string, TFile>(), duplicates = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const key = (await frontmatter(app, file))?.shiguangSourceId;
    if (typeof key !== 'string' || !validKey(key)) continue;
    if (index.has(key) || duplicates.has(key)) { duplicates.add(key); index.delete(key); }
    else index.set(key, file);
  }
  return { index, duplicates };
}
/** One fresh raw scan per collection refresh, independent of metadata-cache timing. */
export async function findKnowledgeIndex(app: App): Promise<Map<string, TFile>> {
  return (await scanKnowledge(app)).index;
}
export async function findKnowledge(app: App, key: string): Promise<TFile | undefined> {
  if (!validKey(key)) throw Error('收藏标识无效。');
  const { index, duplicates } = await scanKnowledge(app);
  if (duplicates.has(key)) throw Error('存在多篇关联知识笔记，请处理重复后再入库。');
  return index.get(key);
}
const yaml = (value: unknown) => JSON.stringify(value);
const wiki = (path: string, label: string) => `[[${path.replace(/\.md$/i, '')}|${label.replace(/[\[\]|\r\n]/g, ' ')}]]`;
export function serializeKnowledge(article: Article, input: DeskContent & { topics: string[] }, categories: Category[]): string {
  const content = validateDeskContent(article.key, input);
  if (!Array.isArray(input.topics) || input.topics.length > 1000 || input.topics.some(id => typeof id !== 'string' || !id || id.length > 100)) throw Error('主题选择无效。');
  const names = input.topics.map(id => categories.find(category => category.id === id)?.name).filter((v): v is string => Boolean(v));
  const blocks = content.blocks.map(block => block.type === 'text' ? block.text :
    block.text.split('\n').map(line => '> ' + line).join('\n') + '\n>\n> — ' + wiki(article.file.path, block.source!.title) + ' · [原帖](' + sourceUrl(article.key) + ')');
  return ['---', 'title: ' + yaml(content.title), 'shiguangSourceId: ' + yaml(article.key),
    'shiguangTopics: ' + yaml([...new Set(input.topics)]), 'topics: ' + yaml(names),
    'source: ' + yaml(sourceUrl(article.key)), 'shiguangOriginal: ' + yaml(wiki(article.file.path, '原收藏')), '---', '',
    blocks.join('\n\n'), '', '---', '来源：' + wiki(article.file.path, '返回原收藏') + ' · [小红书原帖](' + sourceUrl(article.key) + ')', ''].join('\n');
}
const publicationQueues = new WeakMap<App, Promise<unknown>>();
export function publishKnowledge(app: App, article: Article, paths: FolderPaths, input: KnowledgeInput, categories: Category[]): Promise<TFile> {
  const previous = publicationQueues.get(app) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(async () => {
    const existing = await findKnowledge(app, article.key);
    if (existing) return existing;
    const matches: TFile[] = [];
    for (const file of app.vault.getMarkdownFiles()) {
      if ((file.path.startsWith(paths.bookmarks + '/') || file.path.startsWith(paths.inbox + '/')) &&
          getArticleKey((await frontmatter(app, file)) ?? {}) === article.key) matches.push(file);
    }
    const original = matches[0];
    if (matches.length !== 1 || !(original instanceof TFile) || !original.path.startsWith(paths.bookmarks + '/')) {
      throw Error('请先将唯一匹配的收藏保留到 Bookmarks，再正式入库。');
    }
    const title = input.title.trim();
    if (!title || title.length > 180 || /[<>:"/\\|?*#\[\]\u0000-\u001f]/.test(title) || /[. ]$/.test(title) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(title)) {
      throw Error('笔记标题不能用作文件名，请调整标题。');
    }
    const folder = normalizeVaultPath(input.folder || '20-Knowledge');
    const fold = (path: string) => path.normalize('NFC').toLowerCase();
    if (Object.values(paths).some(source => fold(folder) === fold(source) || fold(folder).startsWith(fold(source) + '/'))) {
      throw Error('知识笔记请选择收藏目录之外的位置。');
    }
    const target = folder + '/' + title + '.md';
    const samePath = (path: string) => path.normalize('NFC').toLowerCase() === target.normalize('NFC').toLowerCase();
    if (app.vault.getFiles().some(file => samePath(file.path)) || app.vault.getAbstractFileByPath(target)) throw Error('此目录已存在同名笔记，未覆盖。');
    const markdown = serializeKnowledge({ ...article, file: original, path: original.path }, { ...input, title }, categories);
    let current = '';
    for (const part of folder.split('/')) {
      current = current ? current + '/' + part : part;
      const entry = app.vault.getAbstractFileByPath(current);
      if (entry && !(entry instanceof TFolder)) throw Error('保存目录被同名文件占用。');
      if (!entry) await app.vault.createFolder(current);
    }
    return app.vault.create(target, markdown);
  });
  publicationQueues.set(app, result);
  return result;
}
