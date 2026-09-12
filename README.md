# e.gamestao

两个游戏和一份设计资料。

| 目录 | 是什么 | 状态 |
|---|---|---|
| `pata/` | 云养宠网页版：PixiJS 8 + TS + Vite，外加一个零依赖的好友服务（`pata/server/index.mjs`） | **已上线** → https://e.gamestao.com |
| `meng/` | Unity URP 工程（Config / Scripts / Tests，纯逻辑层 + 单测） | 还没有任何场景文件，构建出来是空的 |
| `game/` | 设计方案（`游戏设计方案.md`）与参考图 | — |
| `deploy/` | 上线用的配置与脚本 | 见 [`deploy/README.md`](deploy/README.md) |

## 开发

```bash
cd pata
npm install
npm run dev        # 客户端 http://localhost:5180
npm run server     # 好友服务 http://localhost:5183（可选，不起也能离线玩）
npm run build      # tsc --noEmit + vite build
```

细节（玩法、数值、代码结构、调试控制台）看 [`pata/README.md`](pata/README.md)。

## 部署

**合进 `main` 就自动发**，只要这次改动碰了 `pata/**`：GitHub Actions 会构建前端发到
Cloudflare、把好友服务推到 VPS，两边各跑一次冒烟检查。不用手工做任何事，也不需要谁的本机。

要改部署本身、重建整套环境、或者只是想知道密钥 / DNS / 服务器那半边长什么样 ——
[`deploy/README.md`](deploy/README.md) 里全写着。
