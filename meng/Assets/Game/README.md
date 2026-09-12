# Game 模块结构（M0 骨架）

设计方案见 `game/游戏设计方案.md`。

## 分层

```
Scripts/Core/      纯 C#，noEngineReferences=true，不引用 UnityEngine
  Model/           存档数据结构（SaveData / FarmState / RoomState / Wallet / Inventory）
  Defs/            配表只读接口（ICropDef / IFurnitureDef / IGameConfig / ComfortTier）
  Services/        ITimeService / IStorage / ISaveCodec
  Systems/         FarmSystem / DecorSystem / EconomySystem / GridMap
  Save/            SaveMigrator

Scripts/Config/    ScriptableObject 实现 Core 的配表接口
Scripts/Runtime/   Unity 胶水层：GameApp 启动、存档读写、时间服务、等距坐标
Scripts/Editor/    CSV -> ScriptableObject 导入工具
Tests/EditMode/    Core 层单测（不依赖 Unity 运行时）
```

**依赖方向单向向下**：Runtime → Config → Core。Core 不知道 Unity 存在，所以核心玩法逻辑能脱离引擎跑单测。

## 三条硬规则

1. **时间只走 `ITimeService`**。任何地方直接用 `DateTime.UtcNow` 都会被改系统时间刷掉离线产出。
2. **成长用时间戳算，不用 Update 累加**。离线回来直接算得出结果，也不怕丢帧。
3. **改 `SaveData` 结构必须配一条迁移**。`SaveData.CurrentSchemaVersion` +1，然后在 `SaveMigrator.Steps` 里注册。漏了会在读档时直接抛异常——这是故意的，总比静默带坏数据上线好。

## 配表工作流

1. 改 `Assets/Game/Config/Csv/*.csv`
2. 菜单 `Game / 配表 / 导入 CSV`（快捷键 Cmd+Shift+I）
3. 生成物在 `Assets/Game/Config/Generated/`，按 id 原地更新，GUID 不变

新增字段时：先在 `Core/Defs` 的接口上加，再在 `Config/DefAssets.cs` 的 `Fill()` 里加，最后在 `ConfigCsvImporter` 里读列。

## 装饰与经营的耦合点

只有一处：`DecorSystem.GetTier()` 返回的 `ComfortTier`。

- `FarmSystem.Plant()` 读 `growthSpeedBonus`，**在播种时锁进 `plot.growSeconds`**——之后装修不会追溯加速已种下的作物。
- `EconomySystem.GetSellPrice()` 读 `sellPriceBonus`。

要加新的装饰增益，加在 `ComfortTier` 上，别在别处再开一条通道。

## 还没做（M1 起）

- 场景：Boot / Login / Home / FriendHome 还没建，`GameApp` 已经预留跳转
- `GameConfigAsset` 实例还没创建，需要在 Unity 里建一个并挂到 `GameApp.config`
- 离线结算、订单板、好友、UI 全部未开始
