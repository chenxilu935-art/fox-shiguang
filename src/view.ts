import { ItemView, Notice, TFolder, type TFile, type Vault, type WorkspaceLeaf } from 'obsidian';
import { FOLDER_LABELS, type FolderPaths } from './config';
import type FoxShiguangPlugin from './main';

export const ROOM_VIEW = 'fox-shiguang-room';
type Page = 'inbox' | 'bookmarks';
type SourceStatus = 'ready' | 'missing' | 'file';

export interface SourceSnapshot {
  status: Record<keyof FolderPaths, SourceStatus>;
  notes: Record<Page, TFile[]>;
}

export function scanSources(vault: Vault, paths: FolderPaths): SourceSnapshot {
  const status = {
    inbox: folderStatus(vault, paths.inbox),
    bookmarks: folderStatus(vault, paths.bookmarks),
    cache: folderStatus(vault, paths.cache),
    covers: folderStatus(vault, paths.covers)
  };
  const files = vault.getMarkdownFiles();
  return {
    status,
    notes: {
      inbox: status.inbox === 'ready' ? files.filter(file => file.path.startsWith(paths.inbox + '/')) : [],
      bookmarks: status.bookmarks === 'ready' ? files.filter(file => file.path.startsWith(paths.bookmarks + '/')) : []
    }
  };
}

function folderStatus(vault: Vault, path: string): SourceStatus {
  const entry = vault.getAbstractFileByPath(path);
  return entry instanceof TFolder ? 'ready' : entry ? 'file' : 'missing';
}

export class ShiguangView extends ItemView {
  private page?: Page;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: FoxShiguangPlugin) {
    super(leaf);
  }

  getViewType(): string { return ROOM_VIEW; }
  getDisplayText(): string { return '狐の林间拾光室'; }
  getIcon(): string { return 'trees'; }

  async onOpen(): Promise<void> {
    this.page = undefined;
    await this.plugin.rescan();
    this.renderSources();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  renderSources(): void {
    const config = this.plugin.config;
    const page = this.page ?? config.defaultPage;
    const snapshot = this.plugin.getSources();
    const root = this.contentEl;
    root.empty();
    root.addClass('fox-shiguang-room');
    root.createEl('h1', { text: '狐の林间拾光室' });

    const tabs = root.createDiv({ cls: 'fox-shiguang-tabs' });
    const pageLabels: Record<Page, string> = { inbox: '待整理 · Inbox', bookmarks: '已保留 · Bookmarks' };
    for (const key of ['inbox', 'bookmarks'] as const) {
      const button = tabs.createEl('button', { text: pageLabels[key] });
      button.setAttribute('aria-pressed', String(key === page));
      button.onclick = () => {
        this.page = key;
        this.renderSources();
      };
    }

    root.createEl('h2', { text: '目录预览' });
    root.createEl('p', { text: config.paths[page], cls: 'fox-shiguang-path' });
    const notes = [...snapshot.notes[page]].sort((left, right) =>
      left.basename.localeCompare(right.basename, 'zh-CN', { numeric: true }) || left.path.localeCompare(right.path));
    if (config.sort === 'name-desc') notes.reverse();
    const status = snapshot.status[page];
    if (status !== 'ready' || !notes.length) {
      const message = status === 'file' ? '此路径指向文件。请在插件设置中选择文件夹。'
        : status === 'missing' ? '目录尚未创建。可在插件设置中填写现有收藏路径。'
          : '此目录暂无 Markdown 文件。';
      root.createEl('p', { text: message });
    } else {
      root.createEl('p', { text: `${notes.length} 个 Markdown 文件` });
      const list = root.createEl('ul', { cls: 'fox-shiguang-file-list' });
      for (const note of notes) {
        const button = list.createEl('li').createEl('button', { text: note.basename });
        button.title = note.path;
        button.onclick = () => {
          void this.app.workspace.getLeaf('tab').openFile(note).catch(() =>
            new Notice('无法打开这篇笔记，请重新扫描目录。'));
        };
      }
    }

    const media = root.createEl('dl', { cls: 'fox-shiguang-media-sources' });
    for (const key of ['cache', 'covers'] as const) {
      media.createEl('dt', { text: FOLDER_LABELS[key] });
      const label = snapshot.status[key] === 'ready' ? '已找到'
        : snapshot.status[key] === 'file' ? '此路径指向文件' : '尚未创建';
      media.createEl('dd', { text: `${config.paths[key]} · ${label}` });
    }
  }
}
