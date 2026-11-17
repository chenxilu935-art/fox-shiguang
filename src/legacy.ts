import { Modal, type App } from 'obsidian';
import type { Category } from './config';
import type FoxShiguangPlugin from './main';

interface LegacyCategory {
  id: string;
  name: string;
}

interface LegacyTopics {
  revision: number;
  categories: LegacyCategory[];
  assignments: Record<string, string[]>;
}

interface PreviewArticle {
  key: string;
  title: string;
  path: string;
  topics: string[];
  topicState: 'missing' | 'valid' | 'invalid';
}

interface CategoryRow extends LegacyCategory {
  status: 'add' | 'existing' | 'conflict';
  reason?: string;
}

interface AssignmentRow {
  key: string;
  legacyIds: string[];
  articles: PreviewArticle[];
  status: 'apply' | 'keep' | 'unmatched' | 'conflict' | 'empty';
  reason: string;
}

const MAX_BYTES = 1024 * 1024;
const XHS_KEY = /^xhs:[a-f0-9]{24}$/;
const DEMO_KEY = /^demo:[a-zA-Z0-9_-]{1,80}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const RESERVED_NAMES = new Set(['全部', '未分类', '管理分类']);
const validId = (value: unknown): value is string => typeof value === 'string' &&
  /^[a-zA-Z0-9_-]{1,80}$/.test(value) && !RESERVED_IDS.has(value);
const nameKey = (name: string) => name.normalize('NFKC').trim().toLowerCase();

export function parseLegacyTopics(text: string): LegacyTopics {
  const source: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!source || typeof source !== 'object' || !('version' in source) || source.version !== 1 ||
      !('revision' in source) || typeof source.revision !== 'number' ||
      !Number.isSafeInteger(source.revision) || source.revision < 0 ||
      !('categories' in source) || !Array.isArray(source.categories) ||
      !('assignments' in source) || !source.assignments || typeof source.assignments !== 'object' ||
      Array.isArray(source.assignments)) {
    throw new Error('旧主题 JSON 格式无法识别。请选择包含 version 1、revision、categories、assignments 的文件。');
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const categories: LegacyCategory[] = [];
  for (const entry of source.categories) {
    if (!entry || !validId(entry.id) || typeof entry.name !== 'string' ||
        !entry.name || entry.name !== entry.name.normalize('NFKC').trim() ||
        entry.name.length > 32 || /[\u0000-\u001f]/.test(entry.name) || RESERVED_NAMES.has(entry.name) ||
        ids.has(entry.id) || names.has(nameKey(entry.name))) {
      throw new Error('旧主题中存在重复或无效的分类，请保留原文件并检查分类定义。');
    }
    ids.add(entry.id);
    names.add(nameKey(entry.name));
    categories.push({ id: entry.id, name: entry.name });
  }

  const assignments: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(source.assignments)) {
    if ((!XHS_KEY.test(key) && !DEMO_KEY.test(key)) || !Array.isArray(value) || !value.every(validId)) {
      throw new Error('旧关联缺少可识别的原帖键或主题 ID。请保留原文件并检查关联格式。');
    }
    assignments[key] = [...new Set(value)];
  }
  return { revision: source.revision, categories, assignments };
}

export function planLegacyTopics(old: LegacyTopics, current: readonly Category[], articles: readonly PreviewArticle[]) {
  const currentIds = new Map(current.map(category => [category.id, category]));
  const currentNames = current.map(category => ({ id: category.id, key: nameKey(category.name) }));
  const categories: CategoryRow[] = old.categories.map(category => {
    const sameId = currentIds.get(category.id);
    const key = nameKey(category.name);
    const sameName = currentNames.find(existing => existing.id !== category.id && existing.key === key);
    const reasons = [];
    if (sameId && sameId.name !== category.name) reasons.push(`同 ID 已用于「${sameId.name}」`);
    if (sameName) reasons.push(`同名主题的现有 ID 为 ${sameName.id}`);
    if (reasons.length) return { ...category, status: 'conflict', reason: reasons.join('，') };
    return { ...category, status: sameId ? 'existing' : 'add' };
  });

  const categoryStatuses = new Map(categories.map(category => [category.id, category.status]));
  const indexed = new Map<string, PreviewArticle[]>();
  for (const article of articles) {
    const group = indexed.get(article.key) ?? [];
    group.push(article);
    indexed.set(article.key, group);
  }

  const assignments: AssignmentRow[] = Object.entries(old.assignments).map(([key, legacyIds]) => {
    const matches = indexed.get(key) ?? [];
    const row = { key, legacyIds, articles: matches };
    if (DEMO_KEY.test(key)) return { ...row, status: 'unmatched', reason: '旧演示记录，保留在原 JSON' };
    if (!matches.length) return { ...row, status: 'unmatched', reason: '当前 Inbox 和 Bookmarks 找不到此原帖 ID' };
    if (matches.length !== 1) return { ...row, status: 'conflict', reason: '多篇 Markdown 使用了同一原帖 ID' };
    const article = matches[0];
    if (article.topicState === 'invalid') {
      return { ...row, status: 'conflict', reason: '已有 Markdown 主题属性使用未知格式，保留现状' };
    }
    if (article.topicState === 'valid') {
      return { ...row, status: 'keep', reason: '已有 Markdown 主题属性，保留现状' };
    }
    if (!legacyIds.length) return { ...row, status: 'empty', reason: '旧记录没有主题' };
    const unavailable = legacyIds.filter(id => !categoryStatuses.has(id) || categoryStatuses.get(id) === 'conflict');
    if (unavailable.length) {
      return { ...row, status: 'conflict', reason: `旧主题未定义或与当前分类冲突：${unavailable.join('、')}` };
    }
    return { ...row, status: 'apply', reason: '按原帖 ID 匹配，文章尚未设置 Markdown 主题属性' };
  });

  return { revision: old.revision, categories, assignments };
}

export class LegacyPreviewModal extends Modal {
  private request = 0;

  constructor(app: App, private readonly plugin: FoxShiguangPlugin) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('旧主题 JSON 导入预览');
    this.contentEl.createEl('p', { text: '选择旧版拾光室的主题 JSON。预览仅读取所选文件并与当前收藏比对。' });
    const input = this.contentEl.createEl('input', {
      attr: { type: 'file', accept: '.json,application/json', 'aria-label': '选择旧主题 JSON' }
    });
    const progress = this.contentEl.createEl('p', { attr: { role: 'status' } });
    const output = this.contentEl.createDiv();
    input.onchange = () => {
      const file = input.files?.[0];
      input.value = '';
      if (file) void this.preview(file, progress, output);
    };
  }

  onClose(): void {
    this.request++;
    this.contentEl.empty();
  }

  private async preview(file: File, progress: HTMLElement, output: HTMLElement): Promise<void> {
    const request = ++this.request;
    output.empty();
    progress.setText('正在检查旧主题数据…');
    try {
      if (file.size > MAX_BYTES) throw new Error('文件超过 1 MB，请核对是否选中了旧主题 JSON。');
      const old = parseLegacyTopics(await file.text());
      if (request !== this.request) return;
      await this.plugin.rescan();
      if (request !== this.request) return;
      const { notes } = this.plugin.getSources();
      const plan = planLegacyTopics(old, this.plugin.config.categories, [...notes.inbox, ...notes.bookmarks]);
      progress.setText(`只读预览 · ${file.name} · 旧数据 revision ${plan.revision}`);
      this.renderPlan(output, plan);
    } catch (error) {
      if (request !== this.request) return;
      progress.setText(error instanceof SyntaxError ? '所选文件不是有效 JSON。' :
        error instanceof Error ? error.message : '无法读取旧主题 JSON。');
    }
  }

  private renderPlan(output: HTMLElement, plan: ReturnType<typeof planLegacyTopics>): void {
    output.createEl('h3', { text: '主题定义' });
    const categoryGroups = [
      ['add', '拟新增主题'], ['existing', '已存在主题'], ['conflict', '分类冲突']
    ] as const;
    for (const [status, label] of categoryGroups) {
      const rows = plan.categories.filter(row => row.status === status);
      const details = output.createEl('details', { attr: status === 'conflict' ? { open: '' } : {} });
      details.createEl('summary', { text: `${label}（${rows.length}）` });
      if (!rows.length) continue;
      const list = details.createEl('ul');
      for (const row of rows) {
        list.createEl('li', { text: `${row.name}（${row.id}）${row.reason ? ' · ' + row.reason : ''}` });
      }
    }
    output.createEl('h3', { text: '文章关联' });
    const assignmentGroups = [
      ['apply', '拟获得关联的文章'], ['keep', '保留已有文章属性'], ['unmatched', '未匹配的历史关联'],
      ['conflict', '需核对的文章关联'], ['empty', '无主题的历史记录']
    ] as const;
    for (const [status, label] of assignmentGroups) {
      const rows = plan.assignments.filter(row => row.status === status);
      const details = output.createEl('details', {
        attr: status === 'apply' || status === 'unmatched' || status === 'conflict' ? { open: '' } : {}
      });
      details.createEl('summary', { text: `${label}（${rows.length}）` });
      if (!rows.length) continue;
      const list = details.createEl('ul');
      for (const row of rows) {
        const li = list.createEl('li');
        li.createEl('strong', { text: row.key });
        li.createDiv({ text: row.reason });
        li.createDiv({ text: `旧主题 ID：${row.legacyIds.join('、') || '无'}` });
        for (const article of row.articles) {
          li.createDiv({ text: `${article.title}（${article.path}）` });
          if (article.topicState === 'valid') {
            li.createDiv({ text: `当前主题 ID：${article.topics.join('、') || '无'}` });
          }
        }
      }
    }
  }
}
