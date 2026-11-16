// 檢查 Code.gs 與 index.html、signup.html 裡的前端程式語法，部署前先擋下打錯字的版本
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'check-'));
const files = { 'Code.js': readFileSync('src/Code.gs', 'utf8') };
for (const page of ['index', 'signup']) {
  const html = readFileSync(`src/${page}.html`, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!scripts.length) throw new Error(`${page}.html 裡找不到 <script>`);
  if (!html.includes('__APPS_SCRIPT_URL__')) throw new Error(`${page}.html 少了 __APPS_SCRIPT_URL__（部署時要替換）`);
  scripts.forEach((s, i) => { files[`${page}-${i}.js`] = s; });
}
for (const [name, src] of Object.entries(files)) {
  const p = join(dir, name);
  writeFileSync(p, src);
  execFileSync(process.execPath, ['--check', p], { stdio: 'inherit' });
  console.log('ok', name);
}
JSON.parse(readFileSync('src/appsscript.json', 'utf8'));
console.log('ok appsscript.json');
