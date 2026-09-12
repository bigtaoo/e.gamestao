# 部署

```
玩家 ──> https://e.gamestao.com          Cloudflare Worker「pata-web」，纯静态 dist
           │
           └─ fetch ─> https://pata-api.gamestao.com   VPS 92.205.18.79（wnet-mock.elk.de）
                          docker-caddy-1（这台机器的公共入口，占着 443）
                              └─ reverse_proxy ─> pata-api:5183   独立 compose 项目 ~/pata
                                                     └─ ~/pata/server/data.json
```

**2026-09-12 起两边都在线。** 下面这套东西已经配好了，日常什么都不用做 —— 第 1 节说的就是
「什么都不用做」具体指什么；第 3 节起才是要动手的情况。

## 1. 日常：合进 main 就自动发

`main` 上的提交只要碰了 `pata/**`，[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
就会跑两个互相独立的 job：

| job | 做什么 | 怎么算成功 |
|---|---|---|
| `web` | `npm ci` → `npm run build`（含 `tsc --noEmit`）→ `wrangler deploy` | 拉一次 https://e.gamestao.com ，要 200 且页面骨架在 |
| `api` | 把 `pata/server/index.mjs` 喂给 VPS 上的 `~/pata-ci-deploy.sh` | 容器重启后打一次需要鉴权的路由，要 **401** |

也可以在 Actions 页面手动 Run（`workflow_dispatch`）。

**成功的判据是「服务真的答话」而不是「命令返回 0」** —— 一个起不来的容器让 CI 显示绿色，
比红色坏得多。

### 什么不会自动部署（故意的）

`deploy/` 里的 compose 文件和部署脚本，CI 那把密钥**碰不到**。理由在
[`pata-ci-deploy.sh`](pata-ci-deploy.sh) 的注释里：能改 compose 就能写一个「把宿主 `/`
挂进容器」的 compose 去拿宿主权限，那是「CI 能部署容器」这件事本身最大的一个洞。
代价是改了这两样要手工同步一次（一年几次的事）：

```bash
scp deploy/pata-api.compose.yml tao@92.205.18.79:~/pata/
scp deploy/pata-ci-deploy.sh    tao@92.205.18.79:~/pata-ci-deploy.sh   # 注意：装在 ~/pata 外面
ssh tao@92.205.18.79 'chmod 755 ~/pata-ci-deploy.sh && cd ~/pata && docker compose -f pata-api.compose.yml up -d'
```

`~/wnet/docker/Caddyfile` 里那个 site block 同理，手工改完 `docker exec docker-caddy-1 caddy reload --config /etc/caddy/Caddyfile`。

## 2. 它凭什么能跑：这套东西现在长什么样

### 仓库变量（Settings → Secrets and variables → Actions）

| 变量 | 值 |
|---|---|
| `PATA_API_BASE` | `https://pata-api.gamestao.com` |
| `VPS_HOST` / `VPS_USER` | `92.205.18.79` / `tao` |
| `VPS_KNOWN_HOSTS` | `92.205.18.79 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDs88nZnl+y0ITyU2SfQzqyInFxJw0YNrsx3ssSeNkUd` |
| `WEB_DEPLOY_ENABLED` / `API_DEPLOY_ENABLED` | `true` —— **置成别的值就整个 job 跳过**，想临时停掉自动部署就改这里 |

### 密钥

| 密钥 | 是什么 |
|---|---|
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | 发 Worker 用 |
| `VPS_SSH_KEY` | 专给本仓库生成的 ed25519 私钥。**这是唯一副本**（生成后本地即销毁），丢了就按第 3 节重新生成一把 |

### 服务器上的四样东西

| 路径 | 作用 |
|---|---|
| `~/pata/pata-api.compose.yml` | 容器定义（独立 compose 项目，接进 `docker_default` 网络） |
| `~/pata/server/index.mjs` | 好友服务本体，**CI 每次换的就是这一个文件** |
| `~/pata/server/data.json` | 全部用户数据 |
| `~/pata-ci-deploy.sh` | CI 那把密钥的强制命令（`command=` 钉死，拿不到 shell） |

### 这台机器上还住着别人

`~/deutsch-sync`（德语 App 同步后端）、`~/wnet-test`、以及公司那套 wnet 栈 + mssql。
pata 的住法和邻居们完全一致：独立 compose 项目 + 共用 `docker_default` 网络 +
`~/wnet/docker/Caddyfile` 里加一个 site block（那是宿主机上的本地文件，没有任何 git 跟踪，
也没有任何部署流程会覆盖它）。compose 里的 `mem_limit` / `cpus` / 日志上限不是装饰 ——
别让一个失控的进程把别人挤下去。

## 3. 从零重建

### 3.1 DNS（Cloudflare 面板，gamestao.com）

- `e.gamestao.com` —— **不用手工加**，`wrangler deploy` 的 `custom_domain` 会自己建记录和证书。
- `pata-api.gamestao.com` —— 手工加 `A → 92.205.18.79`，**灰云（DNS only）**。
  和邻居 `sync.gamestao.com` / `bb.gamestao.com` 一致：证书由那台机器上的 Caddy 自己签
  Let's Encrypt，橙云代理会打断 HTTP 质询。

子域只能留一层（`pata-api` 而不是 `api.e`）：Cloudflare 免费版的通配证书只盖一层子域。

### 3.2 服务器

```bash
# 以 tao 登录 92.205.18.79
mkdir -p ~/pata/server
cp deploy/pata-api.compose.yml ~/pata/
install -m 755 deploy/pata-ci-deploy.sh ~/pata-ci-deploy.sh     # 装在 ~/pata 的外面
curl -fsSL https://raw.githubusercontent.com/bigtaoo/e.gamestao/main/pata/server/index.mjs \
  -o ~/pata/server/index.mjs
cd ~/pata && docker compose -f pata-api.compose.yml up -d
```

### 3.3 CI 部署密钥

```bash
ssh-keygen -t ed25519 -N "" -C pata-ci -f pata_ci
gh secret set VPS_SSH_KEY -R bigtaoo/e.gamestao < pata_ci && rm pata_ci   # 私钥只留在 GitHub
printf 'command="/home/tao/pata-ci-deploy.sh",restrict %s\n' "$(cat pata_ci.pub)" \
  > /tmp/pata-ci-authorized-key.txt
scp /tmp/pata-ci-authorized-key.txt tao@92.205.18.79:~/pata-ci-authorized-key.txt
scp deploy/install-pata-ci-key.sh   tao@92.205.18.79:~/
ssh tao@92.205.18.79 'sudo sh ~/install-pata-ci-key.sh'   # 这步要 root：/home/tao/.ssh 属 root
```

### 3.4 Caddy 入口

`~/wnet/docker/Caddyfile` 末尾加（和 `sync.gamestao.com` 那段同构），**先加 DNS 再加这段**，
否则记录还不存在时 Caddy 会反复申请证书失败，在别人的日志里刷屏：

```caddyfile
pata-api.gamestao.com {
	encode zstd gzip
	reverse_proxy pata-api:5183
}
```

`docker exec docker-caddy-1 caddy reload --config /etc/caddy/Caddyfile`

## 4. 排错

**登录闸门一直转 / 报连不上** —— 十有八九是 `VITE_API_BASE` 没烘进去。它在
`pata/src/net/api.ts` 里是 `import.meta.env`，**构建时就固化成常量**，部署完改环境变量没有
任何作用；不给就回落 `http://localhost:5183`，HTTPS 页面打明文 localhost 会被浏览器当混合
内容拦掉。所以 workflow 里缺 `PATA_API_BASE` 会直接红，而不是发一个进不去的站。
查证：`curl -s https://e.gamestao.com/assets/index-*.js | grep -o 'https://pata-api[^"]*'`。

**api job 在 ship 那步红** —— 看报错来自哪一侧：`Permission denied (publickey)` 是密钥没装
或装错（回 3.3）；`node --check` 报语法错是代码真的有问题（它故意拦在替换之前，旧文件还在跑）。
2026-09-12 第一次真部署栽在这里，原因是暂存文件叫 `index.mjs.incoming` —— `node --check`
靠扩展名判 ESM，非 `.mjs` 直接 `ERR_UNKNOWN_FILE_EXTENSION`，现在暂存名是 `incoming.mjs`。

**服务起不来，日志停在启动那一行** —— 大概率是单实例锁。`index.mjs` 的锁文件记 pid，容器里
node 永远是 pid 1，被 SIGKILL（OOM、`docker kill`）后残留的锁写着 1，新进程探测到「持锁者还
活着」就拒绝启动。compose 的 command 里已经有 `rm -f data.json.lock`，手工救场同理。

**看服务在干什么**：

```bash
ssh tao@92.205.18.79 'docker logs --tail 50 pata-api; docker ps --filter name=pata-api'
curl -s -o /dev/null -w '%{http_code}\n' https://pata-api.gamestao.com/api/save   # 期望 401
```

**回滚**：web 在 Cloudflare 面板的 Deployments 里选旧版本；api 把旧 `index.mjs` 从 git 历史
取出来 `ssh tao@92.205.18.79 < index.mjs` 送一遍（那把强制命令的密钥只认 stdin）。

## 5. 两件没做的事

1. **`~/pata/server/data.json` 没有备份。** 全部用户数据就这一个文件，只在那台机器上。
   那台机器上已经有 `~/db-snapshots/` 和现成的备份容器可以照抄一条 cron。
2. **账号体系是原型级的**：密码用 scrypt 存，但 token 明文放 localStorage、不过期、无找回。
   公网开放意味着真实用户会用真实密码注册。

另：`pata/src/assets/placeholder/` 里的参考图不会被发出去（`.gitignore` 挡着，CI 也拿不到），
线上跑的是矢量版宠物 —— 那些图没有授权，别让它们进构建。
