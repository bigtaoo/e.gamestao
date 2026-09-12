# pata 上线（e.gamestao.com）

```
玩家 ──> https://e.gamestao.com          Cloudflare Worker「pata-web」，纯静态 dist
           │
           └─ fetch ─> https://pata-api.gamestao.com   共享 VPS 92.205.18.79（wnet-mock.elk.de）
                          docker-caddy-1（这台机器的公共入口，占着 443）
                              └─ reverse_proxy ─> pata-api:5183   独立 compose 项目 ~/pata
                                                     └─ ~/pata/server/data.json
```

发布**完全由本仓库自己的流水线驱动**，不经过任何别的项目的 CI。和这台机器上其它东西的
交集只有两处，和邻居 `~/deutsch-sync`、`~/wnet-test` 的住法一模一样：

- `~/wnet/docker/Caddyfile` 里的一个 site block（那是宿主机上的本地文件，没有被任何 git 跟踪，
  也没有任何部署流程会覆盖它）；
- 共用 `docker_default` 这个 docker 网络，好让 Caddy 能按容器名解析到 `pata-api`。

为什么静态和 API 拆成两个域：静态发 Cloudflare 是既有套路，而好友服务是个带本地 JSON 存档的
常驻 node 进程，Worker 跑不了它。跨域不用管 —— `server/index.mjs` 本来就发
`Access-Control-Allow-Origin: *`（开发期客户端 5180 打服务 5183，早就是跨域了）。

子域只留一层（`pata-api` 而不是 `api.e`）：Cloudflare 免费版的通配证书只盖一层子域。

> **游戏没有后端就进不去。** `src/app.ts` 启动时 `if (needsGate()) await openGate()`，
> 登录闸门挡在游戏前面，注册/登录都打 `VITE_API_BASE`。所以"先只发静态页面"不是一个能玩的状态。

## 一次性配置

### 1. 仓库变量（Settings → Secrets and variables → Actions → Variables）

| 变量 | 值 |
|---|---|
| `PATA_API_BASE` | `https://pata-api.gamestao.com` |
| `VPS_HOST` | `92.205.18.79` |
| `VPS_USER` | `tao` |
| `VPS_KNOWN_HOSTS` | `92.205.18.79 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDs88nZnl+y0ITyU2SfQzqyInFxJw0YNrsx3ssSeNkUd` |
| `WEB_DEPLOY_ENABLED` | `true`（不设就跳过 web job） |
| `API_DEPLOY_ENABLED` | `true`（不设就跳过 api job） |

### 2. 仓库密钥（Secrets）

| 密钥 | 从哪来 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare 面板新建，至少 `Workers Scripts:Edit`（账号级）；建 custom_domain 还要 `Zone:Edit` + `DNS:Edit`（gamestao.com） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 面板右栏 |
| `VPS_SSH_KEY` | 专给本仓库生成的 ed25519 私钥（**不要复用日常开发那把**），公钥按 §4 装到 VPS |

### 3. DNS（Cloudflare 面板，gamestao.com）

- `e.gamestao.com` —— **不用手工加**，`wrangler deploy` 的 `custom_domain` 会自己建记录和证书。
- `pata-api.gamestao.com` —— 手工加 `A → 92.205.18.79`，**灰云（DNS only）**。
  和邻居 `sync.gamestao.com` / `bb.gamestao.com` 一致：证书由那台机器上的 Caddy 自己签
  Let's Encrypt，橙云代理会打断 HTTP 质询。

### 4. VPS 装配（一次性）

```sh
# 以 tao 登录 92.205.18.79
mkdir -p ~/pata/server
# 本仓库 deploy/ 下的两份文件拷过去
cp pata-api.compose.yml ~/pata/
install -m 755 pata-ci-deploy.sh ~/pata-ci-deploy.sh   # 注意：装在 ~/pata 的外面
curl -fsSL https://raw.githubusercontent.com/bigtaoo/e.gamestao/main/pata/server/index.mjs \
  -o ~/pata/server/index.mjs
cd ~/pata && docker compose -f pata-api.compose.yml up -d

# CI 公钥登记成强制命令（这一步要 root，/home/tao/.ssh 属 root）
#   ~/pata-ci-authorized-key.txt 里是这一行：
#   command="/home/tao/pata-ci-deploy.sh",restrict ssh-ed25519 AAAA... pata-ci
sudo sh install-pata-ci-key.sh
```

### 5. Caddy 入口

`~/wnet/docker/Caddyfile` 末尾加（和 `sync.gamestao.com` 那段同构）：

```caddyfile
# pata（云养宠，仓库 bigtaoo/e.gamestao）的好友服务。独立 compose 项目 ~/pata，
# 容器名 pata-api。与 wnet 那套栈唯一的交集就是这个 block 和共用的 docker_default 网络。
pata-api.gamestao.com {
	encode zstd gzip
	reverse_proxy pata-api:5183
}
```

改完 `docker exec docker-caddy-1 caddy reload --config /etc/caddy/Caddyfile`。
**先加 DNS 再加这段**：记录还不存在时 Caddy 会反复申请证书失败，在别人的日志里刷屏。

## 日常

`main` 上动了 `pata/**` 就自动发，也可以在 Actions 页面手动 Run。两个 job 相互独立。

**回滚**：web 在 Cloudflare 面板的 Deployments 里选旧版本；api 把旧 `index.mjs` 从 git 历史
取出来 `ssh tao@92.205.18.79 < index.mjs` 送一遍。

**改 compose 或部署脚本**：CI 那把密钥碰不到它们（这是故意的，见脚本里的注释），
所以要手工上服务器同步一次。

**数据**：`~/pata/server/data.json`，只在那台机器上，**没有备份**。上线前值得加一条 cron
（那台机器上已经有 `~/db-snapshots/` 和现成的备份容器可以参考）。

## 上线前该知道的两件事

1. **账号体系是原型级的。** 密码用 scrypt 存，但 token 明文放 localStorage、不过期、无找回。
   公网开放意味着真实用户会用真实密码注册。
2. **`src/assets/placeholder/` 里的参考图不会被发出去**（`.gitignore` 挡着，CI 也拿不到），
   线上跑的是矢量版宠物。这是对的 —— 那些图没有授权。
