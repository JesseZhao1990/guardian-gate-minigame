import { access, readFile, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedStageIds = [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
  'STAGE_08',
];
const expectedSubpackages = expectedStageIds.slice(1).map((stageId) => {
  const ordinal = stageId.slice(-2);
  const name = `stage-${ordinal}`;
  return {
    stageId,
    name,
    root: `packages/${name}`,
    assetRoot: `stage-${ordinal}`,
  };
});
const packagedAssetPath = (stageName, assetPath) =>
  `dist/packages/${stageName}/assets/${stageName}/${assetPath}`;
const requiredFiles = [
  'project.config.json',
  'dist/game.js',
  'dist/game.json',
  'dist/build-meta.json',
  'dist/assets/stage-01/background/STAGE_01_BACKGROUND.jpg',
  packagedAssetPath('stage-02', 'background/STAGE_02_BACKGROUND.jpg'),
  packagedAssetPath('stage-03', 'background/STAGE_03_BACKGROUND.jpg'),
  packagedAssetPath('stage-04', 'background/STAGE_04_BACKGROUND.jpg'),
  packagedAssetPath('stage-05', 'background/STAGE_05_BACKGROUND.jpg'),
  packagedAssetPath('stage-06', 'background/STAGE_06_BACKGROUND.jpg'),
  packagedAssetPath('stage-07', 'background/STAGE_07_BACKGROUND.jpg'),
  packagedAssetPath('stage-08', 'background/STAGE_08_BACKGROUND.jpg'),
  'dist/assets/stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  'dist/assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  'dist/assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  packagedAssetPath('stage-03', 'enemies/MON_DRAGON_TORTOISE.png'),
  packagedAssetPath('stage-04', 'enemies/MON_ABYSS_WYRM.png'),
  packagedAssetPath('stage-05', 'enemies/MON_ECLIPSE_KUN_EMPEROR.png'),
  packagedAssetPath('stage-06', 'enemies/MON_MIRAGE_MOTHER.png'),
  packagedAssetPath('stage-07', 'enemies/MON_DUAL_PHASE_BOOK_MOTH.png'),
  packagedAssetPath('stage-08', 'enemies/BOSS_ABYSS_DRAGON.png'),
  'dist/assets/stage-01/towers/TOWER_SOLAR_BASE_V2.png',
  'dist/assets/stage-01/towers/TOWER_SOLAR_HEAD_V2.png',
  'dist/assets/stage-01/towers/TOWER_FROST_BASE_V2.png',
  'dist/assets/stage-01/towers/TOWER_FROST_HEAD_V2.png',
  'dist/assets/stage-01/towers/TOWER_STORM_BASE_V2.png',
  'dist/assets/stage-01/towers/TOWER_STORM_HEAD_V2.png',
  'dist/assets/stage-01/audio/SFX_BATTLE_01.m4a',
  'dist/assets/stage-01/audio/STG_VICTORY.m4a',
  ...expectedSubpackages.map(({ root: packageRoot }) => `dist/${packageRoot}/game.js`),
];

for (const file of requiredFiles) {
  await access(resolve(root, file), constants.R_OK);
}

const towerAssets = requiredFiles.filter((file) => file.includes('/towers/'));
for (const file of towerAssets) {
  const png = await readFile(resolve(root, file));
  const signature = png.subarray(0, 8).toString('hex');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25];
  if (signature !== '89504e470d0a1a0a') throw new Error(`塔素材不是有效 PNG：${file}`);
  if (width !== 384 || height !== 384) throw new Error(`塔素材必须为 384×384：${file}`);
  if (colorType !== 4 && colorType !== 6) throw new Error(`塔素材必须携带透明通道：${file}`);
}

const gameSourceBuffer = await readFile(resolve(root, 'dist/game.js'));
const gameSource = gameSourceBuffer.toString('utf8');
for (const file of towerAssets) {
  const runtimePath = file.replace(/^dist\//, '');
  if (!gameSource.includes(runtimePath)) throw new Error(`运行时代码未引用塔素材：${runtimePath}`);
}

function jpegDimensions(jpeg, file) {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  while (offset + 3 < jpeg.length) {
    if (jpeg[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < jpeg.length && jpeg[offset] === 0xff) offset += 1;
    const marker = jpeg[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > jpeg.length) break;
    const segmentLength = jpeg.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > jpeg.length) break;
    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) break;
      return {
        width: jpeg.readUInt16BE(offset + 5),
        height: jpeg.readUInt16BE(offset + 3),
      };
    }
    offset += segmentLength;
  }
  throw new Error(`无法读取关卡背景尺寸：${file}`);
}

for (const background of [
  'dist/assets/stage-01/background/STAGE_01_BACKGROUND.jpg',
  packagedAssetPath('stage-02', 'background/STAGE_02_BACKGROUND.jpg'),
  packagedAssetPath('stage-03', 'background/STAGE_03_BACKGROUND.jpg'),
  packagedAssetPath('stage-04', 'background/STAGE_04_BACKGROUND.jpg'),
  packagedAssetPath('stage-05', 'background/STAGE_05_BACKGROUND.jpg'),
  packagedAssetPath('stage-06', 'background/STAGE_06_BACKGROUND.jpg'),
  packagedAssetPath('stage-07', 'background/STAGE_07_BACKGROUND.jpg'),
  packagedAssetPath('stage-08', 'background/STAGE_08_BACKGROUND.jpg'),
]) {
  const runtimePath = background.replace(/^dist\//, '');
  if (!gameSource.includes(runtimePath)) throw new Error(`运行时代码未引用关卡背景：${runtimePath}`);
  const jpeg = await readFile(resolve(root, background));
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8 || jpeg.at(-2) !== 0xff || jpeg.at(-1) !== 0xd9) {
    throw new Error(`关卡背景不是有效 JPEG：${background}`);
  }
  const { width, height } = jpegDimensions(jpeg, background);
  if (width !== 1920 || height !== 1080) {
    throw new Error(`关卡背景必须为 1920×1080：${background}`);
  }
}

for (const [bossSpritePath, bossName] of [
  [packagedAssetPath('stage-03', 'enemies/MON_DRAGON_TORTOISE.png'), '第三关玄甲龙鳌'],
  [packagedAssetPath('stage-04', 'enemies/MON_ABYSS_WYRM.png'), '第四关噬潮魔蛟'],
  [packagedAssetPath('stage-05', 'enemies/MON_ECLIPSE_KUN_EMPEROR.png'), '第五关蚀日鲲皇'],
  [packagedAssetPath('stage-06', 'enemies/MON_MIRAGE_MOTHER.png'), '第六关万相蜃母'],
  [packagedAssetPath('stage-07', 'enemies/MON_DUAL_PHASE_BOOK_MOTH.png'), '第七关双相天蠹'],
  [packagedAssetPath('stage-08', 'enemies/BOSS_ABYSS_DRAGON.png'), '无尽关深渊龙王'],
]) {
  const bossSprite = await readFile(resolve(root, bossSpritePath));
  if (bossSprite.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${bossName}素材不是有效 PNG`);
  }
  const colorType = bossSprite[25];
  const hasAlpha = colorType === 4 || colorType === 6 || (colorType === 3 && bossSprite.includes(Buffer.from('tRNS')));
  const width = bossSprite.readUInt32BE(16);
  const height = bossSprite.readUInt32BE(20);
  if (width !== 600 || height !== 480) throw new Error(`${bossName}素材必须为 600×480`);
  if (!hasAlpha) throw new Error(`${bossName}素材必须携带透明通道`);
  if (!gameSource.includes(bossSpritePath.replace(/^dist\//, ''))) {
    throw new Error(`运行时代码未引用${bossName}素材`);
  }
}

const forbiddenBackgroundAudio = [
  'dist/assets/stage-01/audio/BGM_BATTLE_EARLY.m4a',
  'dist/assets/stage-01/audio/BGM_BATTLE_EARLY.ogg',
  'dist/assets/stage-01/audio/AMB_STAGE_01.m4a',
  'dist/assets/stage-01/audio/AMB_STAGE_01.ogg'
];
for (const file of forbiddenBackgroundAudio) {
  try {
    await access(resolve(root, file), constants.F_OK);
    throw new Error(`构建产物不得包含背景音频：${file}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const project = JSON.parse(await readFile(resolve(root, 'project.config.json'), 'utf8'));
const packageManifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const game = JSON.parse(await readFile(resolve(root, 'dist/game.json'), 'utf8'));
const buildMeta = JSON.parse(await readFile(resolve(root, 'dist/build-meta.json'), 'utf8'));
const expectedGameTitle = '今天也没守住';
const includesJavaScriptString = (source, value) => {
  const escaped = [...value]
    .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
    .join('');
  return source.includes(value) || source.toLowerCase().includes(escaped.toLowerCase());
};
if (project.compileType !== 'game') throw new Error('微信小游戏 compileType 必须为 game');
if (project.miniprogramRoot !== 'dist/') throw new Error('miniprogramRoot 必须指向 dist/');
if (buildMeta.entry !== 'src/game.ts') throw new Error('构建元数据未声明正式 src/game.ts 入口');
if (JSON.stringify(buildMeta.stageIds) !== JSON.stringify(expectedStageIds)) {
  throw new Error('构建元数据未声明完整且有序的七关战役与无尽关列表');
}
const expectedGameSubpackages = expectedSubpackages.map(({ name, root: packageRoot }) => ({
  name,
  root: packageRoot,
}));
if (JSON.stringify(game.subpackages) !== JSON.stringify(expectedGameSubpackages)) {
  throw new Error('game.json 必须按 Stage 02–08 声明七个有序普通分包');
}
if (game.subpackages.some((subpackage) => subpackage.independent === true)) {
  throw new Error('Stage 02–08 必须使用普通分包，不得声明为独立分包');
}
if (JSON.stringify(buildMeta.subpackages) !== JSON.stringify(expectedSubpackages)) {
  throw new Error('构建元数据中的 Stage 02–08 分包声明不完整');
}
const sourceGameConfig = await readFile(resolve(root, 'game.json'));
const builtGameConfig = await readFile(resolve(root, 'dist/game.json'));
if (!sourceGameConfig.equals(builtGameConfig)) {
  throw new Error('dist/game.json 与源码 game.json 不一致');
}

const formalBuild = await build({
  entryPoints: [resolve(root, 'src/game.ts')],
  outfile: resolve(root, 'dist/game.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  write: false,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
const formalGameOutput = formalBuild.outputFiles.find((file) => file.path.endsWith('/game.js'));
if (!formalGameOutput || !gameSourceBuffer.equals(Buffer.from(formalGameOutput.contents))) {
  throw new Error('dist/game.js 不是由当前正式 src/game.ts 入口生成的精确产物');
}

const contentBuild = await build({
  entryPoints: [resolve(root, 'src/core/content.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: ['node20'],
  write: false,
  sourcemap: false,
  legalComments: 'none',
});
const contentOutput = contentBuild.outputFiles[0];
if (!contentOutput) throw new Error('无法检查正式关卡内容导出');
const contentModule = await import(
  `data:text/javascript;base64,${Buffer.from(contentOutput.contents).toString('base64')}`
);
const stage08Bundle = contentModule.STAGE_BUNDLES?.STAGE_08;
if (
  stage08Bundle?.stage?.name !== '无尽潮渊' ||
  stage08Bundle?.mode !== 'endless' ||
  stage08Bundle?.stage?.backgroundAssetId !== 'STAGE_08_BACKGROUND'
) {
  throw new Error('Stage 08 必须以“无尽潮渊”无尽模式接入 STAGE_08_BACKGROUND');
}
const declaredStage08ConfigHash = stage08Bundle.configHash;
const canonicalStage08Bundle = JSON.parse(JSON.stringify(stage08Bundle));
canonicalStage08Bundle.configHash = '';
const canonicalStage08ConfigHash = `sha256:${createHash('sha256')
  .update(JSON.stringify(canonicalStage08Bundle))
  .digest('hex')}`;
if (declaredStage08ConfigHash !== canonicalStage08ConfigHash) {
  throw new Error('Stage 08 configHash 必须匹配当前无尽内容，禁止占位或沿用旧哈希');
}
if (!stage08Bundle.endless || stage08Bundle.endless.routes?.length !== 3) {
  throw new Error('Stage 08 必须包含三条 Seed 确定的无尽路线');
}
const endlessBoss = stage08Bundle.enemies?.[stage08Bundle.endless.bossEnemyId];
if (
  stage08Bundle.endless.bossEnemyId !== 'BOSS_ABYSS_DRAGON' ||
  endlessBoss?.renderAssetId !== 'BOSS_ABYSS_DRAGON'
) {
  throw new Error('Stage 08 深渊龙王必须使用 stage-08 分包内 BOSS_ABYSS_DRAGON 素材');
}
const mainPackageEnemyAssetIds = new Set([
  'MON_TIDE_IMP',
  'MON_SWIFT_EEL',
  'MON_SHELL_CRAB',
  'MON_REEF_GUARD',
  'MON_ABYSS_SCALE_GUARD',
  'MON_SOLAR_FORMATION_PRIEST',
  'MON_PHASE_SHELL_WEAVER',
  'MON_ETHEREAL_WALKER',
]);
for (const enemyId of stage08Bundle.endless.miniBossEnemyIds) {
  const renderAssetId = stage08Bundle.enemies?.[enemyId]?.renderAssetId;
  if (!mainPackageEnemyAssetIds.has(renderAssetId)) {
    throw new Error(`Stage 08 小首领 ${enemyId} 引用了未加载的其他关卡分包素材`);
  }
}
if (project.projectname !== expectedGameTitle) throw new Error('微信开发者工具项目名与游戏品牌名不一致');
if (!project.description.includes(expectedGameTitle)) throw new Error('项目描述未使用当前游戏名');
if (!packageManifest.description.includes(expectedGameTitle)) throw new Error('package 描述未使用当前游戏名');
if (game.deviceOrientation !== 'landscape') throw new Error('小游戏必须使用横屏配置');
if (!includesJavaScriptString(gameSource, expectedGameTitle)) throw new Error('构建产物未包含当前游戏名');
if (!gameSource.includes('onShareAppMessage') || !gameSource.includes('showShareMenu')) {
  throw new Error('构建产物未完整注册微信分享标题与分享入口');
}
for (const retiredTitle of ['守卫陈塘关', '保卫陈塘关']) {
  if (includesJavaScriptString(gameSource, retiredTitle)) {
    throw new Error(`构建产物仍包含旧游戏名：${retiredTitle}`);
  }
}

async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    total += entry.isDirectory() ? await directoryBytes(path) : (await stat(path)).size;
  }
  return total;
}

async function relativeFiles(directory, prefix = '') {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await relativeFiles(resolve(directory, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

const builtPackageNames = (await readdir(resolve(root, 'dist/packages'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedPackageNames = expectedSubpackages.map(({ name }) => name).sort();
if (JSON.stringify(builtPackageNames) !== JSON.stringify(expectedPackageNames)) {
  throw new Error(`dist/packages 分包目录不准确：${builtPackageNames.join(', ')}`);
}

for (const stagePackage of expectedSubpackages) {
  const sourceAssetRoot = resolve(root, 'assets', stagePackage.assetRoot);
  const builtPackageRoot = resolve(root, 'dist', stagePackage.root);
  const builtAssetRoot = resolve(builtPackageRoot, 'assets', stagePackage.assetRoot);
  const sourceFiles = await relativeFiles(sourceAssetRoot);
  const builtAssetFiles = await relativeFiles(builtAssetRoot);
  if (JSON.stringify(builtAssetFiles) !== JSON.stringify(sourceFiles)) {
    throw new Error(`${stagePackage.name} 分包未完整保留原始关卡资源`);
  }
  for (const assetFile of sourceFiles) {
    const sourceAsset = await readFile(resolve(sourceAssetRoot, assetFile));
    const builtAsset = await readFile(resolve(builtAssetRoot, assetFile));
    if (!sourceAsset.equals(builtAsset)) {
      throw new Error(`${stagePackage.name} 分包资源与源文件不一致：${assetFile}`);
    }
  }

  const expectedPackageEntry = [
    "'use strict';",
    'GameGlobal.__guardianGateLoadedSubpackages = GameGlobal.__guardianGateLoadedSubpackages || {};',
    `GameGlobal.__guardianGateLoadedSubpackages['${stagePackage.name}'] = true;`,
    '',
  ].join('\n');
  const packageEntry = await readFile(resolve(builtPackageRoot, 'game.js'), 'utf8');
  if (packageEntry !== expectedPackageEntry || Buffer.byteLength(packageEntry) > 256) {
    throw new Error(`${stagePackage.name} 缺少可复现的最小 game.js 入口`);
  }

  const packageFiles = await relativeFiles(builtPackageRoot);
  const expectedPackageFiles = [
    'game.js',
    ...sourceFiles.map((file) => `assets/${stagePackage.assetRoot}/${file}`),
  ].sort();
  if (JSON.stringify(packageFiles) !== JSON.stringify(expectedPackageFiles)) {
    throw new Error(`${stagePackage.name} 分包包含未归属的额外文件`);
  }

  try {
    await access(resolve(root, 'dist/assets', stagePackage.assetRoot), constants.F_OK);
    throw new Error(`${stagePackage.name} 资源仍残留在主包`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

try {
  await access(resolve(root, 'dist/packages/stage-01'), constants.F_OK);
  throw new Error('Stage 01 必须留在主包，不得生成 stage-01 分包');
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const mainAssetRoots = (await readdir(resolve(root, 'dist/assets'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(mainAssetRoots) !== JSON.stringify(['stage-01'])) {
  throw new Error(`主包 assets 只能保留 stage-01，当前为：${mainAssetRoots.join(', ')}`);
}

// Reserve room for the WeChat packager's generated metadata and sealing overhead.
const MAX_MAIN_PACKAGE_BYTES = 3_700_000;
const MAX_SUBPACKAGE_BYTES = 30_000_000;
const MAX_ENDLESS_SUBPACKAGE_BYTES = 500_000;
const MAX_TOTAL_BYTES = 30_000_000;
const subpackageSizes = [];
let subpackageBytes = 0;
for (const stagePackage of expectedSubpackages) {
  const bytes = await directoryBytes(resolve(root, 'dist', stagePackage.root));
  if (bytes >= MAX_SUBPACKAGE_BYTES) {
    throw new Error(`${stagePackage.name} 分包 ${bytes} bytes 达到或超出 30,000,000 bytes 限制`);
  }
  if (stagePackage.name === 'stage-08' && bytes >= MAX_ENDLESS_SUBPACKAGE_BYTES) {
    throw new Error(`stage-08 无尽分包 ${bytes} bytes 达到或超出 500,000 bytes 专项预算`);
  }
  subpackageSizes.push({ name: stagePackage.name, bytes });
  subpackageBytes += bytes;
}
const totalBytes = await directoryBytes(resolve(root, 'dist'));
const mainPackageBytes = totalBytes - subpackageBytes;
if (mainPackageBytes >= MAX_MAIN_PACKAGE_BYTES) {
  throw new Error(`主包 ${mainPackageBytes} bytes 达到或超出 3,700,000 bytes 源码安全预算`);
}
if (totalBytes >= MAX_TOTAL_BYTES) {
  throw new Error(`全部包体 ${totalBytes} bytes 达到或超出 30,000,000 bytes 限制`);
}

console.log('✓ 微信小游戏入口与配置完整');
console.log(`✓ 游戏名「${expectedGameTitle}」已写入首页、工程配置与微信分享链路`);
console.log('✓ 横屏与独立 dist 根目录配置正确');
console.log('✓ 三套塔基与动态弩机素材完整、透明且已接入运行时');
console.log('✓ Stage 01/02/03/04/05/06/07/08 独立战场背景均为 1920×1080 JPEG 且已接入运行时');
console.log('✓ 第三至第七关及无尽关独立首领均为 600×480 透明素材且已接入运行时');
console.log('✓ dist/game.js 与当前正式 src/game.ts 内存构建逐字节一致');
console.log('✓ 循环背景音与环境音已从产物移除');
console.log('✓ Stage 01 资源仅位于主包，Stage 02–08 原始资源完整且仅位于对应普通分包');
console.log(`✓ 主包 ${mainPackageBytes.toLocaleString('en-US')} bytes，低于 3,700,000 bytes 源码安全预算`);
console.log(`✓ 分包 ${subpackageSizes.map(({ name, bytes }) => `${name} ${bytes.toLocaleString('en-US')} bytes`).join('；')}`);
console.log(`✓ 全部包体 ${totalBytes.toLocaleString('en-US')} bytes，低于 30,000,000 bytes`);
