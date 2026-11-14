# 实现计划 · PvP 玩家对战

> 由 [spec.md](spec.md) 生成；spec 变了先改 spec，再同步本文件。
> 对应 Issue：[EXIST-D/PixelCampus#11](https://github.com/EXIST-D/PixelCampus/issues/11)
> 状态：待开工（2026-11-14）

## 1. 第一步：验收标准 → 测试函数

| ID | 测试函数 | 类型 | 文件 | 断言 |
|---|---|---|---|---|
| P1 | `srv_invite_accept` | 服务端 | `server/tests/pvp.test.ts` | A 邀请 B、B 接受后双方收到 `pvp_state` |
| P2 | `int_pvp_battle_ui` | 集成 | `tests/integration/pvp-ui.test.ts` | 战斗界面显示双方名字与队伍 |
| P3 | `srv_turn_order` | 服务端 | `server/tests/pvp.test.ts` | 双方行动按速度排序、事件一致 |
| P4 | `unit_pvp_swap` | 单元 | `tests/pvp.test.ts` | 我方倒下后换人 |
| P5 | `srv_foe_swap_wait` | 服务端 | `server/tests/pvp.test.ts` | 对方换人时我方看到等待状态 |
| P6 | `srv_pvp_win` | 服务端 | `server/tests/pvp.test.ts` | 一方全倒 → 另一方胜利，双方结算 |
| P7 | `srv_pvp_flee` | 服务端 | `server/tests/pvp.test.ts` | 逃跑方判负 |
| P8 | `srv_pvp_timeout_skip` | 服务端 | `server/tests/pvp.test.ts` | 超时自动跳过该回合 |
| P9 | `srv_pvp_reconnect` | 服务端 | `server/tests/pvp.test.ts` | 30 秒内重连回到战斗 |
| P10 | `srv_pvp_invite_guard` | 服务端 | `server/tests/pvp.test.ts` | 跨世界 / 视野外 / 战斗中拒绝 |
| N1 | `unit_client_no_settle` | 源码扫描 | `tests/pvp-source-safety.test.ts` | 客户端不调用结算函数 |
| N2 | `srv_pvp_bad_ids` | 服务端 | `server/tests/pvp.test.ts` | 非法 battle id / 回合号被拒 |
| N3 | `srv_pvp_non_participant` | 服务端 | 同上 | 非参战玩家不能行动 |
| N4 | `srv_pvp_single_battle` | 服务端 | 同上 | 同一时间只能一场 |
| N5 | `srv_pvp_cross_world` | 服务端 | 同上 | 跨世界邀请被拒 |
| N6 | `srv_pvp_invite_busy` | 服务端 | 同上 | 对方战斗中 / 钓鱼 / 宿舍时拒绝 |
| N7 | `int_pvp_panel_blocked` | 集成 | `tests/integration/pvp-ui.test.ts` | 战斗中不能开精灵面板 |
| N8 | `srv_pvp_timeout_no_stuck` | 服务端 | `server/tests/pvp.test.ts` | 超时不会卡死 |
| N9 | `srv_pvp_reconnect_no_extra_turn` | 服务端 | 同上 | 重连不重复结算 |
| N10 | `srv_pvp_flee_no_reward` | 服务端 | 同上 | 逃跑方无奖励 |
| N11 | `srv_pvp_no_double_win` | 服务端 | 同上 | 不会双方都胜 |
| N12 | `unit_no_innerhtml` | 源码扫描 | `tests/pvp-source-safety.test.ts` | 不含 `innerHTML` |

## 2. 实现顺序

1. 共享：`pvp.ts`（PvP 战斗纯逻辑：双方队伍、回合、结算）
2. 协议：`pvp_invite` / `pvp_reply` / `pvp_act` / `pvp_leave` / `pvp_invite` / `pvp_state` / `pvp_end`
3. 服务端：`server/pvp.ts` + handler（会话、超时、断线、邀请校验）
4. 客户端：`PvpUi`（邀请弹窗 + 战斗界面，复用 `BattleUi` 的事件播放）
5. 测试 + 文档

## 3. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/shared/pvp.ts`（新） | PvP 战斗状态、行动校验、回合结算（复用 `step` 的伤害/AI 逻辑） |
| `src/shared/protocol.ts` | 7 条新消息 |
| `src/net/client.ts` | 新方法 |
| `server/pvp.ts`（新） | 会话管理、超时、断线、邀请校验 |
| `server/handlers/pvp-handler.ts`（新） | 注册消息 |
| `src/ui/PvpUi.ts`（新） | 邀请弹窗 + 战斗界面 |
| `src/scenes/world/wire-panels.ts` | 接入 |
| `tests/pvp.test.ts`、`tests/integration/pvp-ui.test.ts`、`tests/pvp-source-safety.test.ts` | 单元 / 集成 / 源码扫描 |
| `server/tests/pvp.test.ts` | 服务端 |
| `docs/` | FEATURES / CHANGELOG / MULTIPLAYER / feature |

## 4. 详细设计

### 4.1 共享 `pvp.ts`

```ts
export interface PvpBattle {
  bid: string;
  /** 双方队伍（a / b 是玩家 uid） */
  sides: { a: PvpSideState; b: PvpSideState };
  turn: number;
  phase: 'choose' | 'swap' | 'over';
  result?: { winner: 'a' | 'b' | 'none'; reason: 'faint' | 'fled' | 'timeout' };
  /** 本回合双方提交的行动 */
  actions: { a?: Action; b?: Action };
}
export interface PvpSideState { uid: number; name: string; squad: Mon[]; lead: number }
```

- `pvpStep(ct, b, rnd)`：双方都提交后结算一回合，返回双方各自的事件列表。
- 复用 `calcDamage` / `hitRate` / `bumpStage` / `applyStatus`，不重写规则。
- 双方满血进入（`squad` 是副本，不改存档）。

### 4.2 服务端 `server/pvp.ts`

- `invite(from, to)`：校验同世界、视野内、双方不在战斗、被邀请方不在钓鱼 / 宿舍。
- `accept` / `reject`：30 秒有效。
- `act(uid, bid, turn, action)`：校验参战、回合、阶段；双方都提交后调 `pvpStep`，推 `pvp_state` 给双方。
- 超时：每回合 60 秒，超时方自动提交「跳过」。
- 断线：30 秒内重连发当前 `pvp_state`；超时判负。
- 结束：推 `pvp_end`，清理会话；**不写存档**。

### 4.3 客户端

- 邀请弹窗：复用现有 `.mon-enc` 样式。
- 战斗界面：复用 `BattleUi` 的结构（双方卡片 + 事件播放），但数据源换成 `pvp_state`。
- 事件播放和结算：沿用 `BEvent`。

## 5. 测试计划

- 单元：`tests/pvp.test.ts`（回合结算、换人、逃跑、超时）
- 集成：`tests/integration/pvp-ui.test.ts`（邀请弹窗、战斗界面、面板禁用）
- 服务端：`server/tests/pvp.test.ts`（双人 WebSocket、邀请校验、超时、断线）
- 源码扫描：客户端不结算、不含 `innerHTML`
- 全量：`npm test` / `tsc` / `vite build` / 服务端配置

## 6. 复用已有能力

| 能力 | 位置 | 用法 |
|---|---|---|
| 伤害 / 状态 / 能力等级 | `src/shared/battle.ts` | `pvpStep` 内部复用 |
| 事件回放 | `BattleUi` | PvP 战斗界面复用 |
| 邀请弹窗 | `TradePanel` / `PartyPanel` | 复用样式 |
| 世界 / 好友校验 | `server/worlds.ts` / `social.ts` | 邀请范围校验 |
| 面板互斥 | `WorldScene.anyOverlay` | 战斗中禁止打开其他面板 |

## 7. 环境 / 账号 / 数据 / 依赖

- 本地：`npm run server` + `npm run dev`；**需要两个浏览器会话**（普通 + 隐身窗口）才能双人测试。
- 测试服：需要两个测试 token / 两个浏览器。
- 无新依赖；不写存档。

## 8. 风险与回滚

| 风险 | 处理 |
|---|---|
| 双人同步复杂 | 先做「双方都提交才结算」，最坏情况超时跳过 |
| 断线重连 | 30 秒窗口 + 超时判负；服务端只认 session |
| 和 PvE 会话冲突 | 同一时间只能一场；PvE 入口检查 PvP 状态 |
| 协议改动 | additive，`PROTOCOL_VERSION` 不升 |
| 回滚 | 新增文件为主，PvE 不受影响 |

## 9. 完成定义（DoD）

- [ ] P1–P10、N1–N12 测试存在 / 通过
- [ ] `npm test`、`tsc`、`vite build`、服务端测试全绿
- [ ] 测试服双人 E2E：邀请 → 接受 → 对战 → 结算
- [ ] 超时 / 断线 / 逃跑都有处理
- [ ] 不写存档
- [ ] FEATURES / CHANGELOG / MULTIPLAYER / feature 同步

## 10. 提交 / PR 拆分

1. `共享：PvP 战斗状态与回合结算`
2. `协议：PvP 消息`
3. `服务端：PvP 会话、超时与断线`
4. `客户端：邀请弹窗与战斗界面`
5. `测试与文档：PvP 用例、FEATURES/CHANGELOG/MULTIPLAYER`
