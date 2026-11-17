import { App, Modal, Setting } from 'obsidian';
import {
  DEFAULT_PATHS,
  DEFAULT_ROOT,
  defaultCategories,
  derivePaths,
  inferRoot,
  type FolderPaths,
  type ShiguangConfig,
} from './config';
import { detectCollectionFolders, initializeFolders, useExistingFolders } from './folders';

const STEPS = ['欢迎来到林间拾光室', '选择收藏目录', '初始化主题分类', '设置 AI', '完成设置'];

export class ShiguangWizard extends Modal {
  private step = 0;
  private paths: FolderPaths;
  private readonly initialPaths: FolderPaths;
  private root: string;
  private readonly initialRoot: string;
  private readonly recognized: boolean;
  private readonly canCreateDefault: boolean;
  private creatingFolders = false;
  private readonly canSeedCategories: boolean;
  private useTemplate: boolean;
  private aiEnabled: boolean;
  private saving = false;
  private closed = false;

  constructor(
    app: App,
    config: ShiguangConfig,
    private readonly complete: (paths: FolderPaths, useTemplate: boolean, aiEnabled: boolean) => Promise<void>,
    private readonly onDismiss: () => void,
  ) {
    super(app);
    const existing = detectCollectionFolders(app.vault, config);
    this.initialPaths = { ...(existing ?? config.paths) };
    this.paths = this.initialPaths;
    this.root = inferRoot(this.paths) ?? '';
    this.initialRoot = this.root;
    this.recognized = Boolean(existing);
    this.canCreateDefault = !config.initialized && (!existing || this.root === DEFAULT_ROOT);
    this.canSeedCategories = !config.initialized && config.categories.length === 0;
    this.useTemplate = this.canSeedCategories;
    this.aiEnabled = config.ai.enabled;
  }

  onOpen() {
    this.closed = false;
    this.modalEl.addClass('fox-shiguang-wizard');
    this.setTitle('林间拾光室 · 设置向导');
    this.render();
  }

  onClose() {
    this.closed = true;
    this.contentEl.empty();
    this.onDismiss();
  }

  private render() {
    const content = this.contentEl;
    content.empty();
    content.createEl('p', {
      cls: 'fox-shiguang-wizard-progress',
      text: `第 ${this.step + 1} 步，共 ${STEPS.length} 步`,
    });
    const heading = content.createEl('h3', { text: STEPS[this.step] });
    heading.tabIndex = -1;

    switch (this.step) {
      case 0:
        content.createEl('p', { text: '设置本地收藏目录，选择一套起始主题。你可以在 Obsidian 的插件设置中随时调整。' });
        break;
      case 1:
        this.renderPaths();
        break;
      case 2:
        this.renderCategories();
        break;
      case 3:
        new Setting(content)
          .setName('启用 AI 辅助')
          .setDesc('默认为关闭。此选项保存你的偏好，模型功能将在后续版本接入。')
          .addToggle(toggle => toggle.setValue(this.aiEnabled).onChange(value => { this.aiEnabled = value; }));
        break;
      case 4:
        content.createEl('p', { text: '保存本次选择，进入拾光室。你可以稍后从插件设置重新运行向导。' });
        break;
    }

    const error = content.createEl('p', { cls: 'fox-shiguang-wizard-error', attr: { role: 'alert' } });
    const actions = content.createDiv({ cls: 'fox-shiguang-wizard-actions' });
    const dismiss = actions.createEl('button', { text: '稍后设置', attr: { type: 'button' } });
    dismiss.addEventListener('click', () => this.close());

    if (this.step > 0) {
      const back = actions.createEl('button', { text: '上一步', attr: { type: 'button' } });
      back.addEventListener('click', () => {
        this.step -= 1;
        this.render();
      });
    }

    const lastStep = this.step === STEPS.length - 1;
    const next = actions.createEl('button', {
      cls: 'mod-cta',
      text: lastStep ? '保存并进入拾光室' : this.step === 0 ? '开始设置' : '继续',
      attr: { type: 'button' },
    });
    next.addEventListener('click', () => {
      if (this.creatingFolders) return;
      if (lastStep) {
        void this.finish(actions, error);
        return;
      }
      try {
        if (this.step === 1) {
          this.paths = this.root === this.initialRoot
            ? this.initialPaths
            : useExistingFolders(this.app.vault, derivePaths(this.root));
        }
      } catch (cause) {
        error.setText(cause instanceof Error ? cause.message : '请检查收藏目录。');
        return;
      }
      this.step += 1;
      this.render();
    });
    heading.focus();
  }

  private renderPaths() {
    this.contentEl.createEl('p', {
      text: this.recognized
        ? '已找到现有收藏文件夹。继续可沿用它，也可填写另一处已存在的收藏根目录。'
        : this.canCreateDefault
          ? '可创建默认目录，或填写 Vault 内已经存在的收藏根目录。'
          : '可保留当前设置，或填写 Vault 内已经存在的收藏根目录。'
    });
    new Setting(this.contentEl)
      .setName('收藏根目录')
      .setDesc(this.initialRoot
        ? '在根目录下使用 RedNote/Inbox、Bookmarks、Cache 和 Covers。'
        : '当前沿用独立配置的路径。留空继续保留，或选择已有的标准目录。')
      .addText(text => {
        text.inputEl.setAttribute('aria-label', '收藏根目录');
        text.setPlaceholder(DEFAULT_ROOT).setValue(this.root).onChange(value => { this.root = value; });
      });
    if (this.canCreateDefault) {
      const status = this.contentEl.createEl('p', { attr: { role: 'status' } });
      new Setting(this.contentEl)
        .setName('默认收藏目录')
        .setDesc('在小红书raw/RedNote 下补齐四个子目录，保留现有文件。')
        .addButton(button => button.setButtonText('一键创建默认目录').onClick(async () => {
          if (this.root !== DEFAULT_ROOT) {
            status.setText('请先将收藏根目录设为「小红书raw」，或直接选择已有目录。');
            return;
          }
          this.creatingFolders = true;
          button.setDisabled(true);
          try {
            await initializeFolders(this.app.vault, DEFAULT_PATHS);
            status.setText('默认目录已准备完成。');
          } catch (error) {
            status.setText(error instanceof Error ? error.message : '未能创建默认目录。');
          } finally {
            this.creatingFolders = false;
            button.setDisabled(false);
          }
        }));
    }
  }

  private renderCategories() {
    if (!this.canSeedCategories) {
      this.contentEl.createEl('p', { text: '保留当前分类设置，包括你已经清空的分类。' });
      return;
    }
    new Setting(this.contentEl)
      .setName('使用通用分类模板')
      .setDesc('可以跳过。分类可在插件设置中添加或调整。')
      .addToggle(toggle => toggle.setValue(this.useTemplate).onChange(value => { this.useTemplate = value; }));
    const categories = defaultCategories().map(category => category.name);
    this.contentEl.createEl('p', { text: categories.join('、') });
  }

  private async finish(actions: HTMLElement, error: HTMLElement) {
    if (this.saving) return;
    this.saving = true;
    const buttons = actions.querySelectorAll('button');
    buttons.forEach(button => { button.disabled = true; });
    error.empty();
    try {
      await this.complete(this.paths, this.useTemplate, this.aiEnabled);
      if (!this.closed) this.close();
    } catch (cause) {
      if (!this.closed) {
        error.setText(cause instanceof Error ? cause.message : '设置保存失败，请重试。');
      }
    } finally {
      this.saving = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }
}
