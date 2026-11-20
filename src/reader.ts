import { Component, MarkdownRenderer, TFile, parseYaml, type App } from 'obsidian';
import { getArticleKey, localMediaCandidates, type Article } from './articles';
import type { FolderPaths } from './config';

const image = /\.(png|jpe?g|gif|webp|avif|bmp)$/i;
const video = /\.(mp4|webm|mov|m4v|ogv)$/i;
const audio = /\.(mp3|wav|ogg|m4a|flac)$/i;
export const escapeReader = (text: string) => text.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

// Extracted from FoxDashboard's local reader; no network fetch or RedLink host dependency.
export function prepareReading(body: string, resolve: (ref: string) => string | undefined) {
  const media: { token: string; html: string }[] = [];
  const resources = new Set<string>();
  const markdown = body.replace(/!\[\[([^\]\n]+)\]\]|!\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g,
    (_whole, wiki: string, md: string) => {
      const ref = (wiki ? wiki.split('|')[0] : md.replace(/^<|>$/g, '')).trim();
      const url = resolve(ref);
      const token = 'FOXLOCALMEDIA' + media.length + 'END';
      let html: string;
      if (url && (image.test(ref) || video.test(ref) || audio.test(ref))) {
        resources.add(url);
        const source = `data-local-media="${escapeReader(url)}"`;
        html = image.test(ref) ? `<img ${source} alt="" loading="lazy">`
          : video.test(ref) ? `<video controls preload="metadata" ${source}></video>`
            : `<audio controls preload="metadata" ${source}></audio>`;
        html = `<figure class="original-media">${html}<p class="media-failure" hidden>本地媒体无法播放，请在 Obsidian 中检查格式。</p></figure>`;
      } else html = `<p class="media-placeholder">本地媒体未找到或暂不支持：${escapeReader(ref)}</p>`;
      media.push({ token, html });
      return '\n\n' + token + '\n\n';
    });
  return { markdown, media, resources };
}

export interface Reading {
  title: string;
  author?: string;
  tags: string[];
  url: string;
  path: string;
  html: string;
  mediaCount: number;
  media: { id: string; mime: string; bytes?: ArrayBuffer; error?: string }[];
  links: string[];
}

export async function readOriginal(app: App, article: Article, paths: FolderPaths): Promise<Reading> {
  const file = app.vault.getAbstractFileByPath(article.file.path);
  if (!(file instanceof TFile) || file !== article.file ||
      !(file.path.startsWith(paths.inbox + '/') || file.path.startsWith(paths.bookmarks + '/'))) {
    throw Error('文章已移动或不存在，请重新扫描。');
  }
  if (file.stat.size > 1024 * 1024) throw Error('笔记超过 1 MB，请在 Obsidian 中打开。');
  const text = (await app.vault.read(file)).replace(/^\uFEFF/, '');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const fields = frontmatter ? parseYaml(frontmatter[1]) : undefined;
  if (!fields || getArticleKey(fields) !== article.key) throw Error('文章身份已变化，请重新扫描。');
  let body = text.slice(frontmatter![0].length);
  const manifest: Record<string, unknown>[] = Array.isArray(fields.media)
    ? fields.media.filter((entry: unknown) => entry && typeof entry === 'object') : [];
  for (const entry of manifest) {
    const ref = typeof entry.path === 'string' ? entry.path : typeof entry.localPath === 'string' ? entry.localPath : undefined;
    if (!ref || body.includes(ref)) continue;
    const label = entry.kind === 'image' ? `[图片 ${Number(entry.sourceIndex) + 1} · 按需获取]` : '[视频 · 按需获取]';
    const replacement = '![[ ' + ref + ' ]]';
    body = body.includes(label) ? body.replace(label, replacement) : body + '\n\n' + replacement;
  }
  const files = new Map<string, TFile>();
  const prepared = prepareReading(body, ref => {
    const found = localMediaCandidates(file, article.key, ref, paths).map(path => app.vault.getAbstractFileByPath(path))
      .find(candidate => candidate instanceof TFile);
    if (!(found instanceof TFile)) return;
    const existing = [...files].find(([, value]) => value === found);
    if (existing) return existing[0];
    const id = 'fox-local:' + files.size;
    files.set(id, found);
    return id;
  });
  const media: Reading['media'] = [];
  let total = 0;
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp',
    mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ogv: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  };
  for (const [id, resource] of files) {
    if (!prepared.resources.has(id)) continue;
    try {
      if (resource.stat.size > 64 * 1024 * 1024 || total + resource.stat.size > 128 * 1024 * 1024) {
        throw Error('媒体过大，请在 Obsidian 中打开。');
      }
      const bytes = await app.vault.readBinary(resource);
      if (bytes.byteLength > 64 * 1024 * 1024 || total + bytes.byteLength > 128 * 1024 * 1024) throw Error('媒体超过预览限制。');
      total += bytes.byteLength;
      media.push({ id, mime: mimeTypes[resource.extension.toLowerCase()] ?? 'application/octet-stream', bytes });
    } catch (error) {
      media.push({ id, mime: '', error: error instanceof Error ? error.message : '媒体无法读取。' });
    }
  }
  const element = document.createElement('div');
  const component = new Component();
  component.load();
  try {
    const markdown = prepared.markdown
      .replace(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1\s*$/gm, (_whole, fence, code) => fence + 'text\n' + code + fence)
      .replace(/<(script|iframe|object|embed|style|form|video|audio)\b[\s\S]*?<\/\1\s*>|<(img|iframe|embed|object)\b[^>]*>/gi, '（原帖 HTML 嵌入未载入）');
    await MarkdownRenderer.render(app, markdown, element, file.path, component);
    const allowed = new Set('P DIV SPAN H1 H2 H3 H4 H5 H6 UL OL LI EM STRONG B I S DEL BLOCKQUOTE PRE CODE TABLE THEAD TBODY TR TH TD BR HR A DETAILS SUMMARY KBD SUP SUB'.split(' '));
    const links = new Set<string>();
    for (const node of Array.from(element.querySelectorAll('*'))) {
      if (!allowed.has(node.tagName)) { node.replaceWith(document.createTextNode(node.textContent || '')); continue; }
      const href = node.tagName === 'A' ? node.getAttribute('href') : null;
      for (const attribute of Array.from(node.attributes)) node.removeAttribute(attribute.name);
      if (href && /^https?:\/\//i.test(href)) {
        links.add(href); node.setAttribute('href', href); node.setAttribute('data-reader-url', href);
      }
    }
    for (const item of prepared.media) {
      const paragraph = Array.from(element.querySelectorAll('p')).find(p => p.textContent?.trim() === item.token);
      if (paragraph) paragraph.outerHTML = item.html;
      else element.insertAdjacentHTML('beforeend', item.html);
    }
    return { title: article.title, author: article.author, tags: article.tags, path: file.path,
      url: article.sourceUrl, html: element.innerHTML, media, mediaCount: media.length, links: [...links, article.sourceUrl] };
  } finally { component.unload(); }
}
