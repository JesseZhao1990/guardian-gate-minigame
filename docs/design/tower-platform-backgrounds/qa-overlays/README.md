# 八关塔位内部辅助图

> 仅用于地图重绘、坐标对齐与微信端验收，不是运行时资源。青色台地是已采用的平台位置，正式背景中已烘焙对应的实体台地、台阶或承重结构。

## 图例

- 黄色中心线：当前怪物路线；第八关同时显示 A/B/C 三条路线。
- 红色半透明带：道路中心线两侧 170px 禁建带。
- 洋红虚线圈：关印周围 240px 禁建区。
- 青色虚线椭圆：需要在背景中重绘为真实承重结构的候选台地外轮廓。
- 绿色内圈：塔体相对道路、关印和 HUD 的安全核心；当前运行时建造边界只约束塔心。
- 塔位编号后的 `*`：本轮按用户红色箭头调整过；原坐标和箭头目标记录在 manifest。
- 紫色斜线：当前代码使用的 HUD 硬遮挡。黄色外框是 128px 塔资产视觉缓冲。
- A1…：当前初始塔点；红色表示按现有网格、道路、关印、塔心建造边界或 HUD 规则不合法。
- 左右白色虚线：16:9 可见边界；外侧仅在更宽屏幕中出现。
- 浅绿色虚线框：当前默认塔心建造边界，战场四周内缩 96px。

## 输出

- [STAGE_01 · 关外练兵场](./stage-01-tower-layout-guide.png)：5 个实体台地，最多上阵 4 塔。
- [STAGE_02 · 东海礁港](./stage-02-tower-layout-guide.png)：6 个实体台地，最多上阵 4 塔。
- [STAGE_03 · 镇海龙门](./stage-03-tower-layout-guide.png)：6 个实体台地，最多上阵 4 塔。
- [STAGE_04 · 归墟潮眼](./stage-04-tower-layout-guide.png)：6 个实体台地，最多上阵 4 塔。
- [STAGE_05 · 扶桑天阙](./stage-05-tower-layout-guide.png)：6 个实体台地，最多上阵 4 塔。
- [STAGE_06 · 太初蜃庭](./stage-06-tower-layout-guide.png)：6 个实体台地，最多上阵 4 塔。
- [STAGE_07 · 山河残卷](./stage-07-tower-layout-guide.png)：6 个实体台地，最多上阵 4 塔。
- [STAGE_08 · 无尽潮渊](./stage-08-tower-layout-guide.png)：背景预留 8 个实体台地；当前运行时仍上阵 3 塔，后续扩塔方案目标最多 6 塔。
- [八关总览](./all-stage-tower-layout-guides.jpg)
- [用户标注调整证明总览](./tower-layout-adjustment-proof.jpg)
- [微信开发者工具逐关实测总览](./wechat-live-tower-audit.jpg)
- [第一关怪物沿道路行进实测](./wechat-stage01-route-live.png)
- [最终 UI 与第五关塔位修复证明](./wechat-final-fix-proof.jpg)
- [最终第一关备战态](./wechat-final-stage01-prep.png)
- [最终第五关全塔态](./wechat-final-stage05-all-towers.png)
- [机器可读坐标与校验结果](./manifest.json)

## 微信开发者工具实测

- 设备画布：844×390，pixelRatio 3；安全区 750×369。
- 共导出 16 张实际 Canvas 截图，运行错误为 `null`。总览依次展示第 1～7 关全部 4 个正式塔锚点、第 8 关战斗态，以及第 1 关怪物路线。
- 针对战策标题叠字与第五关顶部塔体遮挡另补抓 2 张最终截图；总览已替换为修复后版本。
- 第 1～7 关的“全部塔”截图只在验收时临时显示 4 个已配置锚点，用来确认塔体与背景平台一一对齐；该逻辑不进入正式包。
- 第 1 关战斗截图确认怪物从右上城门出现并沿道路前进，不再表现为从天而降。
- 实测发现的备战关印残字、战策标题叠字与第五关顶部塔体遮挡均已纳入修复和回归。

## 重要说明

- 背景图中只应烘焙中性的实体台地、台阶、支架和锚点，不应烘焙绿红状态、锁定文字或塔编号。
- 第八关左侧灰色区域是当前代码仍会阻挡、但实际没有可见战功快捷栏的保守死区；开放无尽布阵时应同步修正判断。
- 平台坐标已按当前路线、关印、塔心建造边界和 HUD 硬遮挡校验，并已在微信开发者工具逐关复核。

## 重新生成

```bash
node scripts/generate-tower-layout-guides.mjs
```

可在不覆盖正式辅助图的情况下，对候选背景重新叠加同一套几何契约：

```bash
TOWER_GUIDE_BACKGROUND_ROOT=docs/design/tower-platform-backgrounds/staged-assets \
TOWER_GUIDE_OUTPUT_DIR=docs/design/tower-platform-backgrounds/qa-overlays \
node scripts/generate-tower-layout-guides.mjs
```

生成版本：2026-09-01-v3
