import type {
  BattleBundleV1,
  EnemyDefinition,
  WaveDefinition,
} from './contracts';

export type WaveThreatTag =
  | 'flying'
  | 'armored'
  | 'guard-aura'
  | 'phase-shell'
  | 'ethereal'
  | 'enrage'
  | 'fast'
  | 'boss';

export interface WaveEnemyForecast {
  enemyId: string;
  name: string;
  count: number;
  movement: EnemyDefinition['movement'];
  threatTags: WaveThreatTag[];
}

export interface WaveForecast {
  waveIndex: number;
  waveCount: number;
  totalEnemies: number;
  estimatedSpawnTicks: number;
  enemies: WaveEnemyForecast[];
  threatTags: WaveThreatTag[];
  headline: string;
}

const FAST_ENEMY_SPEED_PX_PER_SECOND = 150;

function threatTagsForEnemy(
  enemy: EnemyDefinition,
  waveSpeedMultiplierBp: number,
): WaveThreatTag[] {
  const tags: WaveThreatTag[] = [];
  if (enemy.movement === 'flying') tags.push('flying');
  if (enemy.armorBp >= 1_500) tags.push('armored');
  if ((enemy.guardAuraArmorBp ?? 0) > 0) tags.push('guard-aura');
  if ((enemy.phaseShellAboveHpBp ?? 0) > 0) tags.push('phase-shell');
  if ((enemy.etherealCycleTicks ?? 0) > 0) tags.push('ethereal');
  if ((enemy.enrageBelowHpBp ?? 0) > 0) tags.push('enrage');
  const effectiveSpeed = Math.floor(
    (enemy.speedPxPerSecond * waveSpeedMultiplierBp) / 10_000,
  );
  if (effectiveSpeed >= FAST_ENEMY_SPEED_PX_PER_SECOND) tags.push('fast');
  // Bosses use a materially larger collision/render footprint than regular
  // elites. Avoid labelling the strongest ordinary unit in every wave as a boss.
  if (enemy.radiusPx >= 60) tags.push('boss');
  return tags;
}

function estimateSpawnTicks(wave: WaveDefinition, groupGapTicks: number): number {
  return wave.groups.reduce((ticks, group, index) => {
    const groupTicks = Math.max(0, group.count - 1) * group.intervalTicks;
    return ticks + groupTicks + (index === wave.groups.length - 1 ? 0 : groupGapTicks);
  }, 0);
}

function createHeadline(enemies: readonly WaveEnemyForecast[], totalEnemies: number): string {
  if (enemies.length === 0) return '暂无来敌';
  const primary = [...enemies].sort((left, right) => right.count - left.count)[0];
  const suffix = enemies.length > 1 ? `等 ${enemies.length} 种敌军` : primary!.name;
  return `${totalEnemies} 名${suffix}`;
}

export function createWaveForecast(
  bundle: BattleBundleV1,
  zeroBasedWaveIndex: number,
): WaveForecast | undefined {
  if (bundle.mode === 'endless') return undefined;
  const wave = bundle.waves[zeroBasedWaveIndex];
  if (!wave) return undefined;

  const counts = new Map<string, number>();
  for (const group of wave.groups) {
    counts.set(group.enemyId, (counts.get(group.enemyId) ?? 0) + group.count);
  }

  const enemies = [...counts.entries()].map(([enemyId, count]): WaveEnemyForecast => {
    const enemy = bundle.enemies[enemyId];
    if (!enemy) {
      return {
        enemyId,
        name: enemyId,
        count,
        movement: 'ground',
        threatTags: [],
      };
    }
    return {
      enemyId,
      name: enemy.name,
      count,
      movement: enemy.movement,
      threatTags: threatTagsForEnemy(enemy, wave.speedMultiplierBp ?? 10_000),
    };
  });
  const totalEnemies = enemies.reduce((total, enemy) => total + enemy.count, 0);
  const threatTags = [...new Set(enemies.flatMap((enemy) => enemy.threatTags))];

  return {
    waveIndex: zeroBasedWaveIndex + 1,
    waveCount: bundle.waves.length,
    totalEnemies,
    estimatedSpawnTicks: estimateSpawnTicks(wave, bundle.rules.groupGapTicks),
    enemies,
    threatTags,
    headline: createHeadline(enemies, totalEnemies),
  };
}
