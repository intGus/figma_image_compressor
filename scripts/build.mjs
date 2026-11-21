// Builds the plugin into dist/:
//   dist/code.js  – plugin sandbox code (from src/code.ts)
//   dist/ui.html  – the whole UI as one self-contained HTML file: styles, scripts and
//                   every WebAssembly codec inlined, so nothing is loaded from the network.
//
// Usage: node scripts/build.mjs [--watch]

import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

/**
 * `import x from 'wasm-gz:<package path>.wasm'` gives the file gzip-compressed and
 * base64 encoded, as a string. src/engine/wasm.ts unpacks and compiles it on first use.
 */
export const wasmGzPlugin = {
  name: 'wasm-gz',
  setup(build) {
    build.onResolve({ filter: /^wasm-gz:/ }, (args) => ({
      path: require.resolve(args.path.slice('wasm-gz:'.length), { paths: [root] }),
      namespace: 'wasm-gz',
    }));
    build.onLoad({ filter: /.*/, namespace: 'wasm-gz' }, async (args) => {
      const gz = gzipSync(await readFile(args.path), { level: 9 });
      return { contents: `export default ${JSON.stringify(gz.toString('base64'))};`, loader: 'js' };
    });
  },
};

/** Shared options for the bundles that contain the codecs. */
export const engineOptions = {
  bundle: true,
  plugins: [wasmGzPlugin],
  // The Emscripten glue reads import.meta.url to find its .wasm file. We hand it a
  // compiled module instead, so it only needs a harmless placeholder here.
  define: { 'import.meta.url': '"https://localhost/"' },
  logOverride: { 'empty-import-meta': 'silent', 'assign-to-define': 'silent' },
  legalComments: 'none',
};

async function buildUi() {
  const result = await esbuild.build({
    ...engineOptions,
    entryPoints: [join(root, 'src/ui/main.ts')],
    format: 'iife',
    target: 'es2020',
    minify: true,
    write: false,
  });
  // Keep "</script" inside the bundle from closing the inline <script> tag.
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

  const designSystemCss = await readFile(
    require.resolve('figma-plugin-ds/dist/figma-plugin-ds.css', { paths: [root] }),
    'utf8',
  );
  const css = [
    // figma-plugin-ds loads the Inter font from rsms.me. Figma already provides Inter
    // to plugin UIs, and the plugin declares no network access, so drop those rules.
    designSystemCss.replace(/@font-face\s*{[^}]*}/g, ''),
    await readFile(join(root, 'src/ui/styles.css'), 'utf8'),
  ].join('\n');
  if (/url\(\s*["']?https?:/i.test(css)) throw new Error('CSS still references a remote URL');

  const template = await readFile(join(root, 'src/ui/index.html'), 'utf8');
  const html = template
    .replace('<!-- STYLES -->', () => `<style>\n${css}\n</style>`)
    .replace('<!-- SCRIPT -->', () => `<script>\n${js}\n</script>`);
  await writeFile(join(dist, 'ui.html'), html);
  return html.length;
}

async function buildCode() {
  await esbuild.build({
    entryPoints: [join(root, 'src/code.ts')],
    bundle: true,
    format: 'iife',
    // Figma's plugin sandbox runs older JavaScript; keep the output conservative.
    target: 'es2017',
    outfile: join(dist, 'code.js'),
    legalComments: 'none',
  });
}

async function buildAll() {
  await mkdir(dist, { recursive: true });
  const [uiSize] = await Promise.all([buildUi(), buildCode()]);
  console.log(`built dist/code.js and dist/ui.html (${(uiSize / 1024).toFixed(0)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildAll();
  if (watch) {
    const { watch: fsWatch } = await import('node:fs');
    let timer;
    fsWatch(join(root, 'src'), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => buildAll().catch((e) => console.error(e.message)), 100);
    });
    console.log('watching src/ for changes…');
  }
}
