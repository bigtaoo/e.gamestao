/**
 * 把 server/admin.html 转成 server/admin-page.mjs（一个导出 HTML 字符串的模块）。
 *
 * 为什么要这一步：部署管线只能把「一个文件」喂给 VPS，所以运行期不能再去读磁盘上的
 * .html。转成 JS 模块后 esbuild 就能把它一起打进单文件产物里。
 *
 *   node scripts/gen-admin-page.cjs
 */
const fs = require('fs');
const path = require('path');

const HERE = path.join(__dirname, '..');
const SRC = path.join(HERE, 'server', 'admin.html');
const DEST = path.join(HERE, 'server', 'admin-page.mjs');

const html = fs.readFileSync(SRC, 'utf8');

// 内联成模板字符串的前提：内容里不能有反引号或 ${，否则会被当成插值而不是字面量
const BAD = ['`', '${'];
for (const t of BAD) {
  if (html.includes(t)) {
    console.error(`[gen-admin-page] admin.html 里出现了 ${t}，不能直接内联成模板字符串。`);
    console.error('                 要么改掉它，要么把这个脚本换成转义写法。');
    process.exit(1);
  }
}

const banner = [
  '/**',
  ' * 管理后台页面 —— 本文件由 scripts/gen-admin-page.cjs 从 server/admin.html 生成，别手改。',
  ' *',
  ' * 为什么页面要变成 JS 模块：部署管线只把**一个文件**喂给 VPS（ssh ... < server/index.mjs，',
  ' * 那把 key 被 command= 钉死，放不了第二个文件）。CI 用 esbuild 把这些模块打成单文件再发，',
  ' * 所以运行期不能有任何 readFileSync。',
  ' *',
  ' * 2026-09-13 的教训：index.mjs 去 import 一个压根没被发上去的 admin.mjs，容器起不来，',
  ' * Caddy 回 502，而 502 没有 CORS 头，浏览器那边看到的是一句莫名其妙的 Failed to fetch。',
  ' */',
  '',
].join('\n');

fs.writeFileSync(DEST, `${banner}export const ADMIN_HTML = \`${html}\`;\n`);
console.log(`[gen-admin-page] 已生成 ${path.relative(HERE, DEST)}（${html.length} 字节 HTML）`);
