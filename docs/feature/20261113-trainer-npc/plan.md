# 实现计划 · 训练家 NPC 与 10–20 级区域

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#9](https://github.com/EXIST-D/PixelCampus/issues/9)
> 状态：待开工（2026-11-13）

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `int_trainer_dialog` | 集成 | `tests/integration/trainer-ui.test.ts` | 按 E 弹对话，有「切磋 / 下次吧」 |
| P2 | `int_trainer_battle_start` | 集成 | 同上 | 开战后显示训练家名字和对方队伍 |
| P3 | `unit_trainer_swap` | 单元 | `tests/trainer-battle.test.ts` | 对方精灵倒下后换人，事件正确 |
| P4 | `unit_trainer_lose` | 单元 | 同上 | 我方全灭回半血、回校门口 |
| P5 | `unit_trainer_first_reward` | 单元 | 同上 | 首次胜利发奖励，`trainers` 记录 |
| P6 | `unit_trainer_repeat_no_reward` | 单元 | 同上 | 再次挑战可打、无奖励 |
| P7 | `unit_trainer_flee` | 单元 | 同上 | 逃跑结束、无奖励、可再挑战 |
| P8 | `unit_trainer_cooldown` | 单元 | 同上 | 30 秒内不能再开战 |
| P9 | `unit_hill_deep_zone` | 单元 | `tests/wild-zones.test.ts` | `hill-deep` 等级 / 出没 / 不重叠 |
| P10 | `unit_trainer_ai` | 单元 | `tests/trainer-ai.test.ts` | 60% 克制、低血换人、确定性 |
| N1 | `unit_trainer_bad_id` | 单元 | `tests/trainer-battle.test.ts` | 非法 id 返回错误不崩溃 |
| N2 | `unit_trainer_cooldown` | 单元 | 同上 | 冷却中拒绝 |
| N3 | `unit_old_save_no_trainers` | 单元 | 同上 | 旧存档无字段正常 |
| N4 | `unit_trainer_no_fainted_swap` | 单元 | 同上 | 倒下的精灵不能上场 |
| N5 | `unit_trainer_one_battle` | 单元 | 同上 | 同时只能有一场 |
| N6 | `unit_trainer_no_double_reward` | 单元 | 同上 | 奖励只发一次 |
| N7 | `unit_hill_zones_no_overlap` | 单元 | `tests/wild-zones.test.ts` | 两个区域不重叠 |
| N8 | `unit_client_no_settle` | 源码扫描 | `tests/source-safety.test.ts` | 客户端不结算 |
| N9 | `unit_no_innerhtml` | 源码扫描 | 同上 | 不含 `innerHTML` |

## 2. 实现顺序

1. 共享：`Battle` 扩展 `foeSquad` / `foeLead`；`trainer-ai.ts`；`monbox.ts` 的 `trainers` 字段。
2. 共享：训练家数据 `src/shared/trainers.ts`（id / 名字 / 位置 / 队伍 / 台词 / 奖励）。
3. 协议：`trainer_battle`、`trainer_data`、`mon_bt` 扩展。
4. 服务端：`server/trainers.ts` + handler；奖励发放；进度持久化。
5. 客户端：训练家 NPC 实体、对话框、战斗界面适配。
6. 美术：三个训练家的 Look。
7. 地图：`zones.json` 切分 + `hill-deep`。
8. 测试 + 文档。

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/battle.ts` | `foeSquad` / `foeLead`；对方换人 |
| `src/shared/trainer-ai.ts`（新） | 出招 / 换人策略（纯函数） |
| `src/shared/trainers.ts`（新） | 训练家定义 |
| `src/shared/monbox.ts` | `trainers?: number[]` + `cleanMonSave` |
| `src/shared/protocol.ts` | 新消息 + `mon_bt` 扩展 |
| `src/net/client.ts` | 新方法 |
| `server/trainers.ts`（新） + `server/handlers/` | 会话 / AI / 奖励 / 进度 |
| `server/mons.ts` | 训练家对战入口 |
| `src/ui/BattleUi.ts` | 训练家名字、对方队伍、换人日志 |
| `src/scenes/world/*` | 训练家 NPC 生成、对话交互 |
| `src/art/char-rig.ts` | 三个训练家 Look |
| `data/mons/zones.json` | `hill` 切分 + `hill-deep` |
| `tests/` | 各单元 / 集成 / 服务端测试 |
| `docs/` | FEATURES / CHANGELOG / MULTIPLAYER / feature |

## 4. 详细设计

### 4.1 `Battle` 扩展

```ts
export interface Battle {
  ...;
  /** 对方队伍（野生精灵是长度 1 的特例） */
  foeSquad: Mon[];
  /** 对方当前上场 */
  foeLead: number;
}
```

- `startBattle(bid, wild, squad)` 保持兼容：内部把 `wild` 包成 `foeSquad = [wild]`。
- 新增 `startTrainerBattle(bid, foeSquad, squad)`。

### 4.2 `trainer-ai.ts`

```ts
export function aiChooseMove(ct: Content, b: Battle, rnd: Rng): number;
export function aiWantsSwap(ct: Content, b: Battle, turnsSinceSwap: number, rnd: Rng): boolean;
```

- 60% 选克制招；低血 + 条件满足 30% 换人。
- 确定性：随机调用顺序固定。

### 4.3 训练家数据

```ts
export interface TrainerDef {
  id: string; name: string; poi: string;
  squad: { sp: string; lv: number }[];
  before: string; afterWin: string; afterLose: string; again: string;
  reward: { coins: number; items?: { id: string; n: number }[] };
}
```

### 4.4 服务端

- `TrainerBattle`：会话、冷却、AI、奖励、进度。
- 奖励只发一次：`trainers` 里已有 id 就不发。
- 冷却 30 秒按玩家记。

### 4.5 地图

- `hill` → `[340, 24, 390, 100]`，`[5, 9]`
- `hill-deep` → `[390, 24, 440, 100]`，`[10, 20]`，青鳞稀有

## 5. 测试计划

- 单元：`tests/trainer-battle.test.ts`、`tests/trainer-ai.test.ts`、`tests/wild-zones.test.ts`
- 集成：`tests/integration/trainer-ui.test.ts`
- 服务端：`server/tests/trainer.test.ts`
- 全量：`npm test`、`tsc`、`vite build`、服务端配置

## 6. 复用已有能力

- `Npc` 实体（`wander = false`）
- `Character` / `Look` Rig 管线
- 现有 `Mon` / `Battle` / 事件回放
- 现有 `mon_bt` 事件播放
- `cleanMonSave` 的兼容模式

## 7. 环境 / 账号 / 数据 / 依赖

- 本地 `server/` + `npm run server` + `npm run dev`
- 测试服部署权限
- 无新依赖

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| `Battle` 结构改动影响野生战斗 | 单只野生走兼容构造；既有测试兜底 |
| 服务端会话冲突 | 同一时间只允许一场；N5 |
| 奖励重复发放 | `trainers` 去重；N6 |
| 地图区域切分影响现有出没 | 只改 `rect`，等级不变；单测核对不重叠 |
| 回滚 | 共享规则 + 服务端 + 数据，按提交 revert |

## 9. 完成定义（DoD）

- [ ] P1–P10、N1–N9 测试存在 / 通过
- [ ] `npm test`、`tsc`、`vite build`、服务端测试全绿
- [ ] 测试服 E2E 通过
- [ ] 旧存档兼容
- [ ] FEATURES / CHANGELOG / MULTIPLAYER / feature 同步

## 10. 提交 / PR 拆分

1. `共享：Battle 双方队伍结构 + 训练家 AI`
2. `服务端：训练家对战会话、奖励与进度`
3. `客户端：训练家 NPC、对话与战斗界面`
4. `美术：三个训练家造型`
5. `地图：北山坡切分与 10–20 级区域`
6. `文档：FEATURES / CHANGELOG / MULTIPLAYER / feature`
