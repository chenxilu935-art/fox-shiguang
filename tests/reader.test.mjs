import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const { outputFiles } = await build({
  stdin: { contents: "export {prepareReading} from './src/reader';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm',
  plugins: [{ name: 'mock', setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export class Component {} export class TFile {} export const MarkdownRenderer={}; export const parseYaml=()=>{};' }));
  } }],
});
const { prepareReading } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'));
test('reader embeds only resolved local media and escapes missing references', () => {
  const result = prepareReading('正文\n![[Cache/cover.png]]\n![](https://example.invalid/a.png)\n![[<script>.mp4]]', ref => ref === 'Cache/cover.png' ? 'fox-local:0' : undefined);
  assert.deepEqual([...result.resources], ['fox-local:0']);
  assert.match(result.media[0].html, /data-local-media="fox-local:0"/);
  assert.doesNotMatch(result.media[1].html, /src=/);
  assert.match(result.media[2].html, /&lt;script&gt;/);
  assert.doesNotMatch(result.media[2].html, /<script>/);
});
