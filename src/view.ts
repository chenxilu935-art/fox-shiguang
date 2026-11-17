import { ItemView, Modal, Notice, TFolder, setIcon, type App, type TAbstractFile, type WorkspaceLeaf } from 'obsidian';
import { readArticle, setArticleTopics, type Article } from './articles';
import { type Category, type FolderPaths } from './config';
import type FoxShiguangPlugin from './main';
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

type Filter = { kind: 'all' | 'uncategorized' } | { kind: 'topic'; id: string };

export class ShiguangView extends ItemView {
  private page?: Page;
  private filter: Filter = { kind: 'all' };
  private picker?: TopicPicker;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: FoxShiguangPlugin) {
    super(leaf);
  }

  getViewType(): string { return ROOM_VIEW; }
  getDisplayText(): string { return '狐の林间拾光室'; }
  getIcon(): string { return 'trees'; }

  async onOpen(): Promise<void> {
    this.page = undefined;
    this.filter = { kind: 'all' };
    await this.plugin.rescan();
    this.renderSources();
  }

  async onClose(): Promise<void> {
    this.picker?.close();
    this.picker = undefined;
    this.contentEl.empty();
  }

  renderSources(): void {
    const config = this.plugin.config;
    const page = this.page ?? config.defaultPage;
    const snapshot = this.plugin.getSources();
    const categories = new Map(config.categories.map(category => [category.id, category]));
    const root = this.contentEl;
    root.empty();
    root.addClass('fox-shiguang-room');
    const scene = root.createEl('header', { cls: 'fox-shiguang-scene' });
    scene.style.setProperty('--fox-shiguang-forest', `url("${forestDesk}")`);
    scene.createEl('h1', { text: '狐の林间拾光室' });

    const tabs = scene.createDiv({ cls: 'fox-shiguang-tabs', attr: { 'aria-label': '收藏目录' } });
    const pageLabels: Record<Page, string> = { inbox: '待整理 · Inbox', bookmarks: '已保留 · Bookmarks' };
    for (const key of ['inbox', 'bookmarks'] as const) {
      const button = tabs.createEl('button', { text: pageLabels[key] });
      button.setAttribute('aria-pressed', String(key === page));
      button.onclick = () => {
        this.page = key;
        this.renderSources();
      };
    }

    if (this.filter.kind === 'topic' && !categories.has(this.filter.id)) this.filter = { kind: 'all' };
    this.renderFilters(root, config.categories);
    const notes = snapshot.notes[page].filter(article => {
      const filter = this.filter;
      if (filter.kind === 'all') return true;
      if (article.topicState === 'invalid') return false;
      return filter.kind === 'topic' ? article.topics.includes(filter.id) : article.topics.length === 0;
    });
    notes.sort((left, right) =>
      left.title.localeCompare(right.title, 'zh-CN', { numeric: true }) || left.path.localeCompare(right.path));
    if (config.sort === 'name-desc') notes.reverse();

    const status = snapshot.status[page];
    if (status !== 'ready' || !notes.length) {
      const message = status === 'file' ? '此路径指向文件。请在插件设置中选择文件夹。'
        : status === 'missing' ? '收藏目录尚未创建。请在插件设置中检查来源。'
          : this.filter.kind === 'all' ? '此目录暂无可识别的小红书收藏。' : '当前目录没有符合筛选条件的收藏。';
      root.createEl('p', { text: message, cls: 'fox-shiguang-room-note' });
    }
    if (snapshot.skipped[page]) root.createEl('p', {
      text: `${snapshot.skipped[page]} 篇 Markdown 暂无可用的小红书原帖 ID。`, cls: 'fox-shiguang-room-note',
    });
    if (!notes.length) return;
    const grid = root.createDiv({ cls: 'fox-shiguang-grid' });
    for (const article of notes) this.renderCard(grid, article, categories, snapshot.duplicateKeys.has(article.key));
  }

  private renderFilters(root: HTMLElement, categories: Category[]): void {
    const group = root.createDiv({
      cls: 'fox-shiguang-filters', attr: { role: 'group', 'aria-label': '按主题筛选' },
    });
    const options: { name: string; target: Filter }[] = [
      { name: '全部', target: { kind: 'all' } },
      { name: '未分类', target: { kind: 'uncategorized' } },
      ...categories.map(({ name, id }) => ({ name, target: { kind: 'topic', id } as const })),
    ];
    for (const { name, target } of options) {
      const active = this.filter.kind === target.kind &&
        (target.kind !== 'topic' || (this.filter.kind === 'topic' && this.filter.id === target.id));
      const button = group.createEl('button', { text: name, attr: { 'aria-pressed': String(active) } });
      button.onclick = () => {
        this.filter = target;
        this.renderSources();
      };
    }
  }

  private renderCard(grid: HTMLElement, article: Article, categories: Map<string, Category>, duplicate: boolean): void {
    const card = grid.createEl('article', { cls: 'fox-shiguang-card', attr: { 'data-article-key': article.key } });
    const cover = card.createDiv({ cls: 'fox-shiguang-card-cover' });
    if (article.coverUrl) {
      cover.createEl('img', { attr: { src: article.coverUrl, alt: '', loading: 'lazy' } });
    } else {
      setIcon(cover, 'image');
      cover.createSpan({ text: '暂无封面' });
    }
    const copy = card.createDiv({ cls: 'fox-shiguang-card-copy' });
    copy.createEl('h2', { text: article.title });
    if (article.author) copy.createEl('p', { text: article.author, cls: 'fox-shiguang-room-note' });
    const topics = copy.createDiv({ cls: 'fox-shiguang-card-topics', attr: { 'aria-label': '已有主题' } });
    if (article.topicState === 'invalid') topics.createSpan({ text: '主题属性格式有误' });
    else if (!article.topics.length) topics.createSpan({ text: '未分类' });
    for (const id of new Set(article.topics)) {
      const category = categories.get(id);
      const chip = topics.createSpan({ text: category?.name ?? `未知主题 · ${id}`, cls: 'fox-shiguang-topic-chip' });
      if (category) chip.style.setProperty('--fox-shiguang-topic-color', category.color);
    }
    const actions = copy.createDiv({ cls: 'fox-shiguang-card-actions' });
    const open = actions.createEl('button', { text: '打开笔记' });
    open.onclick = () => {
      void this.app.workspace.getLeaf('tab').openFile(article.file).catch(() =>
        new Notice('无法打开这篇笔记，请重新扫描目录。'));
    };
    const edit = actions.createEl('button', { text: '设置主题' });
    edit.disabled = duplicate || article.topicState === 'invalid';
    if (duplicate) copy.createEl('p', { text: '原帖 ID 重复，请处理重复文件后编辑。', cls: 'fox-shiguang-room-note' });
    edit.onclick = () => {
      if (this.picker || article.topicState === 'invalid') return;
      const expected = { topics: [...article.topics], topicState: article.topicState };
      this.picker = new TopicPicker(this.app, article, this.plugin.config.categories, async ids => {
        const categories = new Set(this.plugin.config.categories.map(category => category.id));
        if (ids.some(id => !categories.has(id) && !expected.topics.includes(id))) {
          throw new Error('分类设置已变化，请重新打开文章后再选择。');
        }
        await setArticleTopics(this.app, () => this.plugin.config.paths, article.key, expected, ids);
        try {
          await this.plugin.rescan({ key: article.key, topics: ids });
        } catch {
          new Notice('主题已保存，可从插件设置重新扫描目录。');
        }
      }, () => { this.picker = undefined; });
      this.picker.open();
    };
  }
}

class TopicPicker extends Modal {
  private dismissed = false;

  constructor(
    app: App, private readonly article: Article, private readonly categories: Category[],
    private readonly onSave: (ids: string[]) => Promise<void>, private readonly onDismiss: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('设置主题');
    this.modalEl.addClass('fox-shiguang-topic-picker');
    const { contentEl, article, categories } = this;
    contentEl.createEl('p', { text: article.title, cls: 'fox-shiguang-topic-picker-title' });
    const selected = new Set(article.topics);
    const defined = new Set(categories.map(category => category.id));
    const options = [
      ...categories.map(({ id, name }) => ({ id, name })),
      ...[...selected].filter(id => !defined.has(id)).map(id => ({ id, name: `未知主题 · ${id}` })),
    ];
    if (!options.length) contentEl.createEl('p', { text: '可在 Obsidian 插件设置中添加主题分类。' });
    const choices = contentEl.createDiv({ cls: 'fox-shiguang-topic-choices' });
    const checkboxes = options.map(({ id, name }) => {
      const label = choices.createEl('label');
      const checkbox = label.createEl('input', { attr: { type: 'checkbox' } });
      checkbox.checked = selected.has(id);
      checkbox.onchange = () => {
        if (checkbox.checked) selected.add(id);
        else selected.delete(id);
      };
      label.createSpan({ text: name });
      return checkbox;
    });
    const error = contentEl.createEl('p', { cls: 'fox-shiguang-wizard-error', attr: { role: 'alert' } });
    const actions = contentEl.createDiv({ cls: 'fox-shiguang-wizard-actions' });
    const cancel = actions.createEl('button', { text: '取消' });
    cancel.onclick = () => this.close();
    const save = actions.createEl('button', { text: '保存主题', cls: 'mod-cta' });
    save.onclick = async () => {
      const unchanged = selected.size === article.topics.length && article.topics.every(id => selected.has(id));
      if (unchanged) {
        this.close();
        return;
      }
      [save, cancel, ...checkboxes].forEach(input => { input.disabled = true; });
      error.empty();
      try {
        await this.onSave([...selected]);
        if (!this.dismissed) this.close();
      } catch (cause) {
        error.setText(cause instanceof Error ? cause.message : '无法保存主题，请重试。');
        [save, cancel, ...checkboxes].forEach(input => { input.disabled = false; });
      }
    };
  }

  onClose(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    this.contentEl.empty();
    this.onDismiss();
  }
}
