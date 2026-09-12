#!/bin/sh
# CI 部署好友服务时在服务器上执行的**唯一**命令。
#
# ── 它为什么是这个形状 ──
# 部署密钥在服务器的 ~/.ssh/authorized_keys 里是这样登记的：
#
#   command="/home/tao/pata-ci-deploy.sh",restrict ssh-ed25519 AAAA...
#
# command= 是 OpenSSH 的**强制命令**：拿着这把私钥的人无论请求执行什么，sshd 都只运行
# 这个脚本。于是这把密钥的能力被钉死成「部署一次好友服务」，而不是「以 tao 的身份登录
# 那台机器」—— 那台机器上还跑着公司的 wnet 栈、mssql 和德语 App 的同步后端。
# restrict 再关掉端口转发、agent 转发、pty 和 X11（否则可以拿转发绕开强制命令）。
#
# ── 它为什么装在 ~/pata 的**外面** ──
# 因为它自己不能是可部署内容。装在部署目标里的话，一次部署就能把这个脚本替换掉，
# 强制命令的约束当场归零。**活的那份在 ~/pata-ci-deploy.sh，仓库里这份只是副本，
# 改了要手工重新装一遍**（deploy/README.md 有命令）。
#
# ── 它为什么只换一个文件 ──
# compose 文件一律不动。让这把密钥无法改 compose，它就无法写一个「把宿主 / 挂进容器」
# 的 compose 去拿宿主权限 —— 那是「CI 能部署容器」这件事本身最大的一个洞。
# 好友服务本来就是零依赖单文件，这个限制没有任何代价。
#
# 约定：新的 index.mjs 从 stdin 进来。
#   ssh pata-ci@<host> < pata/server/index.mjs
set -eu

TARGET="$HOME/pata"
IN="$TARGET/server/index.mjs.incoming"

cat > "$IN"

# 空 payload 直接拒：CI 那边一个手滑的重定向就能送来 0 字节，覆盖上去等于停服。
[ -s "$IN" ] || { echo "[pata] 收到空文件，拒绝"; rm -f "$IN"; exit 1; }

# 语法先过一遍再换。语法错的文件换上去，容器会进入起不来—重启—再起不来的循环，
# 而旧文件那时已经没了。用跑服务的同一个镜像检查，免得在宿主机上装 node。
docker run --rm -v "$TARGET/server:/w:ro" node:22-alpine node --check /w/index.mjs.incoming

mv "$IN" "$TARGET/server/index.mjs"

cd "$TARGET"
docker compose -f pata-api.compose.yml up -d
# 代码是 bind mount，up -d 认为「没变化」时不会重起进程，所以显式重启一次。
# restart 发的是 SIGTERM，index.mjs 有钩子会同步落盘 + 删锁，不丢最后一秒的写入。
docker compose -f pata-api.compose.yml restart api
docker compose -f pata-api.compose.yml ps --format '{{.Name}} {{.Status}}'

# 部署不以「命令返回 0」为成功，以**服务真的答话**为成功。
# 没有这一步，一个起不来的容器会让 CI 显示绿色 —— 静默失败的部署最坏。
# 打的是需要鉴权的路由：401 同时证明进程活着、路由表在、鉴权没被绕过。
docker exec pata-api node -e "
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 15; i += 1) {
    try {
      const res = await fetch('http://127.0.0.1:5183/api/save');
      if (res.status === 401) { console.log('[pata] 服务已答话（401 未登录）'); process.exit(0); }
      console.error('[pata] 预期 401，实际', res.status);
      process.exit(1);
    } catch {
      /* 还没起来 */
    }
    await wait(1000);
  }
  console.error('[pata] 15 秒内没有回应，部署算失败');
  process.exit(1);
})();
"
