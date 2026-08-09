import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const stageIds = [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
  'STAGE_08',
];
const stagePackages = stageIds.slice(1).map((stageId) => {
  const ordinal = stageId.slice(-2);
  const name = `stage-${ordinal}`;
  return {
    stageId,
    name,
    root: `packages/${name}`,
    assetRoot: `stage-${ordinal}`,
  };
});

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

const mainPackageAssetFiles = [
  'stage-01/background/STAGE_01_BACKGROUND.jpg',
  'stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  'stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  'stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
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
  'stage-01/vfx/VFX_BASIC_COMBAT__ARMOR_HIT.png',
  'stage-01/vfx/VFX_BASIC_COMBAT__ARROW_TRAIL.png',
  'stage-01/vfx/VFX_BASIC_COMBAT__MULTISHOT_VOLLEY.png',
  'stage-01/vfx/VFX_BATTLE_SYSTEM_SET__BREACH.png',
  'stage-01/vfx/VFX_BATTLE_SYSTEM_SET__DEFEAT.png',
  'stage-01/vfx/VFX_BATTLE_SYSTEM_SET__LEVEL_UP.png',
  'stage-01/vfx/VFX_BATTLE_SYSTEM_SET__REVIVE.png',
  'stage-01/vfx/VFX_BATTLE_SYSTEM_SET__VICTORY.png',
  'stage-01/vfx/VFX_STATUS_SET__REVIVE_PROTECT.png',
  'stage-01/audio/SFX_BATTLE_01.m4a',
  'stage-01/audio/SFX_BATTLE_03.m4a',
  'stage-01/audio/SFX_BATTLE_04.m4a',
  'stage-01/audio/SFX_BATTLE_07.m4a',
  'stage-01/audio/SFX_BATTLE_12.m4a',
  'stage-01/audio/SFX_UI_11.m4a',
  'stage-01/audio/STG_DEFEAT.m4a',
  'stage-01/audio/STG_VICTORY.m4a',
];

for (const file of mainPackageAssetFiles) {
  const target = resolve(dist, 'assets', file);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, 'assets', file), target);
}

for (const stagePackage of stagePackages) {
  const packageRoot = resolve(dist, stagePackage.root);
  const targetAssetRoot = resolve(packageRoot, 'assets', stagePackage.assetRoot);
  await mkdir(packageRoot, { recursive: true });
  await cp(resolve(root, 'assets', stagePackage.assetRoot), targetAssetRoot, { recursive: true });
  const packageEntry = [
    "'use strict';",
    'GameGlobal.__guardianGateLoadedSubpackages = GameGlobal.__guardianGateLoadedSubpackages || {};',
    `GameGlobal.__guardianGateLoadedSubpackages['${stagePackage.name}'] = true;`,
    '',
  ].join('\n');
  await writeFile(resolve(packageRoot, 'game.js'), packageEntry);
}
await cp(resolve(root, 'game.json'), resolve(dist, 'game.json'));

const buildMeta = {
  schemaVersion: 1,
  target: 'wechat-minigame',
  generatedAt: new Date().toISOString(),
  source: 'guardian-gate-minigame',
  entry: 'src/game.ts',
  stageIds,
  subpackages: stagePackages.map(({ stageId, name, root: packageRoot, assetRoot }) => ({
    stageId,
    name,
    root: packageRoot,
    assetRoot,
  })),
};
await writeFile(resolve(dist, 'build-meta.json'), `${JSON.stringify(buildMeta, null, 2)}\n`);

const gameSource = await readFile(resolve(dist, 'game.js'), 'utf8');
console.log(`✓ 微信小游戏构建完成：${Buffer.byteLength(gameSource)} bytes JavaScript`);
console.log(`✓ Stage 02–08 普通分包已生成：${stagePackages.map(({ root: packageRoot }) => packageRoot).join(', ')}`);
