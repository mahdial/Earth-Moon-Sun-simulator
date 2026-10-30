// Bundles everything (three.js, astronomy-engine, textures) into ONE self-contained file: docs/index.html
import { build } from 'esbuild';
import fs from 'node:fs';
const prod = !process.argv.includes('--dev');
const r = await build({
  entryPoints: ['src/main.js'], bundle: true, write: false, format: 'iife', target: ['es2019'],
  minify: prod, legalComments: 'none', loader: { '.jpg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const html = fs.readFileSync('src/template.html', 'utf8').replace('/*__BUNDLE__*/', () => js);
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/index.html', html);
console.log('docs/index.html', (html.length / 1024).toFixed(0), 'KB');
