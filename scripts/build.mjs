import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const stageIds = ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05', 'STAGE_06', 'STAGE_07'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/game.ts')],
  outfile: resolve(dist, 'game.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"'
  }
});

const runtimeAssetFiles = [
  'stage-01/background/STAGE_01_BACKGROUND.jpg',
  'stage-02/background/STAGE_02_BACKGROUND.jpg',
  'stage-03/background/STAGE_03_BACKGROUND.jpg',
  'stage-04/background/STAGE_04_BACKGROUND.jpg',
  'stage-05/background/STAGE_05_BACKGROUND.jpg',
  'stage-06/background/STAGE_06_BACKGROUND.jpg',
  'stage-07/background/STAGE_07_BACKGROUND.jpg',
  'stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  'stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  'stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  'stage-03/enemies/MON_DRAGON_TORTOISE.png',
  'stage-04/enemies/MON_ABYSS_WYRM.png',
  'stage-05/enemies/MON_ECLIPSE_KUN_EMPEROR.png',
  'stage-06/enemies/MON_MIRAGE_MOTHER.png',
  'stage-07/enemies/MON_DUAL_PHASE_BOOK_MOTH.png',
  'stage-01/towers/TOWER_SOLAR_BASE_V2.png',
  'stage-01/towers/TOWER_SOLAR_HEAD_V2.png',
  'stage-01/towers/TOWER_FROST_BASE_V2.png',
  'stage-01/towers/TOWER_FROST_HEAD_V2.png',
  'stage-01/towers/TOWER_STORM_BASE_V2.png',
  'stage-01/towers/TOWER_STORM_HEAD_V2.png',
  'stage-01/ui/icons/MOD_DAMAGE.png',
  'stage-01/ui/icons/MOD_FREQUENCY.png',
  'stage-01/ui/icons/MOD_ARROW_COUNT.png',
  'stage-01/ui/icons/MOD_PENETRATION.png',
  'stage-01/ui/icons/MOD_CRIT_RATE.png',
  'stage-01/ui/icons/MOD_CRIT_DAMAGE.png',
  'stage-01/vfx/VFX_BATTLE_SYSTEM_SET__SPAWN_PORTAL.png',
  'stage-01/vfx/VFX_BASIC_COMBAT__NORMAL_HIT.png',
  'stage-01/vfx/VFX_BASIC_COMBAT__CRITICAL_HIT.png',
  'stage-01/vfx/VFX_BASIC_COMBAT__DEATH_DISSOLVE.png',
  'stage-01/audio/SFX_BATTLE_01.m4a',
  'stage-01/audio/SFX_BATTLE_03.m4a',
  'stage-01/audio/SFX_BATTLE_04.m4a',
  'stage-01/audio/SFX_BATTLE_07.m4a',
  'stage-01/audio/SFX_BATTLE_12.m4a',
  'stage-01/audio/SFX_UI_11.m4a',
  'stage-01/audio/STG_DEFEAT.m4a',
  'stage-01/audio/STG_VICTORY.m4a',
];

for (const file of runtimeAssetFiles) {
  const target = resolve(dist, 'assets', file);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, 'assets', file), target);
}
await cp(resolve(root, 'game.json'), resolve(dist, 'game.json'));

const buildMeta = {
  schemaVersion: 1,
  target: 'wechat-minigame',
  generatedAt: new Date().toISOString(),
  source: 'guardian-gate-minigame',
  entry: 'src/game.ts',
  stageIds,
};
await writeFile(resolve(dist, 'build-meta.json'), `${JSON.stringify(buildMeta, null, 2)}\n`);

const gameSource = await readFile(resolve(dist, 'game.js'), 'utf8');
console.log(`✓ 微信小游戏构建完成：${Buffer.byteLength(gameSource)} bytes JavaScript`);
