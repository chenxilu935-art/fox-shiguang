import { Notice, Plugin, TAbstractFile } from 'obsidian';
import {
  defaultCategories, defaultConfig, normalizeFolderPaths, validateConfig,
  type FolderPaths, type ShiguangConfig
} from './config';
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

    this.app.workspace.onLayoutReady(() => {
      if (!this.active) return;
      const vault = this.app.vault;
      this.registerEvent(vault.on('create', file => this.sourceChanged(file)));
      this.registerEvent(vault.on('modify', file => this.sourceChanged(file)));
      this.registerEvent(vault.on('delete', file => this.sourceChanged(file)));
      this.registerEvent(vault.on('rename', (file, oldPath) => this.sourceChanged(file, oldPath)));
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
    const update = this.saveQueue.then(async () => {
      if (!this.active) throw new Error('林间拾光室已停用。');
      const draft = structuredClone(this.config);
      change(draft);
      const next = validateConfig(draft);
      await this.saveData(next);
      this.config = next;
      if (this.active) await this.rescan();
    });
    this.saveQueue = update.catch(() => undefined);
    return update;
  }

  getSources(): SourceSnapshot {
    return this.snapshot ??= scanSources(this.app.vault, this.config.paths);
  }

  async rescan(): Promise<void> {
    this.snapshot = scanSources(this.app.vault, this.config.paths);
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
    this.refreshTimer = window.setTimeout(() => { void this.rescan(); }, 150);
  }

  openWizard(): void {
    if (this.wizard) return;
    this.wizard = new ShiguangWizard(this.app, this.config,
      (paths, useTemplate, aiEnabled) => this.finishWizard(paths, useTemplate, aiEnabled),
      () => { this.wizard = undefined; });
    this.wizard.open();
  }

  private async finishWizard(paths: FolderPaths, useTemplate: boolean, aiEnabled: boolean): Promise<void> {
    await this.updateConfig(draft => {
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
