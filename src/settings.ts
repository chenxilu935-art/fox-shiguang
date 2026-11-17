import { App, getIcon, Modal, Notice, PluginSettingTab, setIcon, Setting } from 'obsidian';
import { createCategory, defaultCategories, DEFAULT_PATHS, FOLDER_LABELS, normalizeVaultPath } from './config';
import type { Category, FolderPaths, ShiguangConfig } from './config';
import type FoxShiguangPlugin from './main';

export class ShiguangSettingsTab extends PluginSettingTab {
    constructor(app: App, private readonly plugin: FoxShiguangPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: '狐の林间拾光室' });
        this.showSources(containerEl);
        this.showCategories(containerEl.createDiv());
        this.showBrowsing(containerEl);
        this.showAI(containerEl.createDiv());
        this.showAbout(containerEl);
    }

    private async save(change: (draft: ShiguangConfig) => void): Promise<boolean> {
        try {
            await this.plugin.updateConfig(change);
            return true;
        } catch (error) {
            new Notice(error instanceof Error ? error.message : '未能保存设置。');
            return false;
        }
    }

    private showSources(container: HTMLElement): void {
        new Setting(container).setName('内容来源').setHeading();
        const pending = { ...this.plugin.config.paths };
        const keys = Object.keys(FOLDER_LABELS) as (keyof FolderPaths)[];
        for (const key of keys) {
            const label = FOLDER_LABELS[key];
            new Setting(container).setName(label).addText(text => {
                text.inputEl.setAttribute('aria-label', label);
                text.setPlaceholder(DEFAULT_PATHS[key]).setValue(pending[key]).onChange(value => {
                    pending[key] = value;
                });
            });
        }
        new Setting(container).setName('收藏文件夹')
            .setDesc('填写当前 Vault 内的相对路径。保存路径不会移动文件。')
            .addButton(button => button.setButtonText('保存路径').onClick(async () => {
                button.setDisabled(true);
                const saved = await this.save(draft => {
                    for (const key of keys) draft.paths[key] = normalizeVaultPath(pending[key]);
                });
                button.setDisabled(false);
                if (saved) new Notice('收藏目录已保存。');
            }));
        new Setting(container).setName('自动刷新')
            .setDesc('收藏文件夹内的文件发生变化时更新统计。')
            .addToggle(toggle => {
                toggle.toggleEl.setAttribute('aria-label', '自动刷新');
                toggle.setValue(this.plugin.config.autoRefresh).onChange(async value => {
                    if (!await this.save(draft => { draft.autoRefresh = value; })) {
                        toggle.setValue(this.plugin.config.autoRefresh);
                    }
                });
            });
        new Setting(container).setName('重新扫描')
            .setDesc('读取已保存的目录设置并刷新文件统计。')
            .addButton(button => button.setButtonText('重新扫描').onClick(async () => {
                button.setDisabled(true);
                try {
                    await this.plugin.rescan();
                    new Notice('文件统计已更新。');
                } catch (error) {
                    new Notice(error instanceof Error ? error.message : '扫描目录失败。');
                } finally {
                    button.setDisabled(false);
                }
            }));
    }

    private showCategories(container: HTMLElement): void {
        container.empty();
        new Setting(container).setName('主题分类').setHeading();
        const categories = this.plugin.config.categories;
        for (const [index, category] of categories.entries()) {
            const row = new Setting(container).setName(category.name);
            const icon = row.nameEl.createSpan();
            icon.setAttribute('aria-hidden', 'true');
            icon.style.color = category.color;
            setIcon(icon, category.icon);
            row.nameEl.prepend(icon, ' ');
            const move = async (direction: number) => {
                const saved = await this.save(draft => {
                    const current = draft.categories.findIndex(item => item.id === category.id);
                    const destination = current + direction;
                    if (current < 0 || destination < 0 || destination >= draft.categories.length) return;
                    const [item] = draft.categories.splice(current, 1);
                    draft.categories.splice(destination, 0, item);
                });
                if (saved) this.showCategories(container);
            };
            row.addExtraButton(button => button.setIcon('arrow-up').setTooltip(`上移 ${category.name}`)
                .setDisabled(index === 0).onClick(() => move(-1)));
            row.addExtraButton(button => button.setIcon('arrow-down').setTooltip(`下移 ${category.name}`)
                .setDisabled(index === categories.length - 1).onClick(() => move(1)));
            row.addButton(button => button.setButtonText('编辑').setTooltip(`编辑 ${category.name}`)
                .onClick(() => this.editCategory(container, category)));
            row.addExtraButton(button => button.setIcon('trash-2').setTooltip(`删除 ${category.name}`)
                .onClick(() => this.confirmCategoryChange(
                    container, `删除「${category.name}」`, '删除分类',
                    draft => { draft.categories = draft.categories.filter(item => item.id !== category.id); },
                )));
        }
        new Setting(container).setName('添加分类')
            .addButton(button => button.setButtonText('添加分类').onClick(() => this.editCategory(container)));
        new Setting(container).setName('恢复默认分类模板')
            .setDesc('将分类列表重置为通用模板。收藏文件会保留。')
            .addButton(button => button.setButtonText('恢复默认').onClick(() => this.confirmCategoryChange(
                container, '恢复默认分类模板', '恢复默认',
                draft => { draft.categories = defaultCategories(); },
            )));
    }

    private editCategory(container: HTMLElement, category?: Category): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(category ? '编辑分类' : '添加分类');
        let name = category?.name ?? '';
        let icon = category?.icon ?? 'folder';
        let color = category?.color ?? '#61846c';
        new Setting(modal.contentEl).setName('名称').addText(text => {
            text.inputEl.setAttribute('aria-label', '分类名称');
            text.setValue(name).onChange(value => { name = value; });
        });
        new Setting(modal.contentEl).setName('图标')
            .setDesc('填写 Obsidian 图标名，例如 folder 或 book-open。')
            .addText(text => {
                text.inputEl.setAttribute('aria-label', '分类图标');
                text.setValue(icon).onChange(value => { icon = value; });
            });
        const colorRow = new Setting(modal.contentEl).setName('颜色').addColorPicker(picker => {
            picker.setValue(color).onChange(value => { color = value; });
        });
        colorRow.controlEl.querySelector('input[type="color"]')?.setAttribute('aria-label', '分类颜色');
        new Setting(modal.contentEl)
            .addButton(button => button.setButtonText('取消').onClick(() => modal.close()))
            .addButton(button => button.setButtonText('保存分类').setCta().onClick(async () => {
                button.setDisabled(true);
                const saved = await this.save(draft => {
                    const label = name.trim();
                    const iconName = icon.trim();
                    if (!label) throw new Error('请输入分类名称。');
                    if (!getIcon(iconName)) throw new Error('未找到该图标，请检查图标名。');
                    if (draft.categories.some(item => item.id !== category?.id &&
                        item.name.toLocaleLowerCase() === label.toLocaleLowerCase())) {
                        throw new Error('已有同名分类。');
                    }
                    if (category) {
                        const existing = draft.categories.find(item => item.id === category.id);
                        if (!existing) throw new Error('该分类已被移除。');
                        Object.assign(existing, { name: label, icon: iconName, color });
                    } else {
                        draft.categories.push({ ...createCategory(label), icon: iconName, color });
                    }
                });
                button.setDisabled(false);
                if (saved) {
                    modal.close();
                    this.showCategories(container);
                }
            }));
        modal.open();
    }

    private confirmCategoryChange(
        container: HTMLElement, title: string, action: string, change: (draft: ShiguangConfig) => void,
    ): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText(title);
        modal.contentEl.createEl('p', { text: '此操作会更改分类列表。现有收藏文件会保留。' });
        new Setting(modal.contentEl)
            .addButton(button => button.setButtonText('取消').onClick(() => modal.close()))
            .addButton(button => button.setButtonText(action).setWarning().onClick(async () => {
                button.setDisabled(true);
                const saved = await this.save(change);
                button.setDisabled(false);
                if (saved) {
                    modal.close();
                    this.showCategories(container);
                }
            }));
        modal.open();
    }

    private showBrowsing(container: HTMLElement): void {
        new Setting(container).setName('外观与浏览').setHeading();
        new Setting(container).setName('默认显示页面').addDropdown(dropdown => {
            dropdown.selectEl.setAttribute('aria-label', '默认显示页面');
            dropdown.addOption('inbox', '全部浏览').addOption('bookmarks', '已选内容')
                .setValue(this.plugin.config.defaultPage).onChange(async value => {
                    if (!await this.save(draft => { draft.defaultPage = value === 'bookmarks' ? 'bookmarks' : 'inbox'; })) {
                        dropdown.setValue(this.plugin.config.defaultPage);
                    }
                });
        });
        new Setting(container).setName('默认排序').addDropdown(dropdown => {
            dropdown.selectEl.setAttribute('aria-label', '默认排序');
            dropdown.addOption('name-asc', '标题升序').addOption('name-desc', '标题降序')
                .setValue(this.plugin.config.sort).onChange(async value => {
                    if (!await this.save(draft => { draft.sort = value === 'name-desc' ? 'name-desc' : 'name-asc'; })) {
                        dropdown.setValue(this.plugin.config.sort);
                    }
                });
        });
    }

    private showAI(container: HTMLElement): void {
        container.empty();
        new Setting(container).setName('AI 功能').setHeading();
        new Setting(container).setName('启用 AI')
            .setDesc('保存此偏好，供后续模型接入使用。')
            .addToggle(toggle => {
                toggle.toggleEl.setAttribute('aria-label', '启用 AI');
                toggle.setValue(this.plugin.config.ai.enabled).onChange(async value => {
                    toggle.setDisabled(true);
                    await this.save(draft => { draft.ai.enabled = value; });
                    this.showAI(container);
                });
            });
        if (this.plugin.config.ai.enabled) {
            let { provider, model } = this.plugin.config.ai;
            new Setting(container).setName('服务商').addText(text => {
                text.inputEl.setAttribute('aria-label', 'AI 服务商');
                text.setValue(provider).onChange(value => { provider = value; });
            });
            new Setting(container).setName('模型').addText(text => {
                text.inputEl.setAttribute('aria-label', 'AI 模型');
                text.setValue(model).onChange(value => { model = value; });
            });
            new Setting(container).setName('AI 配置')
                .setDesc('仅填写服务商和模型名称。')
                .addButton(button => button.setButtonText('保存 AI 配置').onClick(async () => {
                    button.setDisabled(true);
                    const saved = await this.save(draft => {
                        draft.ai.provider = provider.trim();
                        draft.ai.model = model.trim();
                    });
                    button.setDisabled(false);
                    if (saved) new Notice('AI 偏好已保存。');
                }));
        }
    }

    private showAbout(container: HTMLElement): void {
        new Setting(container).setName('数据与关于').setHeading();
        new Setting(container).setName('插件版本').setDesc(this.plugin.manifest.version);
        new Setting(container).setName('本地数据')
            .setDesc('插件配置和分类保存在当前 Vault 的插件数据中。收藏与媒体位于所选文件夹。');
        new Setting(container).setName('首次启动向导')
            .addButton(button => button.setButtonText('重新运行向导').onClick(() => this.plugin.openWizard()));
    }
}
