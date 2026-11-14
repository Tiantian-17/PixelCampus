# 实现计划 · IR #19 校园耕作

> 对应需求：[spec.md](spec.md) · Issue [#19](https://github.com/EXIST-D/PixelCampus/issues/19)

| 项 | 内容 |
|---|---|
| 状态 | 已确认（2026-11-13） |
| 对应需求 | [spec.md](spec.md)（R1~R10，Issue `#19`） |
| 负责 | 客户端 + 共享规则 + 协议：Tiantian-17；服务端 handler：主人（私有库 `PixelCampus-server`） |
| 预计工作量 | 中（共享规则 + 面板 + 传送入口 + 16 个物品图标；服务端另算） |

> ⚠️ **现行规则（2026-11-13 已变更，以实现为准，别照本文重做服务端）**
> 本文以下内容是**最初的实施计划**，下面这些规则后来被改掉了：
> - **地块**：每人 **16 块**（不是 6 块），每块 2×2，4 列 × 4 行；农场是独立室内空间，主入口是北山林地的大树洞，传送面板「其他 · 我的农场」也保留。
> - **浇水**：**完全免费、不限次数**（每块地每个游戏日仍只能浇一次）。「每天 12 次免费 + 超出 1 币」和「花钱请管理员代浇（`hire_water`）」都已删除。
> - **枯萎**：**已删除**，成熟后永久保留；随之没有 `wilted` 阶段、`WILT_DAYS` 和 `clear` 操作。
> - **存档 / 协议**：`FarmSave { plots, day, sl, log }`（`wu` 已去掉）；`farm` 消息没有 `waterLeft`；`farm_result` 新增可选 `op`。
> - **偷摘**：每人每天 3 次、单块地最多被摘 1 次、产量 1 的作物不可偷（这条没变）。
> 逐条变更见 [CHANGELOG](../../CHANGELOG.md) 的 2026.11.13 条目。

## 1. 方案概述

**一句话**：规则全部写成 `src/shared/farming.ts` 的纯函数（含懒结算的成长推进），地块状态由服务器持有并通过一条 `farm` 消息整包下发；客户端负责一块**私人农场室内空间**（和宿舍一样传送进去，6 块耕地画在底图上，走近按 E 开面板）和一个传送入口。

**为什么这样做**

1. **跟钓鱼一个范式**：`shared/fishing.ts` 里放抽鱼/尺寸/抛竿判定的纯函数，服务端结算、客户端渲染。耕作照抄这套，主人实现服务端时 handler 会很薄（见 §3.3）。
2. **成长用"懒结算"而不是定时器**：不跑"每天遍历所有玩家地"的定时任务。任何时候读到一份 `farm` 存档，就调用 `settleFarm(save, today)` 把欠下的天数补算出来。这样零 CPU 开销，玩家离线三天回来也能正确长成/枯萎。
3. **农场是一块独立空间**（2026-11-13 主人纠正，取代"只做面板"）：新增室内 `data/interiors/farm.json`（30×20，theme `farm`），底图直接缩手绘 `farm-source.png`（`tools/art/farm-bg.ts`，顺带抹掉右下角水印），6 块耕地按 `FARM_PLOTS` 对齐；作物用透明底状态图放大 3 倍盖在地块中央。入口仍是传送面板（`shared/teleport.ts` 的 `poi: 'north-hill'`，服务器用 `standNear` 找落脚点），但传送成功后客户端淡出进室内而不是弹面板；服务器继续用"距 north-hill ≤ 24 格"校验操作，室内期间世界坐标不变，所以不用改服务端。

**对现有结构的影响**

- `src/shared/protocol.ts`：加 4 条消息（都带注释，`npm run protocol:doc` 自动进文档）。
- `src/shared/items.ts`：+16 个物品（8 作物 + 8 种子），走 `ICONS` 一致性测试。
- `src/shared/economy.ts`：`SHOP` 加 8 条种子；`sellPrice()` 认识作物（固定价）。
- `src/shared/teleport.ts`：加「校园农场」与 `其他` 分组。
- `src/ui/`：新增 `FarmPanel.ts` + 样式；不改现有文件的结构。

## 2. 任务拆分

每个任务单独提交；T2 与 T3 可并行（文件不重叠）。

| 任务 | 内容 | 主要文件 | 依赖 | 验收 | 状态 |
|---|---|---|---|---|---|
| T1 | 共享规则：作物表、`settleFarm`/`plotStage`/`canPlant`/`stealLimit`/`cleanFarm` 与各项上限常量 | `src/shared/farming.ts`、`tests/farming.test.ts` | — | 单测通过 | ✅ |
| T2 | 物品与经济：8 作物 + 8 种子物品、商店上架、`sellPrice` 认识作物、程序化图标 | `src/shared/items.ts`、`src/shared/economy.ts`、`tools/art/items.ts` | T1 | `npm run assets` 后图集有图标；相关测试全绿 | ✅ |
| T3 | 协议 + 传送点：`farm_get` / `farm_op` / `farm` / `farm_result`，传送面板加「校园农场」 | `src/shared/protocol.ts`、`src/shared/teleport.ts`、`docs/architecture/PROTOCOL.md`（生成） | T1 | `npm run protocol:doc` + 协议测试通过 | ✅ |
| T4 | 网络层：发送方法 + handlers | `src/net/client.ts` | T3 | `tsc` 通过 | ✅ |
| T5 | 面板：我的田 / 种子袋 / 访客三页，状态与操作按钮、日志、每日次数 | `src/ui/FarmPanel.ts`、`src/ui/styles/17-farm.css`、`src/ui/style.css` | T4 | 浏览器能看到面板、离线提示正确 | ✅ |
| T6 | 接线：面板注册（菜单入口 + Esc）、传送成功后自动开面板 | `src/scenes/world/wire-panels.ts`、`src/ui/TeleportPanel.ts` | T5 | 传送「校园农场」后自动弹面板 | ✅ |
| T7 | 服务端（私有库）：handler + 存档字段 + 校验，清单见 §3.3 | `server/handlers/farm-handler.ts` + `server/store.ts` + `server/game.ts` + `server/tests/farm.test.ts` | T1~T4 | 服务端测试 + 测试环境联测 | ✅ |
| T8 | 文档收尾：FEATURES / CHANGELOG / 状态改为已完成 | `docs/FEATURES.md`、`docs/CHANGELOG.md` | 全部 | — | ✅ |

## 3. 协议与数据变更

### 3.1 消息（`src/shared/protocol.ts`）

```ts
// 客户端 → 服务器
| { t: 'farm_get'; uid?: number }   // 看自己（省略 uid）/ 看别人的田
| { t: 'farm_op'; op: FarmOp; slot: number; seed?: string; uid?: number }
  // FarmOp = 'till' | 'plant' | 'water' | 'harvest' | 'clear' | 'steal' | 'help_water'
  // uid 省略 = 自己的地；steal / help_water 必须带别人的 uid

// 服务器 → 客户端
| { t: 'farm'; uid: number; name: string; mine: boolean; today: number;
    plots: FarmPlot[]; waterLeft: number; stealLeft: number;
    log: FarmLogEntry[] }
| { t: 'farm_result'; ok: boolean; msg: string }
```

- 操作成功后服务器推送最新的 `farm` + `inv`（复用现有 `inv` 消息）+ `coins`（如果扣了浇水费）。**不新造增量同步**。
- `today` 是服务器算的游戏日，客户端用它显示"今天浇过没有"，避免设备时钟偏差。

### 3.2 存档字段（玩家档案，全部可选）

```ts
/** 一块地：c=作物 id（'' 空地）；p=种下的游戏日；w=已经浇过几个游戏日的水；wd=最后一次浇水的游戏日；k=已被偷个数 */
export interface FarmPlot { c: string; p: number; w: number; wd: number; k: number }
export interface FarmSave {
  plots?: FarmPlot[];   // 6 块，缺省 = 全空
  day?: number;         // 日计数所属的游戏日
  wu?: number;          // 当天已用免费浇水次数
  sl?: number;          // 当天已偷摘次数
  log?: FarmLogEntry[]; // 最近 20 条：{ d: 游戏日; n: 昵称; c: 作物; k: 个数 }
}
```

- 成长不用补算：成熟 = 浇够 `days` 次水 **且** 过了 `days` 个游戏日；枯萎 = 成熟后再过 `WILT_DAYS` 个游戏日。`settleFarm` 只负责跨天归零 `wu` / `sl`。

- 读取一律过 `cleanFarm()`：字段缺失 → 空田；数组超长 → 截断到 6；非法作物 id → 清空该块；日志截断到 20 条、昵称截断长度。
- **老档案兼容**：没有 `farm` 字段 = 全空田，不迁移、不写盘（默认值不落盘）。
- 体积：约 250~400 字节/人（日志只在被偷后才出现）。

### 3.3 服务端清单（主人在私有库实现）

1. `register(d)` 里登记 `farm_get` / `farm_op`，`limit` 用现有的低频档（建议 5 次/秒），`breaks: false`。
2. `farm_get`：
   - 省略 uid → 取自己的档案；带 uid → 校验是好友（复用好友表），不是好友返回"看不到"。
   - 先 `settleFarm(save, gameDayAt(now))`，再下发 `farm`。
3. `farm_op` 的每个 op 校验：
   - `till`：目标地块是空地或枯萎；玩家在农场区域（`FARM_ZONE`）内。
   - `plant`：`canPlant(cropId)`（不分季节）；背包里有 `seed_x` 且 `invTake` 成功；地块为空。
   - `water` / `help_water`：目标地块有作物且未枯萎；当日免费次数 `wu < WATER_FREE_DAILY`，否则扣 `WATER_COIN_COST` 币（余额不足则拒绝）；`help_water` 还要校验好友关系与对方地块。
   - `harvest`：只能收自己的；`plotStage === 'ripe'`；产出 `harvestYield(plot) - plot.k` 个，`invAdd` 进背包。
   - `steal`：对方是好友、地块成熟、`stealLeft > 0`、该地块今天没被偷过、`stealLimit(plot) > plot.k`；偷到 1 个，写日志。
   - `clear`：只能清自己的枯萎地（免费）。
4. 每个 op 成功后：落盘（现有节流机制）+ 回 `farm_result` + 推送 `farm` / `inv` / `coins`。
5. 每日重置：`day !== gameDayAt(now)` 时把 `wu` / `sl` 归零并更新 `day`（在 `settleFarm` 里做）。
6. 无需新定时器；成长与枯萎在读取时懒结算。

## 4. 测试计划

- **规则测试** `tests/farming.test.ts`：
  - `settleFarm`：连浇 4 天 → 番茄成熟；漏浇一天 → 少长一天；三天不上线 → 成熟后第 3 天变枯萎；未成熟不会枯萎。
  - `plotStage` 在四个边界（g=0 / 0<g<天数 / g=天数 / 枯萎）上的返回值。
  - `canPlant`：四季 × 8 作物，任何组合都返回 `ok: true`；不存在的作物 `ok: false`。
  - 偷摘：`stealLimit` 对产量 1 / 2 / 3 的作物分别是 0 / 1 / 1，且永远 `yield - limit >= 1`。
  - `cleanFarm`：`undefined` / 乱码 / 超长数组 / 非法作物 id。
- **物品一致性**：对 8 作物 + 8 种子断言 `itemDef(id)` 与 `ICONS[id]` 都存在（照 `tests/fishing2.test.ts` 的写法）。
- **浏览器验证（单机 `?offline`）**：传送面板能看到「校园农场」；农场面板能打开、离线灰态正确；用一份假 `farm` 数据渲染四种地块状态（临时在控制台调 `farmUi` 的渲染入口）。
- **验证不到的**：真机、多人偷菜/帮浇、服务端扣费与每日重置——需要主人部署到测试环境后联测，如实写进 PR。

## 5. 上线计划

- **必须同时部署服务端**（新增 `src/shared/farming.ts` + `protocol.ts` 消息 + `items.ts` / `economy.ts` / `teleport.ts`）。
- 部署前备份：玩家档案（新增可选字段，回滚只是"新字段被忽略"）。
- `npm run assets` 需要重跑（新增 16 个物品图标 → 物品图集变化），部署前一起上。
- 回滚：去掉 `farm` 相关消息、面板与传送项即可，档案里的 `farm` 字段会被旧代码忽略，**无迁移风险**。
- `PROTOCOL_VERSION` 不需要升（纯新增消息 + 可选字段）。

## 6. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 偷菜是纯损失 | 玩家体验差、不想种 | 给主人留至少 1 个、产量 1 的作物不可偷、每日上限 3 次；帮浇水作为正向社交 |
| 两种"日"混用（游戏日 vs 东八区真实日） | 成长/重置错位 | 全部用 `gameDayAt()` / `seasonAt()`；`marketDay()` 只给商店行情用 |
| 面板里的操作与服务端结算不一致 | 显示成功但没扣种子 | 客户端只发请求，成功后以服务器推送的 `farm` / `inv` 覆盖本地显示 |
| 新增物品超出图集尺寸 | 打包/图集测试失败 | T2 后跑 `npm run assets` + `tests/atlas-size.test.ts` |
| 传送落点被树挡住 | 玩家传送失败 | 服务器已有 `standNear` 自动找能站的位置；若仍失败，把落点改成 `poi: 'north-hill'` 附近的道路点 |

## 7. 进度记录

| 日期 | 做了什么 / 提交 | 备注 |
|---|---|---|
| 2026-11-13 | spec + plan 确认 | 主人拍板：数值压在经济之下、规则从简、不做盆栽、不送种子、只做传送+面板 |
| 2026-11-13 | T7 完成（服务端） | `server/handlers/farm-handler.ts`：`farm_get`（自己/好友）+ 7 个操作，做位置（北山林地 24 格内）、好友、季节、每日上限校验，扣种子扣币、偷摘留痕、跨天归零；存档字段 `fm` 接入 `Saved`（空田不落盘）。新增 `server/tests/farm.test.ts` 5 个联机用例全绿；`teleport.test.ts` 的传送点计数 16 → 17。全量测试剩 4 个与本次无关的环境失败（没有 `dist/` 和 `.br` 预压缩产物、猫战斗美术未构建）。`server/` 在公开库里是 gitignore，改动要提交到私有库 `PixelCampus-server` |
| 2026-11-13 | 改为私人农场室内（主人纠正） | 传送「我的农场」→ 淡出进 `InteriorScene`（id `farm`）；底图换手绘 `farm-source.png`（程序化木屋太丑），作物状态改透明底 ×3 盖在耕地上；走近按 E 开面板、面板开着原地不动；`server/tests/teleport.test.ts` 名字改「我的农场」 |
| 2026-11-13 | T1~T6、T8 完成（客户端 + 共享规则） | `npx vitest run` 63 文件 629 通过 / 3 跳过；`tsc --noEmit` 绿；浏览器验证：`?offline` 能进游戏、传送面板有「校园农场」、农场面板离线提示正确。T7 服务端待主人在私有库实现（清单见 §3.3）；本地没跑过资源构建的副本要先按 `tools/build-assets.ts` 的顺序重建 `public/assets/generated`，否则会卡在「读取地图…」 |
| 2026-11-13 | 买卖改到「农场管理员」（主人要求） | `ShopPanel` 新增 `farm` 模式（买种子 / 卖菜两页，无筛选标签、无一键出售 / 合成）；`InteriorNpc.shop: 'farm'` + `data/interiors/farm.json` 给管理员挂上，室内按 E 直接开商店（`shopUi` 进 registry）；`ShopHandler` 复用 `FARM_POI` / `FARM_REACH`（常量移到 `shared/farming.ts`）在农场放行，只许买 `seed_*`、卖作物；`FarmPanel` 种子袋文案同步。新增 `server/tests/farm.test.ts` 管理员用例；`tsc` 绿，farming / interior / farm / shop-model 共 76 项通过；`interiors.json` 已重建，`DATA_V` → 20261114 |
