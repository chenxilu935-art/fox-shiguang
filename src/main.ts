import { Notice, Plugin, TFolder, type TAbstractFile } from 'obsidian';
import {
  defaultCategories, defaultConfig, normalizeFolderPaths, validateConfig,
  type FolderPaths, type ShiguangConfig
} from './config';
import { followFolderRename, prepareRootMove } from './folders';
import { LegacyPreviewModal } from './legacy';
import { ShiguangSettingsTab } from './settings';
import { ROOM_VIEW, ShiguangView, scanSources, type SourceSnapshot } from './view';
import { ShiguangWizard } from './wizard';

export default class FoxShiguangPlugin extends Plugin {
  config: ShiguangConfig = defaultConfig();
  private wizard?: ShiguangWizard;
  private settingsTab?: ShiguangSettingsTab;
  private saveQueue: Promise<void> = Promise.resolve();
  private refreshTimer?: number;
  private active = false;
  private snapshot?: SourceSnapshot;
  private rootMove?: { from: string; to: string };

  async onload(): Promise<void> {
    try {
      const saved: unknown = await this.loadData();
      this.config = saved === null || saved === undefined ? defaultConfig() : validateConfig(saved);
    } catch (error) {
      new Notice('林间拾光室设置无法读取。原设置已保留，请检查插件数据。');
      throw error;
    }

    this.active = true;
    this.registerView(ROOM_VIEW, leaf => new ShiguangView(leaf, this));
    this.addCommand({
      id: 'open',
      name: '打开拾光室',
      callback: () => { void this.openRoom(); }
    });
    this.settingsTab = new ShiguangSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    const metadata = this.app.metadataCache;
    const firstIndex = metadata.on('resolved', () => {
      metadata.offref(firstIndex);
      void this.refreshAfterSettings();
    });
    this.registerEvent(firstIndex);
    this.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      const vault = this.app.vault;
      this.registerEvent(vault.on('create', file => this.sourceChanged(file)));
      this.registerEvent(vault.on('modify', file => this.sourceChanged(file)));
      this.registerEvent(vault.on('delete', file => this.sourceChanged(file)));
      this.registerEvent(vault.on('rename', (file, oldPath) => {
        const move = this.rootMove;
        const alreadyTracked = move && ((oldPath === move.from && file.path === move.to) ||
          (oldPath === move.to && file.path === move.from));
        if (file instanceof TFolder && !alreadyTracked) {
          void this.followRename(oldPath, file.path);
        }
        this.sourceChanged(file, oldPath);
      }));
      this.registerEvent(metadata.on('changed', file => this.sourceChanged(file)));
      if (!this.config.initialized) this.openWizard();
    });
  }

  onunload(): void {
    this.active = false;
    window.clearTimeout(this.refreshTimer);
    this.wizard?.close();
    this.app.workspace.detachLeavesOfType(ROOM_VIEW);
  }

  updateConfig(change: (draft: ShiguangConfig) => void): Promise<void> {
    return this.queueSettings(async () => {
      const draft = structuredClone(this.config);
      change(draft);
      await this.persistConfig(draft);
    }).then(() => this.refreshAfterSettings());
  }

  private queueSettings(run: () => Promise<void>): Promise<void> {
    const update = this.saveQueue.then(async () => {
      if (!this.active) throw new Error('林间拾光室已停用。');
      await run();
    });
    this.saveQueue = update.catch(() => undefined);
    return update;
  }

  private async persistConfig(draft: ShiguangConfig): Promise<void> {
    const next = validateConfig(draft);
    await this.saveData(next);
    this.config = next;
  }

  private async refreshAfterSettings(): Promise<void> {
    if (!this.active) return;
    try {
      await this.rescan();
    } catch {
      new Notice('无法刷新收藏目录，请在设置中重新扫描。');
    }
  }

  async moveCollectionRoot(root: string, expectedRoot: string): Promise<void> {
    await this.queueSettings(async () => {
      if (this.config.root !== expectedRoot) throw new Error('收藏根目录已变更，请重新确认移动。');
      const plan = prepareRootMove(this.app, this.config, root);
      this.rootMove = { from: expectedRoot, to: plan.root };
      try {
        await plan.move();
        await this.persistConfig({ ...this.config, root: plan.root, paths: plan.paths });
      } catch (error) {
        try {
          await plan.rollback();
        } catch {
          throw new Error(`原设置已保留，无法自动恢复文件夹。请在 Vault 核对原目录及「${plan.root}」后选用已有目录。`);
        }
        throw error;
      } finally {
        this.rootMove = undefined;
      }
    });
    await this.refreshAfterSettings();
  }

  private async followRename(oldPath: string, newPath: string): Promise<void> {
    let followed = false;
    try {
      await this.queueSettings(async () => {
        const next = followFolderRename(this.config, oldPath, newPath);
        if (!next) return;
        await this.persistConfig({ ...this.config, ...next });
        followed = true;
      });
      if (followed) {
        if (this.settingsTab?.containerEl.isConnected) this.settingsTab.display();
        await this.refreshAfterSettings();
      }
    } catch {
      if (this.active) new Notice('未能保存收藏路径变更。请在插件设置中核对目录。');
    }
  }

  getSources(): SourceSnapshot {
    return this.snapshot ??= scanSources(this.app, this.config.paths);
  }

  async rescan(saved?: { key: string; topics: string[] }): Promise<void> {
    this.snapshot = scanSources(this.app, this.config.paths);
    if (saved) {
      const matches = [...this.snapshot.notes.inbox, ...this.snapshot.notes.bookmarks]
        .filter(article => article.key === saved.key);
      if (matches.length === 1) {
        matches[0].topics = saved.topics;
        matches[0].topicState = 'valid';
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(ROOM_VIEW)) {
      if (leaf.view instanceof ShiguangView) leaf.view.renderSources();
    }
  }

  private sourceChanged(file: TAbstractFile, oldPath?: string): void {
    if (!this.config.autoRefresh) return;
    const withinSource = (path: string) => Object.values(this.config.paths).some(folder =>
      path === folder || path.startsWith(folder + '/') || folder.startsWith(path + '/'));
    if (!withinSource(file.path) && !(oldPath && withinSource(oldPath))) return;
    window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      if (this.active && this.config.autoRefresh) void this.refreshAfterSettings();
    }, 150);
  }

  openLegacyPreview(): void {
    void this.rescan().then(() => {
      if (this.active) new LegacyPreviewModal(this.app, this).open();
    }).catch(() => new Notice('无法读取收藏目录，请先检查来源设置。'));
  }

  openWizard(): void {
    if (this.wizard) return;
    const openedPaths = this.config.paths;
    this.wizard = new ShiguangWizard(this.app, this.config,
      (paths, useTemplate, aiEnabled) => this.finishWizard(paths, useTemplate, aiEnabled, openedPaths),
      () => { this.wizard = undefined; });
    this.wizard.open();
  }

  private async finishWizard(paths: FolderPaths, useTemplate: boolean, aiEnabled: boolean, openedPaths: FolderPaths): Promise<void> {
    await this.updateConfig(draft => {
      if ((Object.keys(openedPaths) as (keyof FolderPaths)[]).some(key => draft.paths[key] !== openedPaths[key])) {
        throw new Error('收藏路径已在其他位置变更，请关闭并重新打开向导。');
      }
      draft.paths = normalizeFolderPaths(paths);
      if (!draft.initialized && !draft.categories.length && useTemplate) {
        draft.categories = defaultCategories();
      }
      draft.ai.enabled = aiEnabled;
      draft.initialized = true;
    });
    if (!this.active) return;
    if (this.settingsTab?.containerEl.isConnected) this.settingsTab.display();
    await this.openRoom();
  }

  private async openRoom(): Promise<void> {
    try {
      const workspace = this.app.workspace;
      const leaf = workspace.getLeavesOfType(ROOM_VIEW)[0] ?? workspace.getLeaf('tab');
      if (leaf.getViewState().type !== ROOM_VIEW) await leaf.setViewState({ type: ROOM_VIEW, active: true });
      await workspace.revealLeaf(leaf);
    } catch {
      new Notice('无法打开林间拾光室，请从命令面板重试。');
    }
  }
}
