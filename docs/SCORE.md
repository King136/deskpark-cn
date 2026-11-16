# 娱乐分改造说明（零充值版本）

> 结论先行：**`openinggame/qp` 改不了**——那个仓库里没有源码，只有两个预构建镜像和数据库数据卷。
> 所以这里做的不是"裁剪一个商业棋牌流程"，而是**在一套 MIT 开源、源码全开的平台上，从 0 加一套"只记输赢、不能换钱"的娱乐分**。

---

## 一、要求对照表

| 你的要求 | 这套实现的落地方式 |
|---|---|
| 保留娱乐分，一桌人打完要有结果 | 每局结束自动结算，展示每人「本局分差 + 累计分」 |
| 不能充值 | 代码里没有充值/下单/支付接口，协议层也没有余额字段 |
| 不能兑换 | 没有任何兑换入口、汇率、提现能力；存档里只有 4 个字段 |
| 不能转赠 | 分只跟当前 token（本机浏览器身份）绑定，没有转账/送礼消息 |
| 能装在手机上 | Web 端已做竖屏/横屏适配；用 Capacitor 一条命令套壳成 Android/iOS 安装包 |

---

## 二、新增/改动清单

### 新增

| 文件 | 作用 |
|---|---|
| `packages/score/src/index.ts` | 娱乐分结算引擎：纯函数，读终局状态 → 输出每人分差，无 IO 无依赖 |
| `packages/score/test/settle.test.ts` | 11 项结算测试（含零和不变式、异常值收敛） |
| `apps/server/src/scores.ts` | 积分存档：JSON 原子写、节流落盘、损坏自愈、上限淘汰 |
| `apps/server/test/scores.test.ts` | 5 项存档测试（含"文件里不许出现任何金额字段"的断言） |
| `apps/web/src/components/ScoreBoard.tsx` | 结算卡 / 房间累计表 / 我的档案三块 UI |
| `apps/web/src/components/score.css` | 对应样式（深色桌布 + 浅色大厅两套配色） |
| `apps/web/src/lib/scoreLabel.ts` | 玩法中文名映射 |
| `tools/score-e2e.mjs` | 端到端脚本：真人托管打完一局，校验结算消息与落盘 |
| `docs/SCORE.md` | 本文 |

### 改动

| 文件 | 改动 |
|---|---|
| `packages/protocol/src/index.ts` | 新增 `MatchScore` / `RoomScoreRow` / `ScoreSummary`，`score` 下行消息，`scoreboard` 上行消息，`welcome` 带上个人档案，导出 `SCORE_NOTICE` |
| `apps/server/src/rooms.ts` | 房间记录 `sessionScores`；对局结束触发 `settle()`；加入/重连自动下发结算与累计；`scoreboard` 请求处理 |
| `apps/server/src/main.ts` | 挂载 `ScoreStore`，退出前 flush |
| `apps/web/src/lib/online.ts` | 处理 `score` 消息、新一局自动收起上一局结算卡、换房清理 |
| `apps/web/src/screens/TableShell.tsx` | 对局内渲染结算卡（可收起为胶囊） |
| `apps/web/src/screens/OnlineRoom.tsx` | 等待房间加"这一桌的娱乐分 + 我的档案" |
| `Dockerfile` / `docker-compose.yml` / `.env.example` | `PARK_DATA_DIR=/app/data` + 命名卷，重启不丢分 |

---

## 三、结算规则（讲得清、对得上账）

| 玩法 | 依据 | 零和 |
|---|---|---|
| 斗地主 | 底分 × 叫分 × 倍数（炸弹/春天），地主拿双份 | ✅ |
| 四川麻将（血战到底） | 按番数 / 自摸 / 刮风下雨，一炮多响一并记 | ✅ |
| 掼蛋 | 胜方全队 +升几级，负方同额扣 | ✅ |
| 德州扑克 | 最终筹码与起始筹码之差 | ✅ |
| 中国象棋 / 国际象棋 | 胜 ±1，和 0 | ✅ |
| UON / 比大小 / 魔法出包 / 卡旦岛 / 宝石商会 | 本局得分换算名次分（第 1 名 +N−1 … 最后 −(N−1)），并列取平均 | ✅ |

**为什么桌游类要换算名次分**：这类玩法的得分是"各自累加"的（每人拿自己的分），直接相加会出现"桌上四个人都赢"的怪账。换算成名次分后，一桌人的数字加起来恒等于 0，谁赢谁输一眼对得上。

**安全边界**（`packages/score` 里写死的）：
- 单局分差上限 `±100000`，累计分上限 `±10000000`，一律取整——防止异常数据把账写炸；
- 结算不出来就 `counted: false`，**宁可不记，不能记错**；
- 电脑座位只参与"房间对账"（让桌上数字对得上），**不落档、不产生账号积分**。

---

## 四、合规自证（怎么证明它真的不能换钱）

这部分不是声明，是可以被检查和被测试的：

1. **协议层没有钱的字段**。`ClientMessage` / `ServerMessage` 里只有 `delta` / `total` / `matches` / `wins` / `byGame`。没有任何 `balance`、`recharge`、`order`、`withdraw`、`exchange` 字段。
2. **存档里只有四个键**。`apps/server/test/scores.test.ts` 有一条断言，直接读 `scores.json` 原文，检查这四个键之外不允许出现 `balance/coin/recharge/order/cash/rate/wallet`，出现即测试失败。
3. **没有服务端可调用的兑换路径**。`ScoreStore` 只有三个方法：`summary()`（读）、`bump()`（加一局）、`flush()`（落盘）。没有扣减、没有转账、没有清零以外的操作。
4. **前端只有展示，没有入口**。`ScoreBoard.tsx` 里没有任何表单、按钮能改变分数；唯一的按钮是"收起"和"知道了"。

---

## 五、实测记录

**斗地主（3 人，3 局定胜负，两真人全部托管）**

```
玩法: doudizhu | 依据: 底分 × 叫分 × 倍数（1 倍），农民胜 | 单位: 分
  座0 测试甲 本局 +3 | 累计 3
  座1 测试乙 本局  0 | 累计 0
  座2 飘飘  本局 -3 | 累计 —
总分（应为 0）: 0
乙是否收到同一份结算: true
房间累计: 测试甲:3 测试乙:0 飘飘:-3
```

落盘结果（`/tmp/park-data/scores.json`）：

```json
{"version":1,"players":{
  "kJFd8UVBoomT":{"name":"测试甲","totals":{"total":3,"matches":1,"wins":1,"byGame":{"doudizhu":{"total":3,"matches":1}}}},
  "NkIGRP-Mm02r":{"name":"测试乙","totals":{"total":0,"matches":1,"wins":0,"byGame":{"doudizhu":{"total":0,"matches":1}}}}
}}
```

注意：**没有出现任何金额相关字段**，电脑座位（飘飘）只参与房间对账、不落档。

**比大小（3 人，测名次分换算）**

```
+2 / 0 / -2，总分 0
```

---

## 六、怎么跑

```bash
# 开发
npm install
npm run dev            # 网页 http://localhost:5173，联机服务 8787

# 校验（三件套）
npm run lint && npm run typecheck && npm test
# 222 项测试，其中 16 项是这次新加的

# 端到端：托管打完一局，看结算下发（端口 8899 的服务需先启动）
PORT=8899 PARK_DATA_DIR=/tmp/park-data node apps/server/dist/main.js &
node tools/score-e2e.mjs doudizhu 3 200000 '{"rounds":3}'

# 生产
npm run build && PARK_DATA_DIR=./data npm start
```

Docker：

```bash
cp .env.example .env
docker compose up -d --build     # 分数落在 deskpark-data 卷，重启不丢
```

> 想每次重启清零（比如只做一次性聚会用），把 `PARK_DATA_DIR` 设成 `off`。

---

## 七、装到手机上

平台已经为移植预留了适配层（原仓库的 `docs/PORTING.md`）。最省事的是 Capacitor 套壳：

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npx cap init 闲亭 com.example.deskpark --web-dir=apps/web/dist
npm run build
npx cap add android && npx cap sync && npx cap open android
```

要点：
- 联机地址要改成线上服务（构建时 `VITE_SERVER_URL=wss://你的域名/ws`），否则 App 里连的是 localhost；
- 竖屏/横屏都用的是同一套响应式布局，`score.css` 里有 520px 以下的窄屏适配；
- 想上架就走正常的应用商店流程，别再提"棋牌私服"这类字眼——这套东西本身是 MIT 开源项目加一个记分模块。

---

## 八、还没做（下一步可选）

- **单人/人机局也记分**：目前结算卡只对联机房间生效；单机局要接本地 `localStorage` 记分。
- **家族/固定牌友榜**：现在只有"我的档案 + 这一桌累计"，没有跨房间的固定小组。
- **战绩详情页**：每局的 basis 已经存在服务端，可以做成历史流水（含时间、玩法、同桌的人）。
- **导出战绩**：一桌打完导出图片/表格，给家里人看"这周谁赢了"。
