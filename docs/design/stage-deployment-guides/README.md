# 八关塔位与怪物行进路线图册

> 面向产品、关卡和美术验收的简洁版本。图中只保留当前塔位、预留实体平台、入口、方向和关印终点；不包含 HUD、禁建半径、坐标投影等工程辅助线。

## 图例

- 金色 `塔1、塔2…`：当前运行时已经使用的塔位，编号按运行时塔数组顺序。
- 青色 `预1、预2…`：背景中已经绘制、但当前没有上塔的预留实体平台。
- 黄色箭头：第一至第七关的怪物行进方向。
- 第八关黄色/粉色/青色：无尽模式可能选择的 A/B/C 三条路线。
- 绿色入口：怪物出生方向；红色关印：怪物抵达后造成关印伤害的位置。

## 单关地图

- [第一关 · 关外练兵场](./stage-01-deployment-guide.png)：当前 4 塔，预留 1 个平台，1 条路线。
- [第二关 · 东海礁港](./stage-02-deployment-guide.png)：当前 4 塔，预留 2 个平台，1 条路线。
- [第三关 · 镇海龙门](./stage-03-deployment-guide.png)：当前 4 塔，预留 2 个平台，1 条路线。
- [第四关 · 归墟潮眼](./stage-04-deployment-guide.png)：当前 4 塔，预留 2 个平台，1 条路线。
- [第五关 · 扶桑天阙](./stage-05-deployment-guide.png)：当前 4 塔，预留 2 个平台，1 条路线。
- [第六关 · 太初蜃庭](./stage-06-deployment-guide.png)：当前 4 塔，预留 2 个平台，1 条路线。
- [第七关 · 山河残卷](./stage-07-deployment-guide.png)：当前 4 塔，预留 2 个平台，1 条路线。
- [第八关 · 无尽潮渊](./stage-08-deployment-guide.png)：当前 3 塔，预留 5 个平台，3 条路线。
- [八关总览](./all-stage-deployment-atlas.jpg)
- [844×380 等效缩略验收总览](./mobile-preview/all-stage-844x380-audit.jpg)
- [机器可读清单](./manifest.json)

## 重要边界

- 第八关当前运行时仍然只有 3 座塔；背景共有 8 个实体平台，扩塔方案规划最多 6 塔。本图没有把预留平台画成已经建成的塔。
- 这些平台是背景视觉引导与当前初始塔位。现有自由摆塔逻辑仍允许玩家在其他合法网格部署；平台尚未成为唯一可摆放白名单。
- 路线和当前塔位直接读取 `src/core/content.ts`；平台读取 `scripts/tower-layout-guide-candidates.json`，避免图册与运行时手工漂移。

## 重新生成

```bash
node scripts/generate-stage-deployment-atlas.mjs
```

平台配置版本：2026-09-01-v4
