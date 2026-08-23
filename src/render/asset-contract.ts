import type {
  BattleBundleV1,
  BattleStageId,
  CardDefinition,
} from '../core/contracts';
import {
  MAIN_PACKAGE_ASSET_PATHS,
  STAGE_ASSET_MANIFESTS,
} from './asset-manifest';

export const BATTLE_VFX_ASSET_IDS = [
  'VFX_SPAWN_PORTAL',
  'VFX_NORMAL_HIT',
  'VFX_CRITICAL_HIT',
  'VFX_DEATH_DISSOLVE',
  'VFX_ARMOR_HIT',
  'VFX_ARROW_TRAIL',
  'VFX_MULTISHOT_VOLLEY',
  'VFX_BREACH',
  'VFX_DEFEAT',
  'VFX_LEVEL_UP',
  'VFX_REVIVE',
  'VFX_VICTORY',
  'VFX_REVIVE_PROTECT',
] as const;

export const BATTLE_RENDER_ASSET_IDS = [
  'projectile:basic-arrow',
  'ICON_PAUSE',
  'ICON_PLAY',
  'ICON_SPEED_1X',
  'ICON_SPEED_2X',
] as const;

export function resolveCardIconAssetId(
  card: Pick<CardDefinition, 'effectId' | 'iconAssetId'>,
): string {
  // Keep the deterministic card bundle compatible with existing checkpoints;
  // presentation-only icon upgrades resolve at the asset boundary.
  if (card.effectId === 'critical-mastery') return 'MOD_CRITICAL_MASTERY';
  if (card.effectId === 'tower-count') return 'MOD_TOWER_REINFORCEMENT';
  return card.iconAssetId;
}

export interface BattleAssetContractOptions {
  towerAssetIds: readonly string[];
  vfxAssetIds?: readonly string[];
}

export interface BattleAssetDependency {
  assetId: string;
  sources: readonly string[];
}

function addDependency(
  dependencies: Map<string, Set<string>>,
  assetId: string,
  source: string,
): void {
  if (!assetId) throw new Error(`${source} 未声明 assetId`);
  const sources = dependencies.get(assetId) ?? new Set<string>();
  sources.add(source);
  dependencies.set(assetId, sources);
}

export function collectReachableEnemyIds(bundle: BattleBundleV1): readonly string[] {
  const enemyIds = new Set<string>();
  for (const wave of bundle.waves) {
    for (const group of wave.groups) enemyIds.add(group.enemyId);
  }

  if (bundle.mode === 'endless') {
    const endless = bundle.endless;
    if (!endless) throw new Error(`关卡 ${bundle.stage.id} 声明为无尽模式但缺少 endless 配置`);
    for (const entry of endless.threatEntries) enemyIds.add(entry.enemyId);
    for (const enemyId of endless.miniBossEnemyIds) enemyIds.add(enemyId);
    enemyIds.add(endless.bossEnemyId);
    enemyIds.add(endless.bossSummonEnemyId);
  }

  return [...enemyIds].sort();
}

export function collectBattleAssetDependencies(
  bundle: BattleBundleV1,
  options: BattleAssetContractOptions,
): readonly BattleAssetDependency[] {
  const dependencies = new Map<string, Set<string>>();
  addDependency(dependencies, bundle.stage.backgroundAssetId, '关卡背景');

  for (const card of bundle.cards) {
    addDependency(dependencies, resolveCardIconAssetId(card), `卡牌 ${card.id} 图标`);
  }

  for (const enemyId of collectReachableEnemyIds(bundle)) {
    const enemy = bundle.enemies[enemyId];
    if (!enemy) throw new Error(`关卡 ${bundle.stage.id} 的可达敌人 ${enemyId} 缺少定义`);
    addDependency(dependencies, enemy.renderAssetId, `敌人 ${enemyId}`);
  }

  for (const assetId of options.towerAssetIds) {
    addDependency(dependencies, assetId, '防御塔');
  }
  for (const assetId of options.vfxAssetIds ?? BATTLE_VFX_ASSET_IDS) {
    addDependency(dependencies, assetId, '战斗 VFX');
  }
  for (const assetId of BATTLE_RENDER_ASSET_IDS) {
    addDependency(dependencies, assetId, '战斗渲染');
  }

  return [...dependencies.entries()]
    .map(([assetId, sources]) => ({ assetId, sources: [...sources].sort() }))
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export function stageAssetPaths(stageId: BattleStageId): Readonly<Record<string, string>> {
  const result: Record<string, string> = { ...MAIN_PACKAGE_ASSET_PATHS };
  for (const [assetId, path] of Object.entries(STAGE_ASSET_MANIFESTS[stageId].entries)) {
    const mainPath = result[assetId];
    if (mainPath !== undefined && mainPath !== path) {
      throw new Error(
        `关卡 ${stageId} 的资源 ${assetId} 同时指向主包 ${mainPath} 与分包 ${path}`,
      );
    }
    result[assetId] = path;
  }
  return result;
}

export function assertBattleBundleAssetContract(
  stageId: BattleStageId,
  bundle: BattleBundleV1,
  options: BattleAssetContractOptions,
): readonly BattleAssetDependency[] {
  if (bundle.stage.id !== stageId) {
    throw new Error(`资源契约关卡不一致：请求 ${stageId}，内容为 ${bundle.stage.id}`);
  }
  const availablePaths = stageAssetPaths(stageId);
  for (const [assetId, path] of Object.entries(availablePaths)) {
    if (!path) throw new Error(`关卡 ${stageId} 的资源 ${assetId} 未声明物理路径`);
  }

  const dependencies = collectBattleAssetDependencies(bundle, options);
  const missing = dependencies.filter(({ assetId }) => availablePaths[assetId] === undefined);
  if (missing.length > 0) {
    const detail = missing
      .map(({ assetId, sources }) => `${assetId}（${sources.join('、')}）`)
      .join('，');
    throw new Error(`关卡 ${stageId} 资源契约缺失：${detail}`);
  }
  return dependencies;
}
