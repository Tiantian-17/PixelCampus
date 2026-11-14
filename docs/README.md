# 文档索引（2026-11-10 按工程化目录整理）

> 文档按用途分目录：入口与现状 → 架构 → 设计 → 地图 → 美术 → 指南 → 流程 → 决策记录（ADR）→ 功能规范（feature）。**新增 / 删除 / 重命名文档时同步改这里。**
> 状态：✅ 现行（和代码一致）· 🔄 自动生成（别手改）· 📜 历史记录（细节以代码为准）· ⚠️ 部分过期（已标注）。

## 目录结构
```
docs/
├─ README.md            本索引
├─ HANDOFF.md           项目交接 / 现状（新对话、新协作者先读）
├─ FEATURES.md          现有功能清单（每次更新必改）
├─ CHANGELOG.md         更新记录（每次更新必改）
├─ architecture/        架构与协议：ARCHITECTURE.md、PROTOCOL.md（生成）
├─ design/              系统设计：ECONOMY.md、MULTIPLAYER.md（历史）
├─ map/                 地图：MAP_PIPELINE.md、MAP_EDITOR.md、SCALE.md、GLB_REFERENCE.md
├─ art/                 美术与素材：ART_STYLE.md、ASSETS_AND_LICENSES.md、img/
├─ guide/               玩家 / 使用指南：FISHING_GUIDE.md（生成）+ 模板
├─ process/             协作流程：COLLABORATION.md、SERVER_COLLABORATION.md
├─ adr/                 架构决策记录（为什么这样做）
├─ feature/             功能规范：spec.md + plan.md 模板；<日期-名称>/ 每个功能一份
└─ private/             私有文档（仅主人本机和私有备份仓库，不在公开仓库里）
```

## 入口与现状（每次更新必改的放这里）
| 文档 | 内容 | 状态 | 怎么维护 |
|---|---|---|---|
| [../README.md](../README.md) | 项目入口：简介、快速开始、玩法一览、目录、许可 | ✅ | 数字（建筑 / 鱼种）变了就改 |
| [../CLAUDE.md](../CLAUDE.md) | 给 AI 助手和协作者的工作约定 | ✅ | 约定变了就改 |
| [HANDOFF.md](HANDOFF.md) | 项目交接 / 现状：目录地图、规模、设计要点、已知偏差与待办、调试手册 | ✅ | 结构 / 约定大变时改 |
| [FEATURES.md](FEATURES.md) | 现有功能清单（注明是否已部署，50KB） | ✅ | **每次更新同步改**（后续按模块重排） |
| [CHANGELOG.md](CHANGELOG.md) | 更新记录（按日期倒序，170KB；版本号 2026.11.x 是自编序号） | ✅ | **每次更新在最上面加一节**（后续按月归档） |

## architecture/ 架构与协议
| 文档 | 内容 | 状态 |
|---|---|---|
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | 数据流、客户端 / 服务端分层、信任模型、测试与 CI、世界放大与流式加载 | ✅ |
| [PROTOCOL.md](architecture/PROTOCOL.md) | 联机消息索引（每种消息的方向与说明，按功能分组） | 🔄 `npm run protocol:doc`，测试检查是否最新 |

## design/ 系统设计
| 文档 | 内容 | 状态 |
|---|---|---|
| [ECONOMY.md](design/ECONOMY.md) | 货币、收入 / 支出、卖鱼价格、平衡推演、校园墙 / 交易 / 垃圾桶 / 名人堂 | ⚠️ 设计加推演值；**真实价格以 `src/shared/economy.ts` 为准**，染料 / 家具 / 留言板限额等后加的没收录 |
| [MULTIPLAYER.md](design/MULTIPLAYER.md) | 联机设计历史：按批次的需求、决策、移动校验、各批功能 | 📜 当前消息以 PROTOCOL.md 为准；新设计写进 feature/ |

## map/ 地图
| 文档 | 内容 | 状态 |
|---|---|---|
| [MAP_PIPELINE.md](map/MAP_PIPELINE.md) | 数据来源与可信度、坐标系、校验工作流、各区域重做记录、已知偏差 | ✅ |
| [MAP_EDITOR.md](map/MAP_EDITOR.md) | 地图编辑器：用法、手动层格式、部署后并入、室内编辑器、给 AI 的流程 | ✅ |
| [SCALE.md](map/SCALE.md) | 尺度约定（1 格 = 2.5 m，世界放大 2 倍） | ✅ |
| [GLB_REFERENCE.md](map/GLB_REFERENCE.md) | 校园 GLB 模型：能信多少、用在哪些区域、工具 | 📜 模型只作参考 |

## art/ 美术与素材
| 文档 | 内容 | 状态 |
|---|---|---|
| [ART_STYLE.md](art/ART_STYLE.md) | 美术风格（"春日校园"）与预览脚本 | ✅（很短） |
| [ASSETS_AND_LICENSES.md](art/ASSETS_AND_LICENSES.md) | 素材来源与许可、敏感词库说明 | ✅ |
| [img/](art/img/) | 文档配图（人物 Rig、小猫、小地图等） | ✅ |

## guide/ 指南
| 文档 | 内容 | 状态 |
|---|---|---|
| [FISHING_GUIDE.md](guide/FISHING_GUIDE.md) | 钓鱼攻略（玩家手册，表格从真实规则生成；模板 `FISHING_GUIDE.template.md`） | 🔄 `npm run guide`，测试检查是否最新 |

## process/ 协作流程
| 文档 | 内容 | 状态 |
|---|---|---|
| [COLLABORATION.md](process/COLLABORATION.md) | 多人协作：fork + PR、主人审核、部署由主人或授权协作者手动执行 | ✅ |
| [SERVER_COLLABORATION.md](process/SERVER_COLLABORATION.md) | **别人怎么改服务端**：三种协作方式、新字段 / 新协议 / 校验 / 测试 / 上线规则、协作者清单 | ✅（新） |

## adr/ 决策记录
[adr/README.md](adr/README.md)：为什么这样做（模板 + 13 份：公开 / 私有分离、shared 规则服务器裁决、token 身份、地图以卫星图为准、程序化美术、档案冻结、留言图片、部署由主人执行、服务端 handler 拆分、测试环境、协作者自助部署、服务端独立私有仓库、协作者部署正式环境）。**重大决定定下来就加一份，不改旧的。**

## feature/ 功能规范（先文档、后代码）
| 文档 | 内容 |
|---|---|
| [feature/spec.md](feature/spec.md) | **需求规格模板**（背景目标、场景、编号需求、规则、界面、数据协议、安全、性能、验收标准、未决问题）+ 开发流程 |
| [feature/plan.md](feature/plan.md) | **实施计划模板**（方案比较、任务拆分、协议与数据变更、测试、上线与回滚、风险、进度） |
| [feature/20261110-staging-env/](feature/20261110-staging-env/spec.md) | 第一份实例：测试环境（已上线） |
| [feature/20261110-staging-self-deploy/](feature/20261110-staging-self-deploy/spec.md) | 协作者自助部署到测试环境（已上线） |
| [feature/20261110-collaborator-prod-deploy/](feature/20261110-collaborator-prod-deploy/spec.md) | 协作者部署正式环境（已上线） |
| [feature/20261110-mon-battle/](feature/20261110-mon-battle/spec.md) | 精灵对战第一批：技能更换、战斗信息、结算页、快进、耄耋 5 技能槽（协作者开发，已上线） |
| [feature/20261110-mon-dex/](feature/20261110-mon-dex/spec.md) | 精灵图鉴页：未见过剪影 / 详情 / 筛选（协作者开发，已上线） |
| [feature/20261110-dining-halls/](feature/20261110-dining-halls/spec.md) | 室内扩展：三个餐厅（各三层）、两个公共教学楼（各五层）、图书馆、第二 / 第三超市；楼梯、直达某层传送、室内椅子可坐（v3，已实现，未部署）；含 plan.md 与 SOURCES.md（窗口来源 / 未核实清单） |
| [feature/20261111-battle-stages/](feature/20261111-battle-stages/spec.md) | 战斗深度 2A-1：能力等级（±6、伤害与先手倍率、卡片显示；协作者开发，已上线） |
| [feature/20261111-battle-status/](feature/20261111-battle-status/spec.md) | 战斗深度 2A-2：状态异常（中毒 / 灼伤 / 麻痹 / 睡眠 / 冰冻、回合结算、捕捉倍率；协作者开发，已上线） |
| [feature/20261112-fishing-broadcast/](feature/20261112-fishing-broadcast/spec.md) | 钓鱼全服播报：神话鱼 / 破个人纪录触发，世界频道 + 金色横幅（协作者开发客户端与共享规则，服务端由维护者补齐，已上线） |
| [feature/20261112-battle-nondamage/](feature/20261112-battle-nondamage/spec.md) | 战斗深度 2A-3：非伤害招式（回复 / 变化 / 保护）、命中闪避接入、状态共存（协作者开发，随 #24 一起上线） |
| [feature/20261112-move-library/](feature/20261112-move-library/spec.md) | 技能库扩充：每属性 6 个定位不同的招式 + 初始三只专属招 + 反伤机制（协作者开发，已上线） |
| [feature/20261113-trainer-npc/](feature/20261113-trainer-npc/spec.md) | 训练家 NPC：双方队伍结构、AI、切磋与奖励，北山密林 10–20 级区域（协作者开发，公开 + 服务端 PR 一起上线） |
| [feature/20261114-pvp/](feature/20261114-pvp/spec.md) | 玩家对战（PvP）：spec / plan 定稿，尚未实现（协作者） |
| [feature/20261112-farming/](feature/20261112-farming/spec.md) | 校园耕作：16 块私田、大树洞入口、农场管理员、好友帮浇 / 偷摘（协作者开发客户端与共享规则，服务端由维护者补齐，已上线） |
- 每个新功能复制成 `docs/feature/<YYYYMMDD-功能名>/spec.md` + `plan.md`；**先 spec、主人确认，再 plan、主人确认，再写代码**。
- 2026-11-10 起 spec 和 plan **都进公开仓库**：不要写服务器地址、口令、玩家数据（运维细节写到私有文档）。

## 私有文档
不在公开仓库里（仅主人本机和私有备份仓库）：部署手册、开发全流程与权限、本机目录管理、各功能的历史方案与服务端备忘、文件地图、玩家留言整理。
