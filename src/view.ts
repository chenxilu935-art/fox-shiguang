import { ItemView, Notice, TFile, TFolder, type App, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import { readArticle, setArticleTopics, type Article } from './articles';
import { createCategory, type FolderPaths } from './config';
import { readOriginal } from './reader';
import { retainArticles, trashArticles } from './operations';
import type FoxShiguangPlugin from './main';
import template from './ui/shell.html';
import stylesheet from './ui/forest.css';
import ui from './ui/ui.js';
import forestDesk from '../assets/forest-desk.jpg';

export const ROOM_VIEW = 'fox-shiguang-room';
type Page = 'inbox' | 'bookmarks';
type SourceStatus = 'ready' | 'missing' | 'file';

export interface SourceSnapshot {
  status: Record<keyof FolderPaths, SourceStatus>;
  notes: Record<Page, Article[]>;
  skipped: Record<Page, number>;
  duplicateKeys: Set<string>;
}

export function scanSources(app: App, paths: FolderPaths): SourceSnapshot {
  const folderStatus = (entry: TAbstractFile | null): SourceStatus =>
    entry instanceof TFolder ? 'ready' : entry ? 'file' : 'missing';
  const status = {
    inbox: folderStatus(app.vault.getAbstractFileByPath(paths.inbox)),
    bookmarks: folderStatus(app.vault.getAbstractFileByPath(paths.bookmarks)),
    cache: folderStatus(app.vault.getAbstractFileByPath(paths.cache)),
    covers: folderStatus(app.vault.getAbstractFileByPath(paths.covers)),
  };
  const notes: SourceSnapshot['notes'] = { inbox: [], bookmarks: [] };
  const skipped = { inbox: 0, bookmarks: 0 };
  const seenKeys = new Set<string>();
  const duplicateKeys = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const page = file.path.startsWith(paths.inbox + '/') ? 'inbox'
      : file.path.startsWith(paths.bookmarks + '/') ? 'bookmarks' : undefined;
    if (!page || status[page] !== 'ready') continue;
    const article = readArticle(app, file, paths);
    if (!article) {
      skipped[page]++;
      continue;
    }
    if (seenKeys.has(article.key)) duplicateKeys.add(article.key);
    seenKeys.add(article.key);
    notes[page].push(article);
  }
  return { status, notes, skipped, duplicateKeys };
}


/** Sandboxed original forest UI; all file operations remain in the plugin host. */
export class ShiguangView extends ItemView {
  private frame?: HTMLIFrameElement;
  private token = crypto.randomUUID();
  private page?: Page;
  private generation = 0;
  private revision = 0;
  private current = new Map<string, Article>();
  private readerLinks = new Map<string, Set<string>>();
  private closed = false;
  private operating = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: FoxShiguangPlugin) { super(leaf); }
  getViewType(): string { return ROOM_VIEW; }
  getDisplayText(): string { return '狐の林间拾光室'; }
  getIcon(): string { return 'trees'; }
  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.empty(); this.contentEl.addClass('fox-shiguang-room');
    this.contentEl.style.cssText = 'padding:0;overflow:hidden';
    this.frame = this.contentEl.createEl('iframe', { attr: { title: '林间拾光室', sandbox: 'allow-scripts allow-modals' } });
    this.frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#071d15';
    this.registerDomEvent(window, 'message', event => { void this.receive(event); });
    const script = `const SHIGUANG_TOKEN=${JSON.stringify(this.token)};const SHIGUANG_SOURCE={page:'inbox',counts:{inbox:0,bookmarks:0},ai:false};const SHIGUANG_ITEMS=[];const SHIGUANG_TOPICS={data:{revision:0,categories:[],assignments:{}}};${ui}`;
    this.frame.srcdoc = template.replace('/*SHIGUANG_STYLE*/', () => stylesheet).replace('__SHIGUANG_HERO__', () => forestDesk).replace('/*SHIGUANG_SCRIPT*/', () => script);
    this.frame.onload = () => { this.renderSources(); };
    await this.plugin.rescan();
  }
  async onClose(): Promise<void> { this.closed = true; this.generation++; this.current.clear(); this.readerLinks.clear(); this.frame = undefined; this.contentEl.empty(); }
  private post(type: string, data: Record<string, unknown> = {}): void { this.frame?.contentWindow?.postMessage({ type, token: this.token, ...data }, '*'); }
  private topics() {
    const assignments: Record<string, string[]> = {};
    for (const article of this.current.values()) assignments[article.key] = article.topics;
    return { data: { revision: this.revision, categories: this.plugin.config.categories, assignments } };
  }
  renderSources(): void { void this.publish().catch(() => { if (!this.closed) new Notice('无法刷新收藏，请重新扫描目录。'); }); }
  private async publish(): Promise<void> {
    const generation = ++this.generation;
    const config = this.plugin.config, snapshot = this.plugin.getSources(), page = this.page ?? config.defaultPage;
    const notes = snapshot.notes[page]; this.current = new Map(notes.map(article => [article.key, article]));
    this.revision++;
    const items = await Promise.all(notes.map(async article => ({
      id: article.key, fingerprint: `${article.path}:${article.file.stat.mtime}:${article.file.stat.size}`, topicKey: article.key, title: article.title, author: article.author, source: article.author || '',
      sourceUrl: article.sourceUrl, noteId: article.key.slice(4), tags: article.tags || [], summary: article.summary || '', selected: false,
      invalid: article.topicState === 'invalid' || snapshot.duplicateKeys.has(article.key),
      coverUrl: await this.coverData(article),
    })));
    if (this.closed || generation !== this.generation) return;
    const status = snapshot.status[page];
    const error = status === 'file' ? '收藏目录指向文件，请在插件设置中检查来源。' : status === 'missing' ? '收藏目录尚未创建，请在插件设置中检查来源。' : undefined;
    const info = { page, counts: { inbox: snapshot.notes.inbox.length, bookmarks: snapshot.notes.bookmarks.length }, ai: config.ai.enabled, sort: config.sort, error,
      warnings: [snapshot.skipped[page] ? `${snapshot.skipped[page]} 篇 Markdown 暂无可用的原帖 ID` : '', snapshot.duplicateKeys.size ? '存在重复原帖 ID，相关主题与文件操作已暂停' : ''].filter(Boolean) };
    this.post('fox-shiguang-source', { info, items, topics: this.topics() });
  }
  private async coverData(article: Article): Promise<string | undefined> {
    if (!article.coverUrl) return;
    // Original opaque iframe needs bytes, never a machine-specific app:// URL.
    const image = this.app.vault.getFiles().find(file => this.app.vault.getResourcePath(file) === article.coverUrl);
    if (!image || image.stat.size > 5 * 1024 * 1024) return;
    try {
      const bytes = new Uint8Array(await this.app.vault.readBinary(image));
      let binary = ''; for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
      const extension = image.extension.toLowerCase();
      return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${btoa(binary)}`;
    } catch { return; }
  }
  private async receive(event: MessageEvent): Promise<void> {
    const m = event.data;
    if (this.closed || event.source !== this.frame?.contentWindow || m?.token !== this.token) return;
    try {
      if (m.type === 'fox-shiguang-switch-page' && (m.page === 'inbox' || m.page === 'bookmarks')) { this.page = m.page; await this.publish(); return; }
      if (m.type === 'fox-shiguang-topics') { await this.editTopics(m); return; }
      if (m.type === 'fox-shiguang-read-original' && Number.isSafeInteger(m.request)) {
        if (m.revision !== this.revision) throw new Error('收藏已变化，请重新打开阅读。');
        const generation = this.generation;
        const article = this.current.get(m.key); if (!article) throw new Error('文章已移走，请重新扫描。');
        const result = await readOriginal(this.app, article, this.plugin.config.paths);
        if (this.closed || generation !== this.generation || this.current.get(m.key) !== article) return;
        this.readerLinks.set(m.key, new Set(result.links)); this.post('fox-shiguang-original-result', { key: m.key, request: m.request, result }); return;
      }
      if (m.type === 'fox-shiguang-open-reader-link' && typeof m.url === 'string' && /^https?:\/\//i.test(m.url) && this.readerLinks.get(m.key)?.has(m.url)) { window.open(m.url, '_blank', 'noopener,noreferrer'); return; }
      if (m.type === 'fox-shiguang-collection-action') {
        if (m.revision !== this.revision) throw new Error('收藏已变化，请重新选择。');
        if (this.operating || !['retain', 'trash'].includes(m.action) || !Array.isArray(m.keys) || !m.keys.length || m.keys.length > 10000) return;
        const keys = [...new Set<string>(m.keys)];
        const articles = keys.map(key => this.current.get(key));
        if (articles.some(article => !article)) throw new Error('收藏已变化，请重新选择。');
        this.operating = true;
        try {
          const operation = m.action === 'retain' ? retainArticles : trashArticles;
          const result = await operation(this.app, () => this.plugin.config.paths, articles as Article[]);
          await this.plugin.rescan(); this.post('fox-shiguang-collection-result', { ...result });
        } finally { this.operating = false; }
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : '操作失败，请重试。';
      if (m.type === 'fox-shiguang-read-original') this.post('fox-shiguang-original-result', { key: m.key, request: m.request, error });
      else if (m.type === 'fox-shiguang-collection-action') this.post('fox-shiguang-collection-result', { error });
      else new Notice(error);
    }
  }
  private async editTopics(m: any): Promise<void> {
    if (!Number.isSafeInteger(m.request)) return;
    let error: string | undefined;
    try {
      if (m.revision !== this.revision) throw new Error('收藏或分类已变化，请重新打开主题选择。');
      const action = m.action;
      if (!action || typeof action.type !== 'string') throw new Error('主题操作无效。');
      if (action.type === 'assign') {
        const article = this.current.get(action.key), available = new Set(this.plugin.config.categories.map(t => t.id));
        if (!article || article.topicState === 'invalid' || this.plugin.getSources().duplicateKeys.has(article.key)) throw new Error('文章主题格式有误或 ID 重复，请先在笔记中处理。');
        if (!Array.isArray(action.ids) || action.ids.some((id: unknown) => typeof id !== 'string' || (!available.has(id) && !article.topics.includes(id)))) throw new Error('主题已变化，请重新选择。');
        const unknown = article.topics.filter(id => !available.has(id));
        const ids = [...new Set<string>([...action.ids, ...unknown])];
        await setArticleTopics(this.app, () => this.plugin.config.paths, article.key, { topics: [...article.topics], topicState: article.topicState }, ids);
        await this.plugin.rescan({ key: article.key, topics: ids });
      } else {
        await this.plugin.updateConfig(draft => {
          const index = draft.categories.findIndex(t => t.id === action.id);
          if (action.type === 'create') draft.categories.push(createCategory(action.name));
          else if (index < 0) throw new Error('主题已删除，请重新打开。');
          else if (action.type === 'rename') draft.categories[index].name = action.name.trim();
          else if (action.type === 'delete') draft.categories.splice(index, 1);
          else if (action.type === 'move') { const target = index + (action.direction === 'up' ? -1 : 1); if (target >= 0 && target < draft.categories.length) [draft.categories[index], draft.categories[target]] = [draft.categories[target], draft.categories[index]]; }
          else throw new Error('未知主题操作。');
        });
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : '主题保存失败。'; }
    this.post('fox-shiguang-topics-result', { request: m.request, snapshot: this.topics(), error });
  }
}
