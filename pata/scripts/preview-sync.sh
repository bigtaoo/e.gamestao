#!/bin/sh
# 构建并把产物同步到预览目录。
#
# 为什么要绕这一圈：预览进程跑在一个读不到 ~/Desktop 的沙箱里（macOS TCC），
# vite dev server 在那儿起不来（EPERM）。所以改成把 dist 复制到家目录下的
# 一个普通目录，用零依赖静态服务器伺服。代价是没有 HMR，改完要重跑本脚本。
#
# 早先用的是 /tmp，但系统会定期清理，服务器脚本和产物会一起消失。
# 现在落在 ~/.pata-preview，并且服务器脚本由本脚本自己生成——
# 无论目录被删多少次，重跑一次就全回来了。
set -e

HERE=$(cd "$(dirname "$0")/.." && pwd)
BASE="$HOME/.pata-preview"
SERVE="$BASE/serve.cjs"
DEST="$BASE/www"

mkdir -p "$BASE"

cat > "$SERVE" <<'EOF'
// 预览用静态服务器（由 scripts/preview-sync.sh 生成，别手改）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'www');
const PORT = Number(process.env.PORT) || 5180;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(ROOT, 'index.html');
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => console.log('pata preview on http://localhost:' + PORT));
EOF

npm --prefix "$HERE" run build

# 拷内容而不是拷目录本身：`cp -R dist www` 在 www 已存在时会塞成 www/dist，
# 预览就只剩 404 了，而且不报错——用 dist/. 无论 www 在不在都是同一个结果
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$HERE/dist/." "$DEST/"

echo "同步完成 -> $DEST"

# 好友服务是另一个进程（5183）。它不在跑的时候好友面板只会显示「连不上好友服务」，
# 看着像 bug 其实只是没开——所以同步完顺手拉起来，已经在跑就跳过。
if lsof -nP -iTCP:5183 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "好友服务已在 5183"
else
  (cd "$HERE" && nohup node server/index.mjs >"$BASE/server.log" 2>&1 &)
  sleep 1
  echo "好友服务已拉起 -> 5183（日志 $BASE/server.log）"
fi
