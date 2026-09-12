# pata 上线（e.gamestao.com）

```
玩家 ──> https://e.gamestao.com          Cloudflare Worker「pata-web」，纯静态 dist
           │
           └─ fetch ─> https://pata-api.gamestao.com   Hetzner VPS 128.140.41.98
                          nw-caddy（游戏后端那套里的 Caddy，占着 443）
                              └─ reverse_proxy ─> pata-api:5183   容器，server/index.mjs
                                                     └─ /root/pata/server/data.json
```

为什么拆成两个域：静态发 Cloudflare 是既有套路（`a.gamestao.com` 同样走法），而好友服务是个
带本地 JSON 存档的常驻 node 进程，Worker 跑不了它。跨域没问题 —— `server/index.mjs` 本来就
发 `Access-Control-Allow-Origin: *`（开发期客户端 5180 打服务 5183，早就是跨域了）。

子域只留一层（`pata-api` 而不是 `api.e`）：Cloudflare 免费版的通配证书只盖一层子域，
`api.e.gamestao.com` 那种两层的进不了边缘证书。

> **游戏没有后端就进不去。** `src/app.ts` 启动时 `if (needsGate()) await openGate()`，
> 登录闸门挡在游戏前面，注册/登录都打 `VITE_API_BASE`。所以"先只发静态页面"不是一个能玩的状态。

## 一次性配置

### 1. 仓库变量（Settings → Secrets and variables → Actions → Variables）

| 变量 | 值 | 作用 |
|---|---|---|
| `PATA_API_BASE` | `https://pata-api.gamestao.com` | 构建时烘进包里的 API 地址 |
| `VPS_HOST` | `128.140.41.98` | |
| `VPS_USER` | `root` | 那把 key 被 `command=` 钉死在 deploy-hook.sh 上 |
| `VPS_KNOWN_HOSTS` | `128.140.41.98 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIECCN0PsdyHVYxNjbeYj8QaHKPOrNS1Phx3ayhQr4Z5W` | 主机公钥写死，不用 keyscan |
| `WEB_DEPLOY_ENABLED` | `true` | 开关，不设就跳过 web job |
| `API_DEPLOY_ENABLED` | `true` | 开关，不设就跳过 api job |

### 2. 仓库密钥（Secrets）

| 密钥 | 从哪来 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare 面板新建，权限至少 `Workers Scripts:Edit`（账号级）；建 custom_domain 还需要 `Zone:Edit` + `DNS:Edit`（gamestao.com） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 面板右栏，和游戏后端那个仓库同一个账号 |
| `VPS_SSH_KEY` | 专给这个仓库生成的 ed25519 私钥（**不要复用日常开发那把，也不要复用游戏后端 CI 那把**），公钥按下面第 4 步装到 VPS |

### 3. DNS（Cloudflare 面板，gamestao.com）

- `e.gamestao.com` —— **不用手工加**，`wrangler deploy` 的 `custom_domain` 会自己建记录和证书。
- `pata-api.gamestao.com` —— 手工加一条 `A → 128.140.41.98`，**灰云（DNS only）**。
  和 `api.gamestao.com` 保持一致：证书由 VPS 上的 Caddy 自己签 Let's Encrypt，橙云代理会打断 HTTP 质询。

### 4. VPS 首次装配（root）

```sh
mkdir -p /root/pata/server
# 这两份文件从本仓库 deploy/ 里拷过去
install -m 755 deploy-hook.sh /root/pata/deploy-hook.sh
cp pata-api.compose.yml /root/pata/pata-api.compose.yml
# 先放一份当前的服务端代码，之后由 CI 覆盖
curl -fsSL https://raw.githubusercontent.com/bigtaoo/e.gamestao/main/pata/server/index.mjs \
  -o /root/pata/server/index.mjs
cd /root/pata && docker compose -f pata-api.compose.yml up -d

# CI 那把公钥，钉死在 hook 上
cat >> /root/.ssh/authorized_keys <<'KEY'
command="/root/pata/deploy-hook.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 <pata-ci 的公钥> pata-ci
KEY
```

### 5. Caddy 入口

`pata-api.gamestao.com` 的 443 入口在游戏后端那套 Caddy 里（它占着这台机器的 443），
站点段落加在 `funny` 仓库的 `server/Caddyfile`：

```caddyfile
pata-api.gamestao.com {
	encode zstd gzip
	reverse_proxy pata-api:5183
}
```

**必须提交进那个仓库**：它的部署流程是 `git reset --hard origin/main`，手工改的会在下一次
后端部署时被恢复掉，表现是某天 pata 突然 502 而这边什么都没动过。

## 日常

`main` 上动了 `pata/**` 就自动发。也可以在 Actions 页面手动 Run。

两个 job 相互独立：只改前端的提交，api job 照样跑（就是把同一份 index.mjs 再送一遍，幂等）。

**回滚**：web 在 Cloudflare 面板的 Deployments 里选旧版本；api 把旧的 `index.mjs` 从 git 历史里
取出来，`ssh pata-ci@vps < index.mjs` 送一遍即可。

**数据**：`/root/pata/server/data.json`，只在宿主机上，**没有备份**。上线前值得加一条 cron。

## 上线前该知道的两件事

1. **账号体系是原型级的。** 密码用 scrypt 存，但 token 明文放 localStorage、没有过期、没有找回。
   公网开放意味着真实用户会用真实密码注册。
2. **`src/assets/placeholder/` 里的参考图不会被发出去**（`.gitignore` 挡着，CI 也拿不到），
   所以线上跑的是矢量版宠物。这是对的 —— 那些图没有授权。
