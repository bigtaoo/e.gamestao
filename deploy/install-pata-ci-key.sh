#!/bin/sh
# 一次性：把 pata 的 CI 部署公钥按强制命令的形式登记进 authorized_keys。
# 必须以 root 跑（/home/tao/.ssh 属 root）。幂等：重复跑不会加第二遍。
#
#   sudo sh install-pata-ci-key.sh
set -eu
KEYLINE=/home/tao/pata-ci-authorized-key.txt
AK=/home/tao/.ssh/authorized_keys

[ -f "$KEYLINE" ] || { echo "找不到 $KEYLINE" >&2; exit 1; }
cp "$AK" "$AK.bak-$(date +%Y%m%d-%H%M%S)"

if grep -qxF -f "$KEYLINE" "$AK"; then
  echo "已经登记过了，没重复添加"
else
  cat "$KEYLINE" >> "$AK"
  echo "已追加"
fi
chmod 644 "$AK"
echo "现在 authorized_keys 里有 $(grep -c '^\(command\|ssh-\)' "$AK") 行钥匙："
cut -c1-60 "$AK"
