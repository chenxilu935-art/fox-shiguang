import { App, Modal, Setting } from 'obsidian';
import {
  defaultCategories,
  FOLDER_LABELS,
  normalizeFolderPaths,
  type FolderPaths,
  type ShiguangConfig,
} from './config';

const STEPS = ['欢迎来到林间拾光室', '选择收藏目录', '初始化主题分类', '设置 AI', '完成设置'];

export class ShiguangWizard extends Modal {
  private step = 0;
  private paths: FolderPaths;
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
    this.paths = { ...config.paths };
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
      if (lastStep) {
        void this.finish(actions, error);
        return;
      }
      try {
        if (this.step === 1) this.paths = normalizeFolderPaths(this.paths);
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
    this.contentEl.createEl('p', { text: '填写 Vault 内的相对路径。目录暂时不存在时，也可以继续使用这些设置。' });
    for (const key of Object.keys(FOLDER_LABELS) as (keyof FolderPaths)[]) {
      const label = FOLDER_LABELS[key];
      new Setting(this.contentEl)
        .setName(label)
        .addText(text => {
          text.inputEl.setAttribute('aria-label', label);
          text.setValue(this.paths[key]).onChange(value => { this.paths[key] = value; });
        });
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
      await this.complete(normalizeFolderPaths(this.paths), this.useTemplate, this.aiEnabled);
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
