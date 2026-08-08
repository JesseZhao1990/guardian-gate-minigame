import { access, readFile, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedStageIds = ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05', 'STAGE_06'];
const requiredFiles = [
  'project.config.json',
  'dist/game.js',
  'dist/game.json',
  'dist/build-meta.json',
  'dist/assets/stage-01/background/STAGE_01_BACKGROUND.jpg',
  'dist/assets/stage-02/background/STAGE_02_BACKGROUND.jpg',
  'dist/assets/stage-03/background/STAGE_03_BACKGROUND.jpg',
  'dist/assets/stage-04/background/STAGE_04_BACKGROUND.jpg',
  'dist/assets/stage-05/background/STAGE_05_BACKGROUND.jpg',
  'dist/assets/stage-06/background/STAGE_06_BACKGROUND.jpg',
  'dist/assets/stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  'dist/assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  'dist/assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  'dist/assets/stage-03/enemies/MON_DRAGON_TORTOISE.png',
  'dist/assets/stage-04/enemies/MON_ABYSS_WYRM.png',
  'dist/assets/stage-05/enemies/MON_ECLIPSE_KUN_EMPEROR.png',
  'dist/assets/stage-06/enemies/MON_MIRAGE_MOTHER.png',
  'dist/assets/stage-01/towers/TOWER_SOLAR_BASE_V2.png',
  'dist/assets/stage-01/towers/TOWER_SOLAR_HEAD_V2.png',
  'dist/assets/stage-01/towers/TOWER_FROST_BASE_V2.png',
  'dist/assets/stage-01/towers/TOWER_FROST_HEAD_V2.png',
  'dist/assets/stage-01/towers/TOWER_STORM_BASE_V2.png',
  'dist/assets/stage-01/towers/TOWER_STORM_HEAD_V2.png',
  'dist/assets/stage-01/audio/SFX_BATTLE_01.m4a',
  'dist/assets/stage-01/audio/STG_VICTORY.m4a'
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
  'dist/assets/stage-02/background/STAGE_02_BACKGROUND.jpg',
  'dist/assets/stage-03/background/STAGE_03_BACKGROUND.jpg',
  'dist/assets/stage-04/background/STAGE_04_BACKGROUND.jpg',
  'dist/assets/stage-05/background/STAGE_05_BACKGROUND.jpg',
  'dist/assets/stage-06/background/STAGE_06_BACKGROUND.jpg',
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
  ['dist/assets/stage-03/enemies/MON_DRAGON_TORTOISE.png', '第三关玄甲龙鳌'],
  ['dist/assets/stage-04/enemies/MON_ABYSS_WYRM.png', '第四关噬潮魔蛟'],
  ['dist/assets/stage-05/enemies/MON_ECLIPSE_KUN_EMPEROR.png', '第五关蚀日鲲皇'],
  ['dist/assets/stage-06/enemies/MON_MIRAGE_MOTHER.png', '第六关万相蜃母'],
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
if (project.compileType !== 'minigame') throw new Error('compileType 必须为 minigame');
if (project.miniprogramRoot !== 'dist/') throw new Error('miniprogramRoot 必须指向 dist/');
if (buildMeta.entry !== 'src/game.ts') throw new Error('构建元数据未声明正式 src/game.ts 入口');
if (JSON.stringify(buildMeta.stageIds) !== JSON.stringify(expectedStageIds)) {
  throw new Error('构建元数据未声明完整且有序的六关关卡列表');
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

const totalBytes = await directoryBytes(resolve(root, 'dist'));
if (totalBytes > 4 * 1024 * 1024) {
  throw new Error(`dist 包体 ${totalBytes} bytes 超出当前项目 4 MiB 安全预算`);
}

console.log('✓ 微信小游戏入口与配置完整');
console.log(`✓ 游戏名「${expectedGameTitle}」已写入首页、工程配置与微信分享链路`);
console.log('✓ 横屏与独立 dist 根目录配置正确');
console.log('✓ 三套塔基与动态弩机素材完整、透明且已接入运行时');
console.log('✓ Stage 01/02/03/04/05/06 独立战场背景均为 1920×1080 JPEG 且已接入运行时');
console.log('✓ 第三至第六关独立首领均为 600×480 透明素材且已接入运行时');
console.log('✓ dist/game.js 与当前正式 src/game.ts 内存构建逐字节一致');
console.log('✓ 循环背景音与环境音已从产物移除');
console.log(`✓ dist 包体 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
