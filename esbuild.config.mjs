import { build } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const project = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.id !== project.name || manifest.version !== project.version) {
  throw new Error('manifest.json 和 package.json 的标识或版本不一致。');
}

const folder = 'dist/fox-shiguang';
await build({
  entryPoints: ['src/main.ts'],
  outfile: folder + '/main.js',
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  loader: { '.jpg': 'dataurl', '.html': 'text', '.css': 'text', '.js': 'text' },
  external: ['obsidian']
});
await mkdir(folder, { recursive: true });
await Promise.all(['manifest.json', 'styles.css', 'LICENSE'].map(file => copyFile(file, folder + '/' + file)));
