#!/bin/sh
# CI 的部署入口。这台机器 root 的 authorized_keys 里，pata-ci 那把公钥被
#   command="/root/pata/deploy-hook.sh",no-pty,no-port-forwarding,...
# 钉死在本脚本上：拿着那把私钥只能做这一件事，拿不到 shell。所以这个仓库的 CI
# 被盗也碰不到同一台机器上的游戏后端。
#
# 约定：新的 index.mjs 从 stdin 进来。
#   ssh pata@<host> < pata/server/index.mjs
set -eu

DIR=/root/pata/server
IN="$DIR/index.mjs.incoming"

cat > "$IN"

# 空 payload 直接拒：CI 那边一个手滑的重定向就能送来 0 字节，覆盖上去等于停服。
[ -s "$IN" ] || { echo "[hook] 收到空文件，拒绝"; rm -f "$IN"; exit 1; }

# 语法先过一遍再换。语法错的文件换上去，容器会进入起不来—重启—再起不来的循环，
# 而旧文件那时已经没了。用跑服务的同一个镜像检查，免得宿主机装 node。
docker run --rm -v "$DIR:/w:ro" node:22-alpine node --check /w/index.mjs.incoming

mv "$IN" "$DIR/index.mjs"

cd /root/pata
docker compose -f pata-api.compose.yml up -d
# 代码是 bind mount，up -d 认为"没变化"时不会重起进程，所以显式重启一次。
# restart 发的是 SIGTERM，index.mjs 有钩子会同步落盘 + 删锁，不会丢最后一秒的写入。
docker compose -f pata-api.compose.yml restart api
docker compose -f pata-api.compose.yml ps
