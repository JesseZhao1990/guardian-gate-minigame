import {
  BATTLE_STAGE_ORDER,
  DEFAULT_AIM_ANGLE_U16,
  ENEMY_FLAG_ENRAGED,
  ENEMY_FLAG_ETHEREAL,
  ENEMY_FLAG_FLYING,
  ENEMY_FLAG_GUARD_AURA,
  ENEMY_FLAG_GUARDED,
  ENEMY_FLAG_PHASE_SHELL,
  PROJECTILE_FLAG_CRITICAL,
  PROJECTILE_FLAG_FOCUSED,
  PROJECTILE_FLAG_PENETRATION,
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  TICKS_PER_SECOND,
  type AuthorityEventV1,
  type BattleBundleV1,
  type BattleCommand,
  type BattleEvent,
  type BattleFlowState,
  type BattleMode,
  type BattleOutcome,
  type CardDefinition,
  type CardEffectId,
  type EffectiveTowerStatsV1,
  type EnemyDefinition,
  type EndlessHudProjectionV1,
  type EndlessPhase,
  type EndlessSettlementReason,
  type HudProjectionV1,
  type OfferGranted,
  type Point,
  type RenderEntityV1,
  type RenderSnapshotV1,
  type TowerAimAnglesU16,
  type TowerCardPreviewV1,
  type TowerDefinition,
  type TowerId,
  type TowerRuntimeProjectionV1,
} from './contracts';

const CHECKPOINT_SCHEMA_VERSION = 5;
const LEGACY_GATELESS_CHECKPOINT_SCHEMA_VERSION = 4;
const LEGACY_INDEPENDENT_AIM_CHECKPOINT_SCHEMA_VERSION = 3;
const LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION = 2;
const MILLI_PX = 1_000;
const TARGETABLE_SCREEN_MIN_Y_PX = 64;
const U16_TURN = 65_536;
const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;
const CORDIC_QUARTER_TURN = U16_TURN / 4;
const CORDIC_HALF_TURN = U16_TURN / 2;
const CORDIC_INITIAL_X_Q30 = 652_032_874;
const CORDIC_ATAN_U16 = [8_192, 4_836, 2_555, 1_297, 651, 326, 163, 81, 41, 20, 10, 5, 3, 1, 1] as const;
const MAX_DAMAGE_BONUS_BP = 30_000;
const MAX_FREQUENCY_BONUS_BP = 20_000;
const MAX_ARROW_COUNT_ADD = 8;
const MAX_PENETRATION_ADD = 6;
const MAX_CRIT_CHANCE_ADD_BP = 7_500;
const MAX_CRIT_DAMAGE_ADD_BP = 20_000;
const MAX_ARROW_COUNT = 9;
const MAX_PENETRATION_COUNT = 6;
const MAX_CRIT_CHANCE_BP = 8_000;
const MAX_CRIT_DAMAGE_BP = 35_000;
const MIN_ATTACK_INTERVAL_TICKS = 6;
const FIXED_WAVE_GROUP_ID_CAPACITY = 256;
const FIXED_GROUP_UNIT_ID_CAPACITY = 4_096;
const PROJECTILE_ENTITY_ID_BASE = 1_500_000_000;
const MAX_RENDER_ENTITY_ID = 0x7fff_ffff;
const MAX_ENEMY_HP_MILLI = Math.floor(Number.MAX_SAFE_INTEGER / 10_000);
const MAX_DAMAGE_COUNTER_MILLI = Number.MAX_SAFE_INTEGER - MAX_ENEMY_HP_MILLI;
const MAX_ENDLESS_SPEED_MULTIPLIER_BP = 13_500;
const MAX_ENDLESS_EXP_MULTIPLIER_BP = 7_200;
const MAX_MOVEMENT_SPEED_PX_PER_SECOND = Math.floor(
  (Number.MAX_SAFE_INTEGER - (TICKS_PER_SECOND - 1)) / MILLI_PX,
);
const ENDLESS_ENEMY_ID_SEQUENCE_RESERVE = 121;
const PROJECTILE_ID_SEQUENCE_RESERVE = 3 * MAX_ARROW_COUNT;
const EVENT_SEQUENCE_PER_PROJECTILE_RESERVE = 2 * (MAX_PENETRATION_COUNT + 1);
const EVENT_SEQUENCE_PER_TICK_LIFETIME_RESERVE = 1_024;
const AUTHORITY_SEQUENCE_RESERVE = 1;
const COMMAND_SEQUENCE_RESERVE = 1;
const DEFAULT_FIXED_GATE_INTEGRITY = 1;
const DEFAULT_REVIVE_GATE_RESTORE_BP = 5_000;
const DEFAULT_FOCUS_DAMAGE_BONUS_BP = 2_500;
const PRECISION_FOCUS_DAMAGE_BONUS_BP = 10_000;
const PRECISION_PENETRATION_ADD = 2;
const DEFAULT_OVERDRIVE_DURATION_TICKS = 5 * TICKS_PER_SECOND;
const OVERDRIVE_MAX_CHARGE = 100;
const OVERDRIVE_FOCUSED_HIT_CHARGE = 1;
const OVERDRIVE_KILL_CHARGE = 7;
const OVERDRIVE_DAMAGE_BONUS_BP = 2_500;
const OVERDRIVE_ATTACK_INTERVAL_BP = 6_500;
const OVERDRIVE_ARROW_COUNT_ADD = 2;
const OVERDRIVE_PENETRATION_ADD = 1;
const MIN_VOLLEY_DAMAGE_SCALE_BP = 5_000;

export interface CommandAck {
  seq: number;
  appliedTick: number;
  status: 'applied' | 'duplicate' | 'rejected';
}

export type FlowRequest =
  | { type: 'OFFER'; ordinal: number; tick: number; eligibleEffectIds: CardEffectId[] }
  | { type: 'REVIVE'; ordinal: number; tick: number };

export interface SimulationOutput {
  ticksAdvanced: number;
  commandAcks: CommandAck[];
  events: BattleEvent[];
  flowRequests: FlowRequest[];
}

export interface BattleSimulation {
  applyCommand(command: BattleCommand): SimulationOutput;
  applyAuthorityEvent(event: AuthorityEventV1): SimulationOutput;
  advanceWallTime(milliseconds: number): SimulationOutput;
  advanceTicks(ticks: number): SimulationOutput;
  getHudProjection(): HudProjectionV1;
  getRenderSnapshot(workerEpoch?: number, snapshotSeq?: number): RenderSnapshotV1;
  createCheckpoint(): Uint8Array;
  getChecksum(): string;
}

interface CompiledPoint {
  xMilli: number;
  yMilli: number;
}

interface CompiledSegment {
  start: CompiledPoint;
  end: CompiledPoint;
  lengthMilli: number;
  cumulativeStartMilli: number;
  rotationU16: number;
}

interface CompiledRoute {
  points: CompiledPoint[];
  segments: CompiledSegment[];
  totalLengthMilli: number;
}

interface EnemyState {
  entityId: number;
  definitionId: string;
  hpMilli: number;
  maxHpMilli: number;
  distanceMilli: number;
  movementRemainder: number;
  ageTicks: number;
  expAward: number;
  speedMultiplierBp?: number;
  invulnerableUntilTick?: number;
}

interface ProjectileState {
  entityId: number;
  towerId: TowerId;
  targetEntityId: number;
  bornTick: number;
  xMilli: number;
  yMilli: number;
  movementRemainder: number;
  damageMilli: number;
  critical: boolean;
  penetration: number;
  focused: boolean;
}

interface SchedulerState {
  waveIndex: number;
  groupIndex: number;
  unitIndex: number;
  nextSpawnTick: number;
  allGroupsSpawned: boolean;
  completedWaves: number;
  currentWaveSpawned: number;
  currentWaveKilled: number;
  victoryPending: boolean;
}

interface PlayerStats {
  damageBonusBp: number;
  frequencyBonusBp: number;
  arrowCountAdd: number;
  penetrationAdd: number;
  critChanceAddBp: number;
  critDamageAddBp: number;
}

interface EndlessSpawnSpec {
  enemyId: string;
  hpMultiplierBp: number;
  speedMultiplierBp: number;
  expMultiplierBp: number;
}

interface EndlessThreatPackState {
  ordinal: number;
  scheduledTick: number;
  nextSpawnTick: number;
  nextUnitIndex: number;
  units: EndlessSpawnSpec[];
}

interface EndlessState {
  phase: EndlessPhase;
  settlementReason: EndlessSettlementReason | null;
  routeId: string;
  reachedBoss: boolean;
  survivalTick: number;
  bossLayer: number;
  bossDamageMilli: number;
  scoreReachedTick: number;
  threatPackOrdinal: number;
  bossSummonOrdinal: number;
  pendingPacks: EndlessThreatPackState[];
  bossEntityId: number | null;
}

interface SerializableState {
  tick: number;
  speed: 1 | 2;
  flowState: BattleFlowState;
  outcome: BattleOutcome | null;
  aimAnglesU16: TowerAimAnglesU16;
  towerCooldowns: number[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  scheduler: SchedulerState;
  endless: EndlessState | null;
  level: number;
  exp: number;
  stats: PlayerStats;
  activeOffer: OfferGranted | null;
  revivesUsed: number;
  reviveGuardRemainingTicks: number;
  gateIntegrity: number;
  overdriveCharge: number;
  overdriveTowerId: TowerId | null;
  overdriveRemainingTicks: number;
  damageDealtMilli: number;
  rngState: number;
  initialSeed: number;
  lastCommandSeq: number;
  lastAuthoritySeq: number;
  nextEnemyId: number;
  nextProjectileId: number;
  eventSeq: number;
  wallTickRemainder: number;
}

interface CheckpointEnvelope {
  schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
  releaseId: string;
  configHash: string;
  state: SerializableState;
}

type LegacyProjectileStateV4 = Omit<ProjectileState, 'focused'>;

type LegacySerializableStateV4 = Omit<
  SerializableState,
  | 'projectiles'
  | 'gateIntegrity'
  | 'overdriveCharge'
  | 'overdriveTowerId'
  | 'overdriveRemainingTicks'
> & {
  projectiles: LegacyProjectileStateV4[];
};

interface LegacyGatelessCheckpointEnvelope {
  schemaVersion: typeof LEGACY_GATELESS_CHECKPOINT_SCHEMA_VERSION;
  releaseId: string;
  configHash: string;
  state: LegacySerializableStateV4;
}

type LegacySerializableStateV3 = Omit<
  LegacySerializableStateV4,
  'outcome' | 'endless' | 'nextEnemyId'
>;

interface LegacyIndependentAimCheckpointEnvelope {
  schemaVersion: typeof LEGACY_INDEPENDENT_AIM_CHECKPOINT_SCHEMA_VERSION;
  releaseId: string;
  configHash: string;
  state: LegacySerializableStateV3;
}

type LegacySharedAimState = Omit<LegacySerializableStateV3, 'aimAnglesU16'> & {
  aimAngleU16: number;
};

interface LegacySharedAimCheckpointEnvelope {
  schemaVersion: typeof LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION;
  releaseId: string;
  configHash: string;
  state: LegacySharedAimState;
}

interface TierStats {
  damageBp: number;
  frequencyBp: number;
  rangeBp: number;
}

interface TowerStatCaps {
  arrowCount: number;
  penetrationCount: number;
  volleyDamageFalloffBp: number;
}

interface TowerTargetingSnapshot {
  targets: EnemyState[];
  preferredEntityIds: Set<number>;
  enemiesInRange: number;
  preferredEnemiesInRange: number;
}

function emptyOutput(): SimulationOutput {
  return {
    ticksAdvanced: 0,
    commandAcks: [],
    events: [],
    flowRequests: [],
  };
}

function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

function integerSqrt(value: bigint): bigint {
  if (value < 0n) {
    throw new Error('Integer square root requires a non-negative value.');
  }
  if (value < 2n) {
    return value;
  }

  let current = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  let next = (current + value / current) >> 1n;
  while (next < current) {
    current = next;
    next = (current + value / current) >> 1n;
  }
  return current;
}

function integerCeilSqrt(value: bigint): bigint {
  const floor = integerSqrt(value);
  return floor * floor === value ? floor : floor + 1n;
}

function squaredDistance(deltaX: number, deltaY: number): bigint {
  const x = BigInt(deltaX);
  const y = BigInt(deltaY);
  return x * x + y * y;
}

function roundedIntegerHypot(deltaX: number, deltaY: number): number {
  const squared = squaredDistance(deltaX, deltaY);
  const floor = integerSqrt(squared);
  const twiceMidpoint = floor * 2n + 1n;
  return Number(squared * 4n >= twiceMidpoint * twiceMidpoint ? floor + 1n : floor);
}

function multiplyDivideTowardZero(value: number, multiplier: number, divisor: number): number {
  if (divisor <= 0) {
    throw new Error('Fixed-point divisor must be positive.');
  }
  return Number((BigInt(value) * BigInt(multiplier)) / BigInt(divisor));
}

function mulBp(value: number, bp: number): number {
  return Number((BigInt(value) * BigInt(bp) + 5_000n) / 10_000n);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toRenderAngleU16(deltaX: number, deltaY: number): number {
  const turns = Math.atan2(deltaY, deltaX) / (Math.PI * 2);
  return (roundHalfUp(turns * U16_TURN) + U16_TURN) & 0xffff;
}

interface CordicVector {
  xQ30: number;
  yQ30: number;
}

function cordicVector(angleU16: number): CordicVector {
  let remaining = ((angleU16 & 0xffff) + CORDIC_HALF_TURN) % U16_TURN - CORDIC_HALF_TURN;
  let sign = 1;
  if (remaining > CORDIC_QUARTER_TURN) {
    remaining -= CORDIC_HALF_TURN;
    sign = -1;
  } else if (remaining < -CORDIC_QUARTER_TURN) {
    remaining += CORDIC_HALF_TURN;
    sign = -1;
  }

  let x = CORDIC_INITIAL_X_Q30;
  let y = 0;
  for (let index = 0; index < CORDIC_ATAN_U16.length; index += 1) {
    const angle = CORDIC_ATAN_U16[index] ?? 0;
    const direction = remaining >= 0 ? 1 : -1;
    const previousX = x;
    x -= direction * (y >> index);
    y += direction * (previousX >> index);
    remaining -= direction * angle;
  }
  return { xQ30: sign * x, yQ30: sign * y };
}

function compilePoint(point: Point): CompiledPoint {
  return {
    xMilli: roundHalfUp(point.x * MILLI_PX),
    yMilli: roundHalfUp(point.y * MILLI_PX),
  };
}

function compileRoute(points: Point[]): CompiledRoute {
  if (points.length < 2) {
    throw new Error('Battle route requires at least two points.');
  }

  const compiledPoints = points.map(compilePoint);
  const segments: CompiledSegment[] = [];
  let cumulativeStartMilli = 0;

  for (let index = 0; index < compiledPoints.length - 1; index += 1) {
    const start = compiledPoints[index];
    const end = compiledPoints[index + 1];
    if (!start || !end) {
      throw new Error(`Route segment ${index} is incomplete.`);
    }

    const deltaX = end.xMilli - start.xMilli;
    const deltaY = end.yMilli - start.yMilli;
    const lengthMilli = Math.max(1, roundedIntegerHypot(deltaX, deltaY));
    segments.push({
      start,
      end,
      lengthMilli,
      cumulativeStartMilli,
      rotationU16: toRenderAngleU16(deltaX, deltaY),
    });
    cumulativeStartMilli += lengthMilli;
  }

  return {
    points: compiledPoints,
    segments,
    totalLengthMilli: cumulativeStartMilli,
  };
}

function pointAtDistance(route: CompiledRoute, distanceMilli: number): CompiledPoint & { rotationU16: number } {
  const clampedDistance = clamp(distanceMilli, 0, route.totalLengthMilli);
  let selected = route.segments[route.segments.length - 1];

  for (const segment of route.segments) {
    if (clampedDistance <= segment.cumulativeStartMilli + segment.lengthMilli) {
      selected = segment;
      break;
    }
  }

  if (!selected) {
    throw new Error('Compiled route has no segments.');
  }

  const offset = clamp(clampedDistance - selected.cumulativeStartMilli, 0, selected.lengthMilli);
  const deltaX = selected.end.xMilli - selected.start.xMilli;
  const deltaY = selected.end.yMilli - selected.start.yMilli;
  return {
    xMilli: selected.start.xMilli + Math.trunc((deltaX * offset) / selected.lengthMilli),
    yMilli: selected.start.yMilli + Math.trunc((deltaY * offset) / selected.lengthMilli),
    rotationU16: selected.rotationU16,
  };
}

function tierStats(level: number): TierStats {
  if (level >= 35) {
    return { damageBp: 16_000, frequencyBp: 12_000, rangeBp: 11_500 };
  }
  if (level >= 20) {
    return { damageBp: 13_500, frequencyBp: 11_250, rangeBp: 11_000 };
  }
  if (level >= 10) {
    return { damageBp: 11_500, frequencyBp: 10_500, rangeBp: 10_500 };
  }
  return { damageBp: 10_000, frequencyBp: 10_000, rangeBp: 10_000 };
}

function emptyPlayerStats(): PlayerStats {
  return {
    damageBonusBp: 0,
    frequencyBonusBp: 0,
    arrowCountAdd: 0,
    penetrationAdd: 0,
    critChanceAddBp: 0,
    critDamageAddBp: 0,
  };
}

function deriveEffectiveTowerStats(
  tower: TowerDefinition,
  tier: TierStats,
  playerStats: PlayerStats,
  caps: TowerStatCaps = {
    arrowCount: MAX_ARROW_COUNT,
    penetrationCount: MAX_PENETRATION_COUNT,
    volleyDamageFalloffBp: 0,
  },
): EffectiveTowerStatsV1 {
  const damageBonusBp = Math.min(MAX_DAMAGE_BONUS_BP, playerStats.damageBonusBp);
  const frequencyBonusBp = Math.min(MAX_FREQUENCY_BONUS_BP, playerStats.frequencyBonusBp);
  const arrowCountAdd = Math.min(MAX_ARROW_COUNT_ADD, playerStats.arrowCountAdd);
  const penetrationAdd = Math.min(MAX_PENETRATION_ADD, playerStats.penetrationAdd);
  const critChanceAddBp = Math.min(MAX_CRIT_CHANCE_ADD_BP, playerStats.critChanceAddBp);
  const critDamageAddBp = Math.min(MAX_CRIT_DAMAGE_ADD_BP, playerStats.critDamageAddBp);

  const arrowCount = Math.min(caps.arrowCount, tower.baseArrowCount + arrowCountAdd);
  const volleyDamageScaleBp = Math.max(
    MIN_VOLLEY_DAMAGE_SCALE_BP,
    10_000 - Math.max(0, arrowCount - 1) * caps.volleyDamageFalloffBp,
  );
  let damagePerArrowMilli = mulBp(tower.baseDamageMilli, tier.damageBp);
  damagePerArrowMilli = mulBp(damagePerArrowMilli, 10_000 + damageBonusBp);
  damagePerArrowMilli = mulBp(damagePerArrowMilli, volleyDamageScaleBp);
  const critChanceBp = Math.min(MAX_CRIT_CHANCE_BP, tower.critChanceBp + critChanceAddBp);
  const critDamageBp = Math.min(MAX_CRIT_DAMAGE_BP, tower.critDamageBp + critDamageAddBp);
  const frequencyBp = mulBp(tier.frequencyBp, 10_000 + frequencyBonusBp);
  const attackIntervalTicks = Math.max(
    MIN_ATTACK_INTERVAL_TICKS,
    Math.ceil((tower.attackIntervalTicks * 10_000) / frequencyBp),
  );
  const rangeMilli = mulBp(tower.rangePx * MILLI_PX, tier.rangeBp);

  return {
    damagePerArrowMilli,
    criticalDamagePerArrowMilli: mulBp(damagePerArrowMilli, critDamageBp),
    attackIntervalTicks,
    attackRateMilliPerSecond: roundHalfUp(
      (TICKS_PER_SECOND * 1_000) / attackIntervalTicks,
    ),
    rangePx: rangeMilli / MILLI_PX,
    arrowCount,
    penetrationCount: Math.min(
      caps.penetrationCount,
      tower.basePenetration + penetrationAdd,
    ),
    penetrationRetentionBp: tower.penetrationRetentionBp,
    critChanceBp,
    critDamageBp,
  };
}

function applyCardEffectToStats(
  playerStats: PlayerStats,
  card: CardDefinition,
): { stats: PlayerStats; capped: boolean } {
  const stats = { ...playerStats };
  let capped = false;

  switch (card.effectId) {
    case 'tower-damage': {
      const requested = stats.damageBonusBp + (card.valueBp ?? 0);
      stats.damageBonusBp = Math.min(MAX_DAMAGE_BONUS_BP, requested);
      capped = stats.damageBonusBp !== requested;
      break;
    }
    case 'tower-frequency': {
      const requested = stats.frequencyBonusBp + (card.valueBp ?? 0);
      stats.frequencyBonusBp = Math.min(MAX_FREQUENCY_BONUS_BP, requested);
      capped = stats.frequencyBonusBp !== requested;
      break;
    }
    case 'arrow-count': {
      const requested = stats.arrowCountAdd + (card.valueInt ?? 0);
      stats.arrowCountAdd = Math.min(MAX_ARROW_COUNT_ADD, requested);
      capped = stats.arrowCountAdd !== requested;
      break;
    }
    case 'penetration': {
      const requested = stats.penetrationAdd + (card.valueInt ?? 0);
      stats.penetrationAdd = Math.min(MAX_PENETRATION_ADD, requested);
      capped = stats.penetrationAdd !== requested;
      break;
    }
    case 'crit-rate': {
      const requested = stats.critChanceAddBp + (card.valueBp ?? 0);
      stats.critChanceAddBp = Math.min(MAX_CRIT_CHANCE_ADD_BP, requested);
      capped = stats.critChanceAddBp !== requested;
      break;
    }
    case 'crit-damage': {
      const requested = stats.critDamageAddBp + (card.valueBp ?? 0);
      stats.critDamageAddBp = Math.min(MAX_CRIT_DAMAGE_ADD_BP, requested);
      capped = stats.critDamageAddBp !== requested;
      break;
    }
  }

  return { stats, capped };
}

function isEffectiveCardCapReached(
  before: EffectiveTowerStatsV1,
  card: CardDefinition,
  caps: TowerStatCaps = {
    arrowCount: MAX_ARROW_COUNT,
    penetrationCount: MAX_PENETRATION_COUNT,
    volleyDamageFalloffBp: 0,
  },
): boolean {
  switch (card.effectId) {
    case 'arrow-count':
      return before.arrowCount + (card.valueInt ?? 0) > caps.arrowCount;
    case 'penetration':
      return before.penetrationCount + (card.valueInt ?? 0) > caps.penetrationCount;
    case 'crit-rate':
      return before.critChanceBp + (card.valueBp ?? 0) > MAX_CRIT_CHANCE_BP;
    case 'crit-damage':
      return before.critDamageBp + (card.valueBp ?? 0) > MAX_CRIT_DAMAGE_BP;
    case 'tower-frequency':
      return before.attackIntervalTicks <= MIN_ATTACK_INTERVAL_TICKS && (card.valueBp ?? 0) > 0;
    case 'tower-damage':
      return false;
  }
}

function requiredExp(level: number, maximumLevel: number): number {
  return level >= maximumLevel ? 0 : 40 + level * 10;
}

function copyOffer(offer: OfferGranted): OfferGranted {
  const common = {
    type: 'OFFER_GRANTED' as const,
    authoritySeq: offer.authoritySeq,
    authorizationId: offer.authorizationId,
    offerId: offer.offerId,
    cards: [...offer.cards] as [string, string, string],
  };
  return offer.replacesOfferId === undefined
    ? common
    : { ...common, replacesOfferId: offer.replacesOfferId };
}

function xorshift32(value: number): number {
  let next = value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function battleMode(bundle: BattleBundleV1): BattleMode {
  return bundle.mode ?? 'fixed';
}

function gateIntegrityMax(bundle: BattleBundleV1): number {
  return battleMode(bundle) === 'fixed'
    ? bundle.rules.gateIntegrity ?? DEFAULT_FIXED_GATE_INTEGRITY
    : 1;
}

function reviveGateRestoreBp(bundle: BattleBundleV1): number {
  return bundle.rules.reviveGateRestoreBp ?? DEFAULT_REVIVE_GATE_RESTORE_BP;
}

function focusDamageBonusBp(bundle: BattleBundleV1): number {
  return battleMode(bundle) === 'fixed'
    ? bundle.rules.focusDamageBonusBp ?? DEFAULT_FOCUS_DAMAGE_BONUS_BP
    : 0;
}

function overdriveDurationTicks(bundle: BattleBundleV1): number {
  return battleMode(bundle) === 'fixed'
    ? bundle.rules.overdriveDurationTicks ?? DEFAULT_OVERDRIVE_DURATION_TICKS
    : 0;
}

function towerStatCaps(bundle: BattleBundleV1): TowerStatCaps {
  return battleMode(bundle) === 'fixed'
    ? {
        arrowCount: bundle.rules.arrowCountCap ?? MAX_ARROW_COUNT,
        penetrationCount: bundle.rules.penetrationCap ?? MAX_PENETRATION_COUNT,
        volleyDamageFalloffBp: bundle.rules.volleyDamageFalloffBp ?? 0,
      }
    : {
        arrowCount: MAX_ARROW_COUNT,
        penetrationCount: MAX_PENETRATION_COUNT,
        volleyDamageFalloffBp: 0,
      };
}

function endlessDerivedRandom(seed: number, packOrdinal: number, unitOrdinal: number): number {
  let mixed = (seed >>> 0) || 0x6d2b79f5;
  mixed ^= Math.imul(packOrdinal + 1, 0x9e37_79b1);
  mixed = xorshift32(mixed);
  mixed ^= Math.imul(unitOrdinal + 1, 0x85eb_ca6b);
  return xorshift32(mixed);
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

class BattleSimulationImpl implements BattleSimulation {
  readonly bundle: BattleBundleV1;
  readonly route: CompiledRoute;
  private state: SerializableState;
  private towerFacingCacheKey = '';
  private towerFacingCache: TowerAimAnglesU16 = [
    DEFAULT_AIM_ANGLE_U16,
    DEFAULT_AIM_ANGLE_U16,
    DEFAULT_AIM_ANGLE_U16,
  ];

  constructor(bundle: BattleBundleV1, seed: number, checkpoint?: Uint8Array) {
    this.validateBundle(bundle);
    this.bundle = bundle;
    this.route = compileRoute(bundle.route.points);
    this.state = checkpoint === undefined ? this.createInitialState(seed) : this.restoreCheckpoint(seed, checkpoint);
  }

  applyCommand(command: BattleCommand): SimulationOutput {
    const output = emptyOutput();
    if (
      !Number.isSafeInteger(command.seq) ||
      command.seq <= 0 ||
      command.seq > Number.MAX_SAFE_INTEGER - COMMAND_SEQUENCE_RESERVE
    ) {
      output.commandAcks.push({ seq: command.seq, appliedTick: this.state.tick, status: 'rejected' });
      return output;
    }
    if (command.seq <= this.state.lastCommandSeq) {
      output.commandAcks.push({ seq: command.seq, appliedTick: this.state.tick, status: 'duplicate' });
      return output;
    }
    if (command.type === 'SET_SPEED' && command.value !== 1 && command.value !== 2) {
      output.commandAcks.push({ seq: command.seq, appliedTick: this.state.tick, status: 'rejected' });
      return output;
    }

    this.state.lastCommandSeq = command.seq;
    let status: CommandAck['status'] = 'applied';

    switch (command.type) {
      case 'SET_AIM':
        if (
          this.state.flowState === 'result' ||
          !Number.isInteger(command.towerId) ||
          command.towerId < 0 ||
          command.towerId >= this.state.aimAnglesU16.length ||
          !Number.isInteger(command.angleU16)
        ) {
          status = 'rejected';
        } else {
          this.state.aimAnglesU16[command.towerId] = command.angleU16 & 0xffff;
        }
        break;
      case 'ACTIVATE_OVERDRIVE':
        if (
          this.state.flowState !== 'running' ||
          battleMode(this.bundle) !== 'fixed' ||
          overdriveDurationTicks(this.bundle) <= 0 ||
          this.state.overdriveCharge < OVERDRIVE_MAX_CHARGE ||
          this.state.overdriveTowerId !== null ||
          this.state.overdriveRemainingTicks !== 0 ||
          !Number.isInteger(command.towerId) ||
          command.towerId < 0 ||
          command.towerId >= this.bundle.route.towerAnchors.length
        ) {
          status = 'rejected';
        } else {
          this.assertEventSequenceCapacity(1);
          this.state.overdriveCharge = 0;
          this.state.overdriveTowerId = command.towerId;
          this.state.overdriveRemainingTicks = overdriveDurationTicks(this.bundle);
          this.state.towerCooldowns[command.towerId] = 0;
          output.events.push({
            eventId: this.nextEventId(),
            tick: this.state.tick,
            type: 'OVERDRIVE_ACTIVATED',
            towerId: command.towerId,
            durationTicks: this.state.overdriveRemainingTicks,
          });
        }
        break;
      case 'SET_SPEED':
        if (
          this.state.flowState === 'result' ||
          (command.value !== 1 && command.value !== 2)
        ) {
          status = 'rejected';
        } else {
          this.state.speed = command.value;
        }
        break;
      case 'PAUSE':
        if (this.state.flowState !== 'running') {
          status = 'rejected';
        } else {
          this.state.flowState = 'paused';
          this.state.wallTickRemainder = 0;
        }
        break;
      case 'RESUME':
        if (this.state.flowState !== 'paused') {
          status = 'rejected';
        } else {
          this.state.flowState = 'running';
          this.state.wallTickRemainder = 0;
        }
        break;
      case 'FORFEIT':
        if (battleMode(this.bundle) !== 'endless' || this.state.flowState === 'result') {
          status = 'rejected';
        } else {
          this.assertEventSequenceCapacity(2);
          this.settleEndless('manual', output);
        }
        break;
    }

    output.commandAcks.push({ seq: command.seq, appliedTick: this.state.tick, status });
    return output;
  }

  applyAuthorityEvent(event: AuthorityEventV1): SimulationOutput {
    const output = emptyOutput();
    if (
      !Number.isSafeInteger(event.authoritySeq) ||
      event.authoritySeq <= 0 ||
      event.authoritySeq > Number.MAX_SAFE_INTEGER - AUTHORITY_SEQUENCE_RESERVE
    ) {
      throw new Error('Authority event sequence is malformed or exhausted.');
    }
    if (event.authoritySeq <= this.state.lastAuthoritySeq) {
      return output;
    }
    if (event.authoritySeq !== this.state.lastAuthoritySeq + 1) {
      throw new Error(
        `Authority sequence gap: expected ${this.state.lastAuthoritySeq + 1}, received ${event.authoritySeq}.`,
      );
    }
    this.assertEventSequenceCapacity(this.requiredEventSequenceReserve(this.state));

    switch (event.type) {
      case 'OFFER_GRANTED':
        this.applyOfferGranted(event);
        break;
      case 'CARD_CHOICE_ACCEPTED':
        this.applyCardChoice(event.offerId, event.cardId, output);
        break;
      case 'REVIVE_GRANTED':
        this.applyRevive(event.reviveOrdinal, output);
        break;
    }
    this.state.lastAuthoritySeq = event.authoritySeq;
    return output;
  }

  advanceWallTime(milliseconds: number): SimulationOutput {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error('Wall time must be a finite non-negative number.');
    }
    if (this.state.flowState !== 'running') {
      this.state.wallTickRemainder = 0;
      return emptyOutput();
    }

    const microseconds = Math.round(milliseconds * 1_000);
    if (!Number.isSafeInteger(microseconds) || microseconds < 0) {
      throw new Error('Wall time exceeds the safe fixed-point input range.');
    }
    const numerator = BigInt(this.state.wallTickRemainder) +
      BigInt(microseconds) * BigInt(TICKS_PER_SECOND) * BigInt(this.state.speed);
    const ticksBigInt = numerator / 1_000_000n;
    if (ticksBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Wall time produces an unsafe tick count.');
    }
    const ticks = Number(ticksBigInt);
    const nextWallTickRemainder = Number(numerator % 1_000_000n);
    this.state.wallTickRemainder = nextWallTickRemainder;
    return this.advanceTicks(ticks);
  }

  advanceTicks(ticks: number): SimulationOutput {
    if (!Number.isSafeInteger(ticks) || ticks < 0) {
      throw new Error('Tick count must be a non-negative integer.');
    }

    const output = emptyOutput();
    while (output.ticksAdvanced < ticks && this.state.flowState === 'running') {
      this.step(output);
      output.ticksAdvanced += 1;
    }
    return output;
  }

  getHudProjection(): HudProjectionV1 {
    const mode = battleMode(this.bundle);
    const endlessProjection = this.endlessHudProjection();
    let waveCount = this.bundle.waves.length;
    let waveIndex: number;
    let progressBp: number;
    if (mode === 'endless') {
      const endlessRules = this.requireEndlessRules();
      waveCount = Math.max(
        1,
        Math.ceil(
          (endlessRules.bossPhaseTick - endlessRules.threatStartTick) /
          endlessRules.threatPackIntervalTicks,
        ),
      );
      waveIndex = Math.min(
        waveCount,
        Math.max(
          1,
          Math.floor(
            (Math.min(this.state.tick, endlessRules.bossPhaseTick - 1) - endlessRules.threatStartTick) /
            endlessRules.threatPackIntervalTicks,
          ) + 1,
        ),
      );
      progressBp = clamp(
        roundHalfUp((Math.min(this.state.tick, endlessRules.settlementTick) * 10_000) /
          endlessRules.settlementTick),
        0,
        10_000,
      );
    } else {
      const currentWave = this.bundle.waves[this.state.scheduler.waveIndex];
      const totalInWave = currentWave?.groups.reduce((sum, group) => sum + group.count, 0) ?? 1;
      const waveFraction = this.state.scheduler.currentWaveKilled / totalInWave;
      waveIndex = Math.min(this.state.scheduler.waveIndex + 1, waveCount);
      progressBp =
        this.state.flowState === 'result' && this.state.scheduler.completedWaves === waveCount
          ? 10_000
          : clamp(
              roundHalfUp(
                ((this.state.scheduler.completedWaves + waveFraction) * 10_000) / Math.max(1, waveCount),
              ),
              0,
              10_000,
            );
    }

    const baseStats = deriveEffectiveTowerStats(
      this.bundle.tower,
      { damageBp: 10_000, frequencyBp: 10_000, rangeBp: 10_000 },
      emptyPlayerStats(),
      towerStatCaps(this.bundle),
    );
    const currentTier = tierStats(this.state.level);
    const afterLevelStats = deriveEffectiveTowerStats(
      this.bundle.tower,
      currentTier,
      emptyPlayerStats(),
      towerStatCaps(this.bundle),
    );
    const currentStats = deriveEffectiveTowerStats(
      this.bundle.tower,
      currentTier,
      this.state.stats,
      towerStatCaps(this.bundle),
    );
    const towerRuntime = this.bundle.route.towerAnchors.map((anchor, towerIndex) => {
      const targeting = this.towerTargetingSnapshot(anchor, towerIndex, currentStats.rangePx);
      const target = targeting.targets[0];
      const common = {
        towerId: towerIndex as TowerId,
        enemiesInRange: targeting.enemiesInRange,
        preferredEnemiesInRange: targeting.preferredEnemiesInRange,
      };
      return target === undefined
        ? common
        : {
            ...common,
            currentTargetEntityId: target.entityId,
            currentTargetName: this.enemyDefinition(target.definitionId).name,
          };
    }) satisfies TowerRuntimeProjectionV1[];

    const projection = {
      tick: this.state.tick,
      lastCommandSeq: this.state.lastCommandSeq,
      flowState: this.state.flowState,
      mode,
      outcome: this.state.outcome,
      speed: this.state.speed,
      level: this.state.level,
      exp: this.state.exp,
      expRequired: requiredExp(this.state.level, this.bundle.rules.maxLevel),
      waveIndex,
      waveCount,
      progressBp,
      aimAnglesU16: [...this.state.aimAnglesU16] as TowerAimAnglesU16,
      revivesUsed: this.state.revivesUsed,
      gateIntegrity: this.state.gateIntegrity,
      gateIntegrityMax: gateIntegrityMax(this.bundle),
      overdrive: {
        charge: this.state.overdriveCharge,
        maxCharge: OVERDRIVE_MAX_CHARGE,
        ready: this.state.overdriveCharge >= OVERDRIVE_MAX_CHARGE,
        activeTowerId: this.state.overdriveTowerId,
        remainingTicks: this.state.overdriveRemainingTicks,
        durationTicks: overdriveDurationTicks(this.bundle),
      },
      damageDealtMilli: this.state.damageDealtMilli,
      towerStats: {
        base: baseStats,
        afterLevel: afterLevelStats,
        current: currentStats,
      },
      towerRuntime,
      ...(endlessProjection === undefined ? {} : { endless: endlessProjection }),
    } satisfies Omit<HudProjectionV1, 'activeOffer' | 'offerPreviews'>;

    if (this.state.activeOffer === null) {
      return projection;
    }

    const offerPreviews = this.state.activeOffer.cards.map((cardId) => {
      const card = this.cardDefinition(cardId);
      if (!card) {
        throw new Error(`Active offer contains unknown card ${cardId}.`);
      }
      const applied = applyCardEffectToStats(this.state.stats, card);
      return {
        cardId,
        before: currentStats,
        after: deriveEffectiveTowerStats(
          this.bundle.tower,
          currentTier,
          applied.stats,
          towerStatCaps(this.bundle),
        ),
        capped: applied.capped || isEffectiveCardCapReached(
          currentStats,
          card,
          towerStatCaps(this.bundle),
        ),
      };
    }) satisfies TowerCardPreviewV1[];

    return {
      ...projection,
      activeOffer: copyOffer(this.state.activeOffer),
      offerPreviews,
    };
  }

  getRenderSnapshot(workerEpoch = 0, snapshotSeq = 0): RenderSnapshotV1 {
    const entities: RenderEntityV1[] = [];
    for (const enemy of [...this.state.enemies].sort((left, right) => left.entityId - right.entityId)) {
      const definition = this.enemyDefinition(enemy.definitionId);
      const point = pointAtDistance(this.route, enemy.distanceMilli);
      entities.push({
        entityId: enemy.entityId,
        renderKind: 'enemy',
        assetId: definition.renderAssetId,
        x: point.xMilli / MILLI_PX,
        y: point.yMilli / MILLI_PX,
        rotationU16: point.rotationU16,
        scaleBp: definition.renderScaleBp ?? 10_000,
        sortY: roundHalfUp(point.yMilli / MILLI_PX),
        hpBp: clamp(roundHalfUp((enemy.hpMilli * 10_000) / enemy.maxHpMilli), 0, 10_000),
        flags:
          (definition.movement === 'flying' ? ENEMY_FLAG_FLYING : 0) |
          (this.isEnemyEnraged(enemy, definition) ? ENEMY_FLAG_ENRAGED : 0) |
          (definition.guardAuraArmorBp !== undefined ? ENEMY_FLAG_GUARD_AURA : 0) |
          (this.guardAuraArmorBpFor(enemy) > 0 ? ENEMY_FLAG_GUARDED : 0) |
          (this.isPhaseShellActive(enemy, definition) ? ENEMY_FLAG_PHASE_SHELL : 0) |
          (this.isEnemyEthereal(enemy, definition) ? ENEMY_FLAG_ETHEREAL : 0),
      });
    }

    const towerFacingCacheKey = `${this.state.tick}:${this.state.lastCommandSeq}:${this.state.lastAuthoritySeq}`;
    if (this.towerFacingCacheKey !== towerFacingCacheKey) {
      this.towerFacingCache = this.bundle.route.towerAnchors.map((anchor, towerIndex) => {
        const target = this.legalTargets(anchor, towerIndex)[0];
        if (!target) {
          return this.state.aimAnglesU16[towerIndex] ?? DEFAULT_AIM_ANGLE_U16;
        }
        const targetPoint = pointAtDistance(this.route, target.distanceMilli);
        return toRenderAngleU16(
          targetPoint.xMilli - roundHalfUp(anchor.x * MILLI_PX),
          targetPoint.yMilli - roundHalfUp(anchor.y * MILLI_PX),
        );
      }) as TowerAimAnglesU16;
      this.towerFacingCacheKey = towerFacingCacheKey;
    }
    const towerFacingsU16 = [...this.towerFacingCache] as TowerAimAnglesU16;

    for (const projectile of [...this.state.projectiles].sort((left, right) => left.entityId - right.entityId)) {
      const target = this.state.enemies.find((enemy) => enemy.entityId === projectile.targetEntityId);
      const targetPoint = target
        ? pointAtDistance(this.route, target.distanceMilli)
        : { xMilli: projectile.xMilli + 1, yMilli: projectile.yMilli };
      const deltaX = targetPoint.xMilli - projectile.xMilli;
      const deltaY = targetPoint.yMilli - projectile.yMilli;
      entities.push({
        entityId: projectile.entityId,
        renderKind: 'projectile',
        assetId: 'projectile:basic-arrow',
        x: projectile.xMilli / MILLI_PX,
        y: projectile.yMilli / MILLI_PX,
        rotationU16: toRenderAngleU16(deltaX, deltaY),
        scaleBp: 10_000,
        sortY: roundHalfUp(projectile.yMilli / MILLI_PX),
        hpBp: 10_000,
        flags:
          (projectile.critical ? PROJECTILE_FLAG_CRITICAL : 0) |
          (projectile.penetration > 0 ? PROJECTILE_FLAG_PENETRATION : 0) |
          (projectile.focused ? PROJECTILE_FLAG_FOCUSED : 0) |
          ((projectile.towerId << PROJECTILE_FLAG_TOWER_ID_SHIFT) & PROJECTILE_FLAG_TOWER_ID_MASK),
      });
    }

    return {
      protocolVersion: 1,
      workerEpoch,
      snapshotSeq,
      tick: this.state.tick,
      towerFacingsU16,
      entities,
    };
  }

  createCheckpoint(): Uint8Array {
    const envelope: CheckpointEnvelope = {
      schemaVersion: CHECKPOINT_SCHEMA_VERSION,
      releaseId: this.bundle.releaseId,
      configHash: this.bundle.configHash,
      state: this.cloneState(),
    };
    return new TextEncoder().encode(JSON.stringify(envelope));
  }

  getChecksum(): string {
    const canonical = {
      simulationSchemaVersion: CHECKPOINT_SCHEMA_VERSION,
      releaseId: this.bundle.releaseId,
      configHash: this.bundle.configHash,
      mode: battleMode(this.bundle),
      tick: this.state.tick,
      flowState: this.state.flowState,
      outcome: this.state.outcome,
      aimAnglesU16: this.state.aimAnglesU16,
      towerCooldowns: this.state.towerCooldowns,
      enemies: [...this.state.enemies].sort((left, right) => left.entityId - right.entityId),
      projectiles: [...this.state.projectiles].sort((left, right) => left.entityId - right.entityId),
      scheduler: this.state.scheduler,
      endless: this.state.endless,
      level: this.state.level,
      exp: this.state.exp,
      stats: this.state.stats,
      activeOffer: this.state.activeOffer,
      revivesUsed: this.state.revivesUsed,
      reviveGuardRemainingTicks: this.state.reviveGuardRemainingTicks,
      gateIntegrity: this.state.gateIntegrity,
      overdriveCharge: this.state.overdriveCharge,
      overdriveTowerId: this.state.overdriveTowerId,
      overdriveRemainingTicks: this.state.overdriveRemainingTicks,
      damageDealtMilli: this.state.damageDealtMilli,
      rngState: this.state.rngState,
      initialSeed: this.state.initialSeed,
      lastCommandSeq: this.state.lastCommandSeq,
      lastAuthoritySeq: this.state.lastAuthoritySeq,
      nextEnemyId: this.state.nextEnemyId,
      nextProjectileId: this.state.nextProjectileId,
      eventSeq: this.state.eventSeq,
    };
    return fnv1a64(JSON.stringify(canonical));
  }

  private validateBundle(bundle: BattleBundleV1): void {
    if (bundle.schemaVersion !== 1) {
      throw new Error('battle-sim only accepts BattleBundleV1 content.');
    }
    if (!BATTLE_STAGE_ORDER.includes(bundle.stage.id)) {
      throw new Error(`Unsupported battle stage ${String(bundle.stage.id)}.`);
    }
    if (!bundle.releaseId || !bundle.configHash) {
      throw new Error('Battle bundle requires a release id and config hash.');
    }
    const mode = battleMode(bundle);
    if (bundle.route.towerAnchors.length !== 3) {
      throw new Error('A battle stage requires exactly three towers.');
    }
    if (mode === 'fixed' && bundle.waves.length !== 5) {
      throw new Error('A fixed battle stage requires exactly five waves.');
    }
    if (mode === 'endless' && bundle.waves.length !== 0) {
      throw new Error('An endless battle stage must use the deterministic threat scheduler, not waves.');
    }
    if (bundle.route.points.length < 2) {
      throw new Error('A battle stage route requires at least two points.');
    }
    if (
      !Number.isInteger(bundle.tower.aimHalfAngleU16) ||
      bundle.tower.aimHalfAngleU16 < 0 ||
      bundle.tower.aimHalfAngleU16 > CORDIC_QUARTER_TURN
    ) {
      throw new Error('Tower aim half-angle must be an integer between 0 and one quarter-turn.');
    }
    if (
      !Number.isInteger(bundle.tower.projectileSpeedPxPerSecond) ||
      bundle.tower.projectileSpeedPxPerSecond <= 0
    ) {
      throw new Error('Tower projectile speed must be a positive integer.');
    }
    if (
      !Number.isSafeInteger(bundle.tower.attackIntervalTicks) ||
      bundle.tower.attackIntervalTicks <= 0 ||
      !Number.isSafeInteger(bundle.rules.groupGapTicks) ||
      bundle.rules.groupGapTicks <= 0 ||
      !Number.isSafeInteger(bundle.rules.waveGapTicks) ||
      bundle.rules.waveGapTicks <= 0 ||
      !Number.isSafeInteger(bundle.rules.reviveGuardTicks) ||
      bundle.rules.reviveGuardTicks < 0
    ) {
      throw new Error('Battle tick intervals and guards must be safe positive integers.');
    }
    if (
      !Number.isSafeInteger(bundle.rules.maxLevel) ||
      bundle.rules.maxLevel < 0 ||
      !Number.isSafeInteger(bundle.rules.maxRevives) ||
      bundle.rules.maxRevives < 0 ||
      !Number.isInteger(bundle.rules.reviveGroundRollbackBp) ||
      bundle.rules.reviveGroundRollbackBp < 0 ||
      bundle.rules.reviveGroundRollbackBp > 10_000 ||
      (bundle.rules.gateIntegrity !== undefined && (
        !Number.isSafeInteger(bundle.rules.gateIntegrity) ||
        bundle.rules.gateIntegrity <= 0 ||
        bundle.rules.gateIntegrity > 10_000
      )) ||
      (bundle.rules.reviveGateRestoreBp !== undefined && (
        !Number.isInteger(bundle.rules.reviveGateRestoreBp) ||
        bundle.rules.reviveGateRestoreBp <= 0 ||
        bundle.rules.reviveGateRestoreBp > 10_000
      )) ||
      (bundle.rules.focusDamageBonusBp !== undefined && (
        !Number.isInteger(bundle.rules.focusDamageBonusBp) ||
        bundle.rules.focusDamageBonusBp < 0 ||
        bundle.rules.focusDamageBonusBp > 10_000
      )) ||
      (bundle.rules.arrowCountCap !== undefined && (
        !Number.isInteger(bundle.rules.arrowCountCap) ||
        bundle.rules.arrowCountCap < bundle.tower.baseArrowCount ||
        bundle.rules.arrowCountCap > MAX_ARROW_COUNT
      )) ||
      (bundle.rules.penetrationCap !== undefined && (
        !Number.isInteger(bundle.rules.penetrationCap) ||
        bundle.rules.penetrationCap < bundle.tower.basePenetration ||
        bundle.rules.penetrationCap > MAX_PENETRATION_COUNT
      )) ||
      (bundle.rules.volleyDamageFalloffBp !== undefined && (
        !Number.isInteger(bundle.rules.volleyDamageFalloffBp) ||
        bundle.rules.volleyDamageFalloffBp < 0 ||
        bundle.rules.volleyDamageFalloffBp > 2_000
      )) ||
      (bundle.rules.overdriveDurationTicks !== undefined && (
        !Number.isSafeInteger(bundle.rules.overdriveDurationTicks) ||
        (bundle.rules.overdriveDurationTicks !== 0 && (
          bundle.rules.overdriveDurationTicks < TICKS_PER_SECOND ||
          bundle.rules.overdriveDurationTicks > 30 * TICKS_PER_SECOND
        ))
      ))
    ) {
      throw new Error('Battle progression, gate, focus, or overdrive rules are invalid.');
    }
    if (
      mode === 'endless' &&
      (
        bundle.rules.gateIntegrity !== undefined ||
        bundle.rules.reviveGateRestoreBp !== undefined ||
        bundle.rules.focusDamageBonusBp !== undefined ||
        bundle.rules.arrowCountCap !== undefined ||
        bundle.rules.penetrationCap !== undefined ||
        bundle.rules.volleyDamageFalloffBp !== undefined ||
        bundle.rules.overdriveDurationTicks !== undefined
      )
    ) {
      throw new Error('Endless content must retain the Stage 08 breach and targeting contract.');
    }
    if (mode === 'endless') {
      const endless = bundle.endless;
      if (endless === undefined) {
        throw new Error('An endless battle stage requires endless rules.');
      }
      if (
        endless.routes.length !== 3 ||
        endless.routes.some(
          (route) => route.towerAnchors.length !== 3 || route.points.length < 2,
        ) ||
        new Set(endless.routes.map((route) => route.id)).size !== 3 ||
        !endless.routes.some((route) => route.id === bundle.route.id)
      ) {
        throw new Error('An endless battle stage requires three unique valid routes and a selected route.');
      }
      if (
        endless.threatStartTick !== 0 ||
        endless.bossPhaseTick !== 36_000 ||
        endless.settlementTick !== 45_000 ||
        endless.threatPackIntervalTicks !== 450 ||
        endless.unitIntervalTicks !== 24 ||
        endless.maxPackSize !== 32 ||
        endless.maxActiveEnemies !== 120 ||
        endless.bossSummonIntervalTicks !== 450 ||
        endless.bossLayerGuardTicks !== 30 ||
        endless.bossLayerHpGrowthBp !== 12_000 ||
        endless.miniBossTicks.length !== 3 ||
        endless.miniBossTicks[0] !== 14_400 ||
        endless.miniBossTicks[1] !== 25_200 ||
        endless.miniBossTicks[2] !== 34_200
      ) {
        throw new Error('Endless timing and cap rules do not match the Stage 08 contract.');
      }
      if (
        endless.threatLutBp.length !== 1_201 ||
        endless.threatLutBp.some((value) => !Number.isInteger(value) || value < 10_000)
      ) {
        throw new Error('Endless threatLutBp must contain 1201 positive integer basis-point values.');
      }
      const referencedEnemyIds = [
        ...endless.threatEntries.map((entry) => entry.enemyId),
        ...endless.miniBossEnemyIds,
        endless.bossEnemyId,
        endless.bossSummonEnemyId,
      ];
      if (
        endless.threatEntries.length === 0 ||
        endless.threatEntries.some(
          (entry) =>
            !Number.isInteger(entry.unlockTick) ||
            entry.unlockTick < 0 ||
            entry.unlockTick >= endless.bossPhaseTick ||
            !Number.isInteger(entry.threatCost) ||
            entry.threatCost <= 0,
        ) ||
        referencedEnemyIds.some((enemyId) => bundle.enemies[enemyId] === undefined)
      ) {
        throw new Error('Endless rules reference missing enemy content.');
      }
      if (bundle.enemies[endless.bossSummonEnemyId]?.movement !== 'flying') {
        throw new Error('Endless boss summons must use a flying enemy definition.');
      }
      if (
        !Number.isSafeInteger(endless.bossMaxHpMilli) ||
        endless.bossMaxHpMilli < (bundle.enemies[endless.bossEnemyId]?.maxHpMilli ?? 0) ||
        endless.bossMaxHpMilli > MAX_ENEMY_HP_MILLI
      ) {
        throw new Error('Endless boss HP cap is invalid.');
      }
    } else if (bundle.endless !== undefined) {
      throw new Error('Fixed battle content cannot include endless rules.');
    }
    for (const [waveIndex, wave] of bundle.waves.entries()) {
      if (
        wave.index !== waveIndex + 1 ||
        wave.groups.length === 0 ||
        wave.groups.length > FIXED_WAVE_GROUP_ID_CAPACITY
      ) {
        throw new Error(`Wave ${wave.id} has an invalid index or no spawn groups.`);
      }
      if (
        wave.speedMultiplierBp !== undefined &&
        (!Number.isInteger(wave.speedMultiplierBp) || wave.speedMultiplierBp <= 0)
      ) {
        throw new Error(`Wave ${wave.id} has an invalid speed multiplier.`);
      }
      for (const group of wave.groups) {
        if (bundle.enemies[group.enemyId] === undefined) {
          throw new Error(`Wave ${wave.id} references unknown enemy ${group.enemyId}.`);
        }
        if (
          !Number.isInteger(group.count) ||
          group.count <= 0 ||
          group.count > FIXED_GROUP_UNIT_ID_CAPACITY ||
          !Number.isInteger(group.intervalTicks) ||
          group.intervalTicks <= 0
        ) {
          throw new Error(`Wave ${wave.id} contains an invalid spawn group.`);
        }
      }
    }
    for (const definition of Object.values(bundle.enemies)) {
      if (
        definition.breachDamage !== undefined &&
        (!Number.isSafeInteger(definition.breachDamage) ||
          definition.breachDamage <= 0 ||
          definition.breachDamage > 10_000)
      ) {
        throw new Error(`Enemy ${definition.id} has invalid breach damage.`);
      }
      const hasEnrageThreshold = definition.enrageBelowHpBp !== undefined;
      const hasEnrageSpeed = definition.enrageSpeedMultiplierBp !== undefined;
      if (hasEnrageThreshold !== hasEnrageSpeed) {
        throw new Error(`Enemy ${definition.id} must define both enrage fields.`);
      }
      if (
        hasEnrageThreshold &&
        (!Number.isInteger(definition.enrageBelowHpBp) ||
          definition.enrageBelowHpBp! <= 0 ||
          definition.enrageBelowHpBp! >= 10_000 ||
          !Number.isInteger(definition.enrageSpeedMultiplierBp) ||
          definition.enrageSpeedMultiplierBp! <= 10_000)
      ) {
        throw new Error(`Enemy ${definition.id} has an invalid enrage phase.`);
      }
      const hasGuardAuraArmor = definition.guardAuraArmorBp !== undefined;
      const hasGuardAuraRadius = definition.guardAuraRadiusPx !== undefined;
      if (hasGuardAuraArmor !== hasGuardAuraRadius) {
        throw new Error(`Enemy ${definition.id} must define both guard aura fields.`);
      }
      if (
        hasGuardAuraArmor &&
        (!Number.isInteger(definition.guardAuraArmorBp) ||
          definition.guardAuraArmorBp! <= 0 ||
          definition.guardAuraArmorBp! > 5_000 ||
          !Number.isInteger(definition.guardAuraRadiusPx) ||
          definition.guardAuraRadiusPx! < 60 ||
          definition.guardAuraRadiusPx! > 600)
      ) {
        throw new Error(`Enemy ${definition.id} has an invalid guard aura.`);
      }
      const hasPhaseShellThreshold = definition.phaseShellAboveHpBp !== undefined;
      const hasPhaseShellCap = definition.phaseShellMaxHitDamageBp !== undefined;
      if (hasPhaseShellThreshold !== hasPhaseShellCap) {
        throw new Error(`Enemy ${definition.id} must define both phase shell fields.`);
      }
      if (
        hasPhaseShellThreshold &&
        (!Number.isInteger(definition.phaseShellAboveHpBp) ||
          definition.phaseShellAboveHpBp! <= 0 ||
          definition.phaseShellAboveHpBp! >= 10_000 ||
          !Number.isInteger(definition.phaseShellMaxHitDamageBp) ||
          definition.phaseShellMaxHitDamageBp! <= 0 ||
          definition.phaseShellMaxHitDamageBp! > 5_000)
      ) {
        throw new Error(`Enemy ${definition.id} has an invalid phase shell.`);
      }
      const etherealFields = [
        definition.etherealCycleTicks,
        definition.etherealSolidTicks,
        definition.etherealDamageTakenBp,
      ];
      const definedEtherealFields = etherealFields.filter((value) => value !== undefined).length;
      if (definedEtherealFields !== 0 && definedEtherealFields !== etherealFields.length) {
        throw new Error(`Enemy ${definition.id} must define all ethereal phase fields.`);
      }
      if (
        definedEtherealFields === etherealFields.length &&
        (!Number.isInteger(definition.etherealCycleTicks) ||
          definition.etherealCycleTicks! < 30 ||
          definition.etherealCycleTicks! > 900 ||
          !Number.isInteger(definition.etherealSolidTicks) ||
          definition.etherealSolidTicks! <= 0 ||
          definition.etherealSolidTicks! >= definition.etherealCycleTicks! ||
          !Number.isInteger(definition.etherealDamageTakenBp) ||
          definition.etherealDamageTakenBp! < 500 ||
          definition.etherealDamageTakenBp! > 9_000)
      ) {
        throw new Error(`Enemy ${definition.id} has an invalid ethereal phase.`);
      }
    }
  }

  private createInitialState(seed: number): SerializableState {
    const normalizedSeed = seed >>> 0 || 0x6d2b79f5;
    return {
      tick: 0,
      speed: 1,
      flowState: 'running',
      outcome: null,
      aimAnglesU16: [
        DEFAULT_AIM_ANGLE_U16,
        DEFAULT_AIM_ANGLE_U16,
        DEFAULT_AIM_ANGLE_U16,
      ],
      towerCooldowns: battleMode(this.bundle) === 'fixed'
        ? [
            0,
            Math.ceil(this.bundle.tower.attackIntervalTicks / 3),
            Math.ceil((this.bundle.tower.attackIntervalTicks * 2) / 3),
          ]
        : [0, 0, 0],
      enemies: [],
      projectiles: [],
      scheduler: {
        waveIndex: 0,
        groupIndex: 0,
        unitIndex: 0,
        nextSpawnTick: 0,
        allGroupsSpawned: false,
        completedWaves: 0,
        currentWaveSpawned: 0,
        currentWaveKilled: 0,
        victoryPending: false,
      },
      endless: battleMode(this.bundle) === 'endless'
        ? {
            phase: 'survival',
            settlementReason: null,
            routeId: this.bundle.route.id,
            reachedBoss: false,
            survivalTick: 0,
            bossLayer: 0,
            bossDamageMilli: 0,
            scoreReachedTick: 0,
            threatPackOrdinal: 0,
            bossSummonOrdinal: 0,
            pendingPacks: [],
            bossEntityId: null,
          }
        : null,
      level: 0,
      exp: 0,
      stats: {
        damageBonusBp: 0,
        frequencyBonusBp: 0,
        arrowCountAdd: 0,
        penetrationAdd: 0,
        critChanceAddBp: 0,
        critDamageAddBp: 0,
      },
      activeOffer: null,
      revivesUsed: 0,
      reviveGuardRemainingTicks: 0,
      gateIntegrity: gateIntegrityMax(this.bundle),
      overdriveCharge: 0,
      overdriveTowerId: null,
      overdriveRemainingTicks: 0,
      damageDealtMilli: 0,
      rngState: normalizedSeed,
      initialSeed: normalizedSeed,
      lastCommandSeq: 0,
      lastAuthoritySeq: 0,
      nextEnemyId: 1_048_576,
      nextProjectileId: PROJECTILE_ENTITY_ID_BASE,
      eventSeq: 0,
      wallTickRemainder: 0,
    };
  }

  private restoreCheckpoint(seed: number, checkpoint: Uint8Array): SerializableState {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(checkpoint));
    } catch {
      throw new Error('Checkpoint is not valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Checkpoint envelope is malformed.');
    }
    const schemaVersion = (parsed as { schemaVersion?: unknown }).schemaVersion;
    if (
      schemaVersion !== CHECKPOINT_SCHEMA_VERSION &&
      schemaVersion !== LEGACY_GATELESS_CHECKPOINT_SCHEMA_VERSION &&
      schemaVersion !== LEGACY_INDEPENDENT_AIM_CHECKPOINT_SCHEMA_VERSION &&
      schemaVersion !== LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION
    ) {
      throw new Error(`Unsupported checkpoint schema ${String(schemaVersion)}.`);
    }
    const envelope = parsed as
      | CheckpointEnvelope
      | LegacyGatelessCheckpointEnvelope
      | LegacyIndependentAimCheckpointEnvelope
      | LegacySharedAimCheckpointEnvelope;
    if (envelope.releaseId !== this.bundle.releaseId || envelope.configHash !== this.bundle.configHash) {
      throw new Error('Checkpoint release does not match the supplied battle bundle.');
    }
    const normalizedSeed = seed >>> 0 || 0x6d2b79f5;
    if (envelope.state.initialSeed !== normalizedSeed) {
      throw new Error('Checkpoint seed does not match the supplied run seed.');
    }
    if (!Number.isInteger(envelope.state.tick) || !Array.isArray(envelope.state.enemies)) {
      throw new Error('Checkpoint state is malformed.');
    }
    if (
      envelope.schemaVersion < LEGACY_GATELESS_CHECKPOINT_SCHEMA_VERSION &&
      battleMode(this.bundle) !== 'fixed'
    ) {
      throw new Error('Legacy checkpoint schemas are only valid for fixed battle stages.');
    }
    if (envelope.schemaVersion === LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION) {
      if (!Number.isInteger(envelope.state.aimAngleU16)) {
        throw new Error('Legacy checkpoint aim angle is malformed.');
      }
      const { aimAngleU16, ...legacyState } = envelope.state;
      const normalizedAngle = aimAngleU16 & 0xffff;
      return this.migrateLegacyState({
        ...legacyState,
        aimAnglesU16: [normalizedAngle, normalizedAngle, normalizedAngle],
      });
    }
    if (
      !Array.isArray(envelope.state.aimAnglesU16) ||
      envelope.state.aimAnglesU16.length !== this.bundle.route.towerAnchors.length ||
      envelope.state.aimAnglesU16.some((angle) => !Number.isInteger(angle))
    ) {
      throw new Error('Checkpoint tower aim angles are malformed.');
    }
    if (envelope.schemaVersion === LEGACY_INDEPENDENT_AIM_CHECKPOINT_SCHEMA_VERSION) {
      return this.migrateLegacyState(envelope.state);
    }
    if (envelope.schemaVersion === LEGACY_GATELESS_CHECKPOINT_SCHEMA_VERSION) {
      return this.migrateGatelessState(envelope.state);
    }
    if (
      (battleMode(this.bundle) === 'endless' && envelope.state.endless === null) ||
      (battleMode(this.bundle) === 'fixed' && envelope.state.endless !== null)
    ) {
      throw new Error('Checkpoint battle mode does not match the supplied battle bundle.');
    }
    const restored = JSON.parse(JSON.stringify(envelope.state)) as SerializableState;
    this.validateCheckpointState(restored);
    return restored;
  }

  private migrateLegacyState(state: LegacySerializableStateV3): SerializableState {
    const cloned = JSON.parse(JSON.stringify(state)) as LegacySerializableStateV3;
    const maximumEnemyId = cloned.enemies.reduce(
      (maximum, enemy) => Math.max(maximum, enemy.entityId),
      0,
    );
    const migrated: LegacySerializableStateV4 = {
      ...cloned,
      enemies: cloned.enemies.map((enemy) => {
        const encodedWaveIndex = (enemy.entityId >>> 20) - 1;
        return {
          ...enemy,
          speedMultiplierBp: enemy.speedMultiplierBp ??
            this.bundle.waves[encodedWaveIndex]?.speedMultiplierBp ??
            10_000,
        };
      }),
      outcome: cloned.flowState === 'result'
        ? 'victory'
        : cloned.flowState === 'defeat-pending'
          ? 'defeat'
          : null,
      endless: null,
      nextEnemyId: maximumEnemyId + 1,
    };
    return this.migrateGatelessState(migrated);
  }

  private migrateGatelessState(state: LegacySerializableStateV4): SerializableState {
    const cloned = JSON.parse(JSON.stringify(state)) as LegacySerializableStateV4;
    const migrated: SerializableState = {
      ...cloned,
      projectiles: cloned.projectiles.map((projectile) => ({
        ...projectile,
        focused: (projectile as LegacyProjectileStateV4 & { focused?: unknown }).focused === true,
      })),
      gateIntegrity:
        cloned.flowState === 'defeat-pending' || cloned.outcome === 'defeat'
          ? 0
          : gateIntegrityMax(this.bundle),
      overdriveCharge: 0,
      overdriveTowerId: null,
      overdriveRemainingTicks: 0,
    };
    this.validateCheckpointState(migrated);
    return migrated;
  }

  private validateCheckpointState(state: SerializableState): void {
    const validFlowStates: readonly BattleFlowState[] = [
      'running',
      'paused',
      'offer-pending',
      'defeat-pending',
      'result',
    ];
    const scheduler = state.scheduler;
    const stats = state.stats;
    const maximumGateIntegrity = gateIntegrityMax(this.bundle);
    const overdriveDuration = overdriveDurationTicks(this.bundle);
    const maximumBattleTick = this.maximumBattleTick();
    const tickIsWithinBattleLifetime = Number.isSafeInteger(state.tick) &&
      state.tick >= 0 &&
      state.tick <= maximumBattleTick;
    const remainingBattleTicks = tickIsWithinBattleLifetime && state.flowState !== 'result'
      ? maximumBattleTick - state.tick
      : tickIsWithinBattleLifetime
        ? 0
        : Number.MAX_SAFE_INTEGER;
    const eventSequenceReserve =
      Array.isArray(state.enemies) &&
      Array.isArray(state.projectiles) &&
      Number.isSafeInteger(state.level) &&
      Number.isSafeInteger(state.revivesUsed) &&
      tickIsWithinBattleLifetime
        ? this.requiredLifetimeEventSequenceReserve(state, remainingBattleTicks)
        : Number.MAX_SAFE_INTEGER;
    const projectileSequenceReserve = tickIsWithinBattleLifetime
      ? remainingBattleTicks * PROJECTILE_ID_SEQUENCE_RESERVE
      : Number.MAX_SAFE_INTEGER;
    if (
      !Array.isArray(state.enemies) ||
      !Array.isArray(state.projectiles) ||
      !Array.isArray(state.towerCooldowns) ||
      state.towerCooldowns.length !== this.bundle.route.towerAnchors.length ||
      state.towerCooldowns.some(
        (cooldown) =>
          !Number.isSafeInteger(cooldown) ||
          cooldown < 0 ||
          cooldown > Math.max(MIN_ATTACK_INTERVAL_TICKS, this.bundle.tower.attackIntervalTicks),
      ) ||
      !Number.isSafeInteger(state.tick) ||
      state.tick < 0 ||
      state.tick > maximumBattleTick ||
      !validFlowStates.includes(state.flowState) ||
      (state.speed !== 1 && state.speed !== 2) ||
      !Array.isArray(state.aimAnglesU16) ||
      state.aimAnglesU16.length !== this.bundle.route.towerAnchors.length ||
      state.aimAnglesU16.some(
        (angle) => !Number.isSafeInteger(angle) || angle < 0 || angle >= U16_TURN,
      ) ||
      !(['victory', 'defeat', 'settled', null] as const).includes(state.outcome) ||
      typeof scheduler !== 'object' ||
      scheduler === null ||
      !Number.isSafeInteger(scheduler.waveIndex) ||
      scheduler.waveIndex < 0 ||
      !Number.isSafeInteger(scheduler.groupIndex) ||
      scheduler.groupIndex < 0 ||
      !Number.isSafeInteger(scheduler.unitIndex) ||
      scheduler.unitIndex < 0 ||
      !Number.isSafeInteger(scheduler.nextSpawnTick) ||
      scheduler.nextSpawnTick < 0 ||
      scheduler.nextSpawnTick > maximumBattleTick ||
      typeof scheduler.allGroupsSpawned !== 'boolean' ||
      !Number.isSafeInteger(scheduler.completedWaves) ||
      scheduler.completedWaves < 0 ||
      !Number.isSafeInteger(scheduler.currentWaveSpawned) ||
      scheduler.currentWaveSpawned < 0 ||
      !Number.isSafeInteger(scheduler.currentWaveKilled) ||
      scheduler.currentWaveKilled < 0 ||
      typeof scheduler.victoryPending !== 'boolean' ||
      !Number.isSafeInteger(state.level) ||
      state.level < 0 ||
      state.level > this.bundle.rules.maxLevel ||
      !Number.isSafeInteger(state.exp) ||
      state.exp < 0 ||
      typeof stats !== 'object' ||
      stats === null ||
      !Number.isSafeInteger(stats.damageBonusBp) ||
      stats.damageBonusBp < 0 ||
      stats.damageBonusBp > MAX_DAMAGE_BONUS_BP ||
      !Number.isSafeInteger(stats.frequencyBonusBp) ||
      stats.frequencyBonusBp < 0 ||
      stats.frequencyBonusBp > MAX_FREQUENCY_BONUS_BP ||
      !Number.isSafeInteger(stats.arrowCountAdd) ||
      stats.arrowCountAdd < 0 ||
      stats.arrowCountAdd > MAX_ARROW_COUNT_ADD ||
      !Number.isSafeInteger(stats.penetrationAdd) ||
      stats.penetrationAdd < 0 ||
      stats.penetrationAdd > MAX_PENETRATION_ADD ||
      !Number.isSafeInteger(stats.critChanceAddBp) ||
      stats.critChanceAddBp < 0 ||
      stats.critChanceAddBp > MAX_CRIT_CHANCE_ADD_BP ||
      !Number.isSafeInteger(stats.critDamageAddBp) ||
      stats.critDamageAddBp < 0 ||
      stats.critDamageAddBp > MAX_CRIT_DAMAGE_ADD_BP ||
      !Number.isSafeInteger(state.revivesUsed) ||
      state.revivesUsed < 0 ||
      state.revivesUsed > this.bundle.rules.maxRevives ||
      !Number.isSafeInteger(state.reviveGuardRemainingTicks) ||
      state.reviveGuardRemainingTicks < 0 ||
      state.reviveGuardRemainingTicks > this.bundle.rules.reviveGuardTicks ||
      !Number.isSafeInteger(state.gateIntegrity) ||
      state.gateIntegrity < 0 ||
      state.gateIntegrity > maximumGateIntegrity ||
      !Number.isSafeInteger(state.overdriveCharge) ||
      state.overdriveCharge < 0 ||
      state.overdriveCharge > OVERDRIVE_MAX_CHARGE ||
      (state.overdriveTowerId !== null && (
        !Number.isSafeInteger(state.overdriveTowerId) ||
        state.overdriveTowerId < 0 ||
        state.overdriveTowerId >= this.bundle.route.towerAnchors.length
      )) ||
      !Number.isSafeInteger(state.overdriveRemainingTicks) ||
      state.overdriveRemainingTicks < 0 ||
      state.overdriveRemainingTicks > overdriveDuration ||
      (state.overdriveTowerId === null) !== (state.overdriveRemainingTicks === 0) ||
      (state.overdriveTowerId !== null && state.overdriveCharge !== 0) ||
      (battleMode(this.bundle) === 'endless' && (
        state.gateIntegrity < 0 ||
        state.gateIntegrity > 1 ||
        state.overdriveCharge !== 0 ||
        state.overdriveTowerId !== null ||
        state.overdriveRemainingTicks !== 0
      )) ||
      !Number.isSafeInteger(state.damageDealtMilli) ||
      state.damageDealtMilli < 0 ||
      !Number.isSafeInteger(state.rngState) ||
      state.rngState < 0 ||
      state.rngState >= UINT32_MAX_PLUS_ONE ||
      !Number.isSafeInteger(state.initialSeed) ||
      state.initialSeed <= 0 ||
      state.initialSeed >= UINT32_MAX_PLUS_ONE ||
      !Number.isSafeInteger(state.lastCommandSeq) ||
      state.lastCommandSeq < 0 ||
      state.lastCommandSeq > Number.MAX_SAFE_INTEGER - COMMAND_SEQUENCE_RESERVE ||
      !Number.isSafeInteger(state.lastAuthoritySeq) ||
      state.lastAuthoritySeq < 0 ||
      state.lastAuthoritySeq > Number.MAX_SAFE_INTEGER - AUTHORITY_SEQUENCE_RESERVE ||
      !Number.isSafeInteger(state.nextEnemyId) ||
      state.nextEnemyId < 0 ||
      state.nextEnemyId >= PROJECTILE_ENTITY_ID_BASE ||
      !Number.isSafeInteger(state.nextProjectileId) ||
      state.nextEnemyId >= state.nextProjectileId ||
      state.nextProjectileId < PROJECTILE_ENTITY_ID_BASE ||
      !Number.isSafeInteger(projectileSequenceReserve) ||
      projectileSequenceReserve < 0 ||
      state.nextProjectileId > MAX_RENDER_ENTITY_ID - projectileSequenceReserve ||
      !Number.isSafeInteger(state.eventSeq) ||
      state.eventSeq < 0 ||
      !Number.isSafeInteger(eventSequenceReserve) ||
      eventSequenceReserve < 0 ||
      state.eventSeq > Number.MAX_SAFE_INTEGER - eventSequenceReserve ||
      !Number.isSafeInteger(state.wallTickRemainder) ||
      state.wallTickRemainder < 0 ||
      state.wallTickRemainder >= 1_000_000
    ) {
      throw new Error('Checkpoint state collections or entity sequences are malformed.');
    }
    const hasActiveOffer = state.activeOffer !== null;
    if ((state.flowState === 'offer-pending') !== hasActiveOffer) {
      throw new Error('Checkpoint offer flow and active offer are inconsistent.');
    }
    if (state.activeOffer !== null) {
      const offer = state.activeOffer;
      if (typeof offer !== 'object' || offer === null) {
        throw new Error('Checkpoint active offer is malformed.');
      }
      const practiceOrdinalMatch = /^practice-offer-(\d+)-\d+$/.exec(offer.offerId);
      if (
        offer.type !== 'OFFER_GRANTED' ||
        !Number.isSafeInteger(offer.authoritySeq) ||
        offer.authoritySeq <= 0 ||
        offer.authoritySeq > state.lastAuthoritySeq ||
        typeof offer.authorizationId !== 'string' ||
        offer.authorizationId.length === 0 ||
        typeof offer.offerId !== 'string' ||
        offer.offerId.length === 0 ||
        (offer.replacesOfferId !== undefined && (
          typeof offer.replacesOfferId !== 'string' || offer.replacesOfferId.length === 0
        )) ||
        !Array.isArray(offer.cards) ||
        offer.cards.length !== 3 ||
        new Set(offer.cards).size !== 3 ||
        offer.cards.some(
          (cardId) => typeof cardId !== 'string' || this.cardDefinition(cardId) === undefined,
        ) ||
        (practiceOrdinalMatch !== null && Number(practiceOrdinalMatch[1]) !== state.level)
      ) {
        throw new Error('Checkpoint active offer is malformed.');
      }
    }
    const maximumEnemyExpAward = this.maximumEnemyExpAward();
    const maximumRunExperienceAward = this.maximumRunExperienceAward();
    const experienceIsInvalid = state.flowState === 'offer-pending'
      ? state.level <= 0 ||
        maximumEnemyExpAward <= 0 ||
        state.exp > maximumRunExperienceAward
      : state.level >= this.bundle.rules.maxLevel
        ? state.exp !== 0
        : state.exp >= requiredExp(state.level, this.bundle.rules.maxLevel) ||
          state.exp > maximumRunExperienceAward;
    if (experienceIsInvalid) {
      throw new Error('Checkpoint level and experience are inconsistent.');
    }
    if (
      state.enemies.some(
        (enemy) =>
          typeof enemy !== 'object' ||
          enemy === null ||
          !Number.isSafeInteger(enemy.entityId) ||
          enemy.entityId < 0 ||
          enemy.entityId >= PROJECTILE_ENTITY_ID_BASE ||
          this.bundle.enemies[enemy.definitionId] === undefined ||
          !Number.isSafeInteger(enemy.hpMilli) ||
          !Number.isSafeInteger(enemy.maxHpMilli) ||
          enemy.hpMilli < 0 ||
          enemy.maxHpMilli <= 0 ||
          enemy.maxHpMilli > MAX_ENEMY_HP_MILLI ||
          enemy.hpMilli > enemy.maxHpMilli ||
          !Number.isSafeInteger(enemy.distanceMilli) ||
          enemy.distanceMilli < 0 ||
          enemy.distanceMilli > this.route.totalLengthMilli ||
          !Number.isSafeInteger(enemy.movementRemainder) ||
          enemy.movementRemainder < 0 ||
          enemy.movementRemainder >= TICKS_PER_SECOND ||
          !Number.isSafeInteger(enemy.ageTicks) ||
          enemy.ageTicks < 0 ||
          enemy.ageTicks > state.tick ||
          !Number.isSafeInteger(enemy.expAward) ||
          enemy.expAward < 0 ||
          !Number.isSafeInteger(enemy.speedMultiplierBp) ||
          enemy.speedMultiplierBp! <= 0 ||
          (enemy.invulnerableUntilTick !== undefined && (
            !Number.isSafeInteger(enemy.invulnerableUntilTick) ||
            enemy.invulnerableUntilTick < 0
          )),
      ) ||
      state.projectiles.some(
        (projectile) =>
          typeof projectile !== 'object' ||
          projectile === null ||
          !Number.isSafeInteger(projectile.entityId) ||
          projectile.entityId < PROJECTILE_ENTITY_ID_BASE ||
          projectile.entityId > MAX_RENDER_ENTITY_ID ||
          !Number.isSafeInteger(projectile.towerId) ||
          projectile.towerId < 0 ||
          projectile.towerId >= this.bundle.route.towerAnchors.length ||
          !Number.isSafeInteger(projectile.targetEntityId) ||
          !state.enemies.some(
            (enemy) => enemy.entityId === projectile.targetEntityId && enemy.hpMilli > 0,
          ) ||
          !Number.isSafeInteger(projectile.bornTick) ||
          projectile.bornTick < 0 ||
          projectile.bornTick > state.tick ||
          !Number.isSafeInteger(projectile.xMilli) ||
          !Number.isSafeInteger(projectile.yMilli) ||
          !Number.isSafeInteger(projectile.movementRemainder) ||
          projectile.movementRemainder < 0 ||
          projectile.movementRemainder >= TICKS_PER_SECOND ||
          !Number.isSafeInteger(projectile.damageMilli) ||
          projectile.damageMilli <= 0 ||
          typeof projectile.critical !== 'boolean' ||
          typeof projectile.focused !== 'boolean' ||
          !Number.isSafeInteger(projectile.penetration) ||
          projectile.penetration < 0 ||
          projectile.penetration > MAX_PENETRATION_COUNT,
      )
    ) {
      throw new Error('Checkpoint contains malformed render entities.');
    }
    const renderEntityIds = [
      ...state.enemies.map((enemy) => enemy.entityId),
      ...state.projectiles.map((projectile) => projectile.entityId),
    ];
    if (
      renderEntityIds.some(
        (entityId) =>
          !Number.isSafeInteger(entityId) || entityId < 0 || entityId > MAX_RENDER_ENTITY_ID,
      ) ||
      new Set(renderEntityIds).size !== renderEntityIds.length
    ) {
      throw new Error('Checkpoint contains colliding or invalid render entity ids.');
    }
    const maximumRenderEntityId = renderEntityIds.reduce(
      (maximum, entityId) => Math.max(maximum, entityId),
      0,
    );
    if (state.nextProjectileId <= maximumRenderEntityId) {
      throw new Error('Checkpoint projectile sequence is not monotonic.');
    }
    if (state.damageDealtMilli > MAX_DAMAGE_COUNTER_MILLI) {
      throw new Error('Checkpoint damage counter has insufficient overflow reserve.');
    }
    if (battleMode(this.bundle) === 'fixed') {
      if (state.endless !== null) {
        throw new Error('Checkpoint battle mode does not match the supplied battle bundle.');
      }
      if (state.enemies.some((enemy) => enemy.invulnerableUntilTick !== undefined)) {
        throw new Error('Fixed checkpoint enemies cannot be invulnerable.');
      }
      const expectedOutcome = state.flowState === 'result'
        ? state.outcome === 'defeat'
          ? 'defeat'
          : 'victory'
        : state.flowState === 'defeat-pending'
          ? 'defeat'
          : null;
      if (state.outcome !== expectedOutcome) {
        throw new Error('Checkpoint fixed battle flow and outcome are inconsistent.');
      }
      if (
        ((state.flowState === 'defeat-pending' || state.outcome === 'defeat') &&
          state.gateIntegrity !== 0) ||
        (state.flowState !== 'defeat-pending' && state.outcome !== 'defeat' &&
          state.gateIntegrity <= 0)
      ) {
        throw new Error('Checkpoint fixed battle gate integrity is inconsistent with battle flow.');
      }
      this.validateFixedSchedulerState(state);
      return;
    }
    if (state.enemies.some(
      (enemy) =>
        !this.isValidEndlessEnemyMovement(enemy) ||
        !this.isValidEndlessEnemyExpAward(enemy),
    )) {
      throw new Error('Checkpoint contains an endless enemy with unsafe derived values.');
    }
    const endless = state.endless;
    const rules = this.requireEndlessRules();
    if (
      typeof endless !== 'object' ||
      endless === null ||
      endless.routeId !== this.bundle.route.id ||
      state.tick > rules.settlementTick ||
      !(['survival', 'boss', 'settled'] as const).includes(endless.phase) ||
      typeof endless.reachedBoss !== 'boolean' ||
      !Number.isSafeInteger(endless.bossLayer) ||
      endless.bossLayer < 0 ||
      (endless.bossEntityId !== null && !Number.isSafeInteger(endless.bossEntityId)) ||
      !Number.isSafeInteger(endless.bossDamageMilli) ||
      endless.bossDamageMilli < 0 ||
      endless.bossDamageMilli > MAX_DAMAGE_COUNTER_MILLI ||
      !Number.isSafeInteger(endless.survivalTick) ||
      endless.survivalTick < 0 ||
      endless.survivalTick > rules.bossPhaseTick ||
      !Number.isSafeInteger(endless.scoreReachedTick) ||
      endless.scoreReachedTick < 0 ||
      endless.scoreReachedTick > state.tick ||
      !Number.isSafeInteger(endless.threatPackOrdinal) ||
      endless.threatPackOrdinal < 0 ||
      endless.threatPackOrdinal >
        Math.ceil((rules.bossPhaseTick - rules.threatStartTick) / rules.threatPackIntervalTicks) ||
      !Number.isSafeInteger(endless.bossSummonOrdinal) ||
      endless.bossSummonOrdinal < 0 ||
      endless.bossSummonOrdinal >
        Math.floor((rules.settlementTick - rules.bossPhaseTick - 1) / rules.bossSummonIntervalTicks) ||
      (endless.phase === 'settled') !== (endless.settlementReason !== null) ||
      (endless.settlementReason !== null &&
        !(['time-limit', 'breach', 'manual'] as const).includes(endless.settlementReason)) ||
      !Array.isArray(endless.pendingPacks)
    ) {
      throw new Error('Endless checkpoint state is malformed.');
    }
    const activeEndlessFlowStates: readonly BattleFlowState[] = [
      'running',
      'paused',
      'offer-pending',
      'defeat-pending',
    ];
    const phaseStateIsInvalid =
      (endless.phase === 'survival' && (
        endless.reachedBoss ||
        endless.bossLayer !== 0 ||
        endless.bossEntityId !== null ||
        endless.bossDamageMilli !== 0 ||
        endless.bossSummonOrdinal !== 0 ||
        endless.survivalTick !== Math.min(state.tick, rules.bossPhaseTick) ||
        endless.scoreReachedTick !== endless.survivalTick ||
        state.tick > rules.bossPhaseTick ||
        !activeEndlessFlowStates.includes(state.flowState) ||
        state.outcome !== (state.flowState === 'defeat-pending' ? 'defeat' : null)
      )) ||
      (endless.phase === 'boss' && (
        !endless.reachedBoss ||
        endless.bossLayer < 1 ||
        endless.bossLayer > this.maximumEndlessBossLayerAtTick(state.tick) ||
        endless.bossEntityId === null ||
        endless.survivalTick !== rules.bossPhaseTick ||
        endless.scoreReachedTick < rules.bossPhaseTick ||
        state.tick < rules.bossPhaseTick ||
        state.tick >= rules.settlementTick ||
        !activeEndlessFlowStates.includes(state.flowState) ||
        state.outcome !== (state.flowState === 'defeat-pending' ? 'defeat' : null)
      )) ||
      (endless.phase === 'settled' && (
        state.flowState !== 'result' ||
        state.outcome !== (endless.settlementReason === 'breach' ? 'defeat' : 'settled') ||
        (endless.reachedBoss
          ? endless.bossLayer < 1 ||
            endless.bossLayer > this.maximumEndlessBossLayerAtTick(state.tick) ||
            endless.bossEntityId === null ||
            endless.survivalTick !== rules.bossPhaseTick
          : endless.bossLayer !== 0 ||
            endless.bossEntityId !== null ||
            endless.survivalTick > rules.bossPhaseTick) ||
        (endless.settlementReason === 'time-limit' && (
          state.tick !== rules.settlementTick ||
          !endless.reachedBoss
        ))
      ));
    if (phaseStateIsInvalid) {
      throw new Error('Endless checkpoint phase and score fields are inconsistent.');
    }
    if (
      state.flowState === 'defeat-pending' &&
      (
        state.revivesUsed >= this.bundle.rules.maxRevives ||
        state.reviveGuardRemainingTicks !== 0 ||
        !state.enemies.some(
          (enemy) =>
            enemy.hpMilli > 0 && enemy.distanceMilli >= this.route.totalLengthMilli,
        )
      )
    ) {
      throw new Error('Endless checkpoint has no valid pending revive.');
    }
    const bossEnemy = endless.bossEntityId === null
      ? undefined
      : state.enemies.find((enemy) => enemy.entityId === endless.bossEntityId);
    if (
      endless.reachedBoss &&
      (bossEnemy === undefined || bossEnemy.definitionId !== rules.bossEnemyId)
    ) {
      throw new Error('Endless checkpoint boss entity is missing or invalid.');
    }
    if (state.enemies.some((enemy) => {
      if (enemy.entityId !== endless.bossEntityId) {
        return enemy.invulnerableUntilTick !== undefined;
      }
      if (endless.bossLayer === 1) {
        return enemy.invulnerableUntilTick !== undefined;
      }
      return enemy.invulnerableUntilTick === undefined ||
        enemy.invulnerableUntilTick < rules.bossPhaseTick + rules.bossLayerGuardTicks ||
        enemy.invulnerableUntilTick > state.tick + rules.bossLayerGuardTicks;
    })) {
      throw new Error('Endless checkpoint enemy invulnerability is inconsistent.');
    }
    const maximumEnemyId = state.enemies.reduce(
      (maximum, enemy) => Math.max(maximum, enemy.entityId),
      0,
    );
    const remainingEnemyIdReserve = state.flowState === 'result'
      ? 0
      : (rules.settlementTick - state.tick) * ENDLESS_ENEMY_ID_SEQUENCE_RESERVE;
    if (
      state.nextEnemyId <= maximumEnemyId ||
      !Number.isSafeInteger(remainingEnemyIdReserve) ||
      remainingEnemyIdReserve < 0 ||
      state.nextEnemyId > PROJECTILE_ENTITY_ID_BASE - remainingEnemyIdReserve
    ) {
      throw new Error('Checkpoint endless enemy sequence is not monotonic.');
    }
    if (state.enemies.filter((enemy) => enemy.hpMilli > 0).length > rules.maxActiveEnemies) {
      throw new Error('Checkpoint exceeds the endless active-enemy cap.');
    }
    const pendingEnemyIds = new Set([
      ...rules.threatEntries.map((entry) => entry.enemyId),
      ...rules.miniBossEnemyIds,
      rules.bossSummonEnemyId,
    ]);
    const pendingOrdinals = new Set<number>();
    if (endless.pendingPacks.some((pack) => {
      if (
        typeof pack !== 'object' ||
        pack === null ||
        !Array.isArray(pack.units) ||
        pack.units.length > rules.maxPackSize ||
        !Number.isSafeInteger(pack.ordinal) ||
        pack.ordinal < 0 ||
        pendingOrdinals.has(pack.ordinal) ||
        !Number.isSafeInteger(pack.scheduledTick) ||
        pack.scheduledTick < rules.threatStartTick ||
        pack.scheduledTick >= rules.settlementTick ||
        !Number.isSafeInteger(pack.nextSpawnTick) ||
        pack.nextSpawnTick < pack.scheduledTick ||
        pack.nextSpawnTick >= rules.settlementTick ||
        !Number.isInteger(pack.nextUnitIndex) ||
        pack.nextUnitIndex < 0 ||
        pack.nextUnitIndex > pack.units.length
      ) return true;
      pendingOrdinals.add(pack.ordinal);
      return pack.units.some(
        (unit) =>
          typeof unit !== 'object' ||
          unit === null ||
          !pendingEnemyIds.has(unit.enemyId) ||
          !this.isValidEndlessSpawnSpec(unit),
      );
    })) {
      throw new Error('Checkpoint contains an invalid endless threat queue.');
    }
  }

  private validateFixedSchedulerState(state: SerializableState): void {
    const scheduler = state.scheduler;
    const waveCount = this.bundle.waves.length;
    const wave = this.bundle.waves[scheduler.waveIndex];
    if (wave === undefined) {
      throw new Error('Checkpoint fixed scheduler references a missing wave.');
    }

    const totalWaveUnits = wave.groups.reduce((sum, group) => sum + group.count, 0);
    const maximumWaveStartTick = this.maximumFixedWaveStartTick(scheduler.waveIndex);
    const maximumWaveSpawnTick = maximumWaveStartTick + this.fixedWaveSpawnSpanTicks(wave);
    const maximumWaveTerminalTick = maximumWaveSpawnTick +
      this.maximumFixedWaveLifetimeTicks(wave);
    const maximumCursorSpawnTick = maximumWaveStartTick + (
      scheduler.allGroupsSpawned
        ? this.fixedWaveSpawnSpanTicks(wave)
        : this.fixedWaveSpawnOffsetTicks(
            wave,
            scheduler.groupIndex,
            scheduler.unitIndex,
          )
    );
    const cursorIsValid = scheduler.allGroupsSpawned
      ? scheduler.groupIndex === wave.groups.length && scheduler.unitIndex === 0
      : scheduler.groupIndex < wave.groups.length &&
        scheduler.unitIndex < (wave.groups[scheduler.groupIndex]?.count ?? 0);
    const currentGroup = wave.groups[scheduler.groupIndex];
    const maximumPendingSpawnDelay = scheduler.groupIndex === 0 && scheduler.unitIndex === 0
      ? scheduler.waveIndex === 0
        ? 0
        : Math.max(0, this.bundle.rules.waveGapTicks - 1)
      : scheduler.unitIndex === 0
        ? Math.max(0, this.bundle.rules.groupGapTicks - 1)
        : Math.max(0, (currentGroup?.intervalTicks ?? 0) - 1);
    const spawnTimingIsValid = scheduler.allGroupsSpawned
      ? scheduler.nextSpawnTick < state.tick
      : scheduler.nextSpawnTick >= state.tick &&
        scheduler.nextSpawnTick - state.tick <= maximumPendingSpawnDelay;
    const expectedSpawned = scheduler.allGroupsSpawned
      ? totalWaveUnits
      : wave.groups
          .slice(0, scheduler.groupIndex)
          .reduce((sum, group) => sum + group.count, 0) + scheduler.unitIndex;
    const finalWaveCompleted = scheduler.completedWaves === waveCount;
    const terminalDefeat = state.flowState === 'result' && state.outcome === 'defeat';
    const completionIsValid = terminalDefeat
      ? scheduler.completedWaves === scheduler.waveIndex && !scheduler.victoryPending
      : finalWaveCompleted
      ? scheduler.waveIndex === waveCount - 1 &&
        scheduler.allGroupsSpawned &&
        state.enemies.length === 0 &&
        (
          (scheduler.victoryPending && state.flowState === 'offer-pending') ||
          (!scheduler.victoryPending && state.flowState === 'result' && state.outcome === 'victory')
        )
      : scheduler.completedWaves === scheduler.waveIndex &&
        !scheduler.victoryPending &&
        state.flowState !== 'result';
    if (
      !cursorIsValid ||
      !spawnTimingIsValid ||
      state.tick > maximumWaveTerminalTick ||
      scheduler.nextSpawnTick > maximumCursorSpawnTick ||
      scheduler.currentWaveSpawned !== expectedSpawned ||
      scheduler.currentWaveKilled > scheduler.currentWaveSpawned ||
      scheduler.currentWaveSpawned - scheduler.currentWaveKilled !== state.enemies.length ||
      !completionIsValid
    ) {
      throw new Error('Checkpoint fixed scheduler is inconsistent with battle content.');
    }

    for (const enemy of state.enemies) {
      const encodedWaveIndex = enemy.entityId >>> 20;
      const encodedGroupIndex = (enemy.entityId >>> 12) & 0xff;
      const encodedUnitIndex = enemy.entityId & 0xfff;
      const group = wave.groups[encodedGroupIndex];
      const spawnedInGroup = scheduler.allGroupsSpawned || encodedGroupIndex < scheduler.groupIndex
        ? group?.count ?? 0
        : encodedGroupIndex === scheduler.groupIndex
          ? scheduler.unitIndex
          : 0;
      const definition = group === undefined ? undefined : this.bundle.enemies[group.enemyId];
      const expectedEntityId =
        (wave.index << 20) | (encodedGroupIndex << 12) | encodedUnitIndex;
      const maximumEnemySpawnTick = maximumWaveStartTick +
        this.fixedWaveSpawnOffsetTicks(wave, encodedGroupIndex, encodedUnitIndex);
      const inferredEnemySpawnTick = state.tick - enemy.ageTicks;
      const maximumEnemyLifetimeTicks = definition === undefined
        ? 0
        : this.maximumFixedEnemyLifetimeTicks(wave, definition);
      const minimumEnemyDistanceMilli = definition === undefined
        ? Number.MAX_SAFE_INTEGER
        : this.minimumFixedEnemyDistanceMilli(state, wave, enemy, definition);
      if (
        encodedWaveIndex !== wave.index ||
        group === undefined ||
        definition === undefined ||
        expectedEntityId !== enemy.entityId ||
        encodedUnitIndex >= spawnedInGroup ||
        inferredEnemySpawnTick < 0 ||
        inferredEnemySpawnTick > maximumEnemySpawnTick ||
        enemy.ageTicks > maximumEnemyLifetimeTicks ||
        enemy.distanceMilli < minimumEnemyDistanceMilli ||
        enemy.definitionId !== group.enemyId ||
        enemy.maxHpMilli !== mulBp(definition.maxHpMilli, wave.hpMultiplierBp) ||
        enemy.expAward !== Math.max(
          1,
          Math.floor((definition.exp * wave.expMultiplierBp) / 10_000),
        ) ||
        enemy.speedMultiplierBp !== (wave.speedMultiplierBp ?? 10_000)
      ) {
        throw new Error('Checkpoint fixed scheduler contains an enemy outside its spawned prefix.');
      }
    }
  }

  private requiredEventSequenceReserve(state: SerializableState): number {
    const remainingLevels = Math.max(0, this.bundle.rules.maxLevel - state.level);
    return 16 +
      state.enemies.length +
      state.projectiles.length * EVENT_SEQUENCE_PER_PROJECTILE_RESERVE +
      remainingLevels;
  }

  private requiredLifetimeEventSequenceReserve(
    state: SerializableState,
    remainingBattleTicks: number,
  ): number {
    const remainingLevels = Math.max(0, this.bundle.rules.maxLevel - state.level);
    const remainingRevives = Math.max(0, this.bundle.rules.maxRevives - state.revivesUsed);
    const terminalEvents = state.flowState === 'result'
      ? 0
      : battleMode(this.bundle) === 'endless'
        ? 2
        : 1;
    const reserve =
      BigInt(remainingBattleTicks) * BigInt(EVENT_SEQUENCE_PER_TICK_LIFETIME_RESERVE) +
      BigInt(state.enemies.length) +
      BigInt(state.projectiles.length) * BigInt(EVENT_SEQUENCE_PER_PROJECTILE_RESERVE) +
      BigInt(remainingLevels + remainingRevives + terminalEvents);
    return reserve > BigInt(Number.MAX_SAFE_INTEGER)
      ? Number.MAX_SAFE_INTEGER
      : Number(reserve);
  }

  private maximumBattleTick(): number {
    if (battleMode(this.bundle) === 'endless') {
      return this.requireEndlessRules().settlementTick;
    }
    const finalWaveIndex = this.bundle.waves.length - 1;
    const finalWave = this.bundle.waves[finalWaveIndex];
    if (finalWave === undefined) {
      throw new Error('Fixed battle content has no terminal wave.');
    }
    const maximum = this.maximumFixedWaveStartTick(finalWaveIndex) +
      this.fixedWaveSpawnSpanTicks(finalWave) +
      this.maximumFixedWaveLifetimeTicks(finalWave);
    if (!Number.isSafeInteger(maximum) || maximum < 0) {
      throw new Error('Battle lifetime exceeds the safe tick range.');
    }
    return maximum;
  }

  private fixedWaveSpawnOffsetTicks(
    wave: BattleBundleV1['waves'][number],
    groupIndex: number,
    unitIndex: number,
  ): number {
    let offset = 0;
    for (let index = 0; index < groupIndex; index += 1) {
      const group = wave.groups[index];
      if (group === undefined) break;
      offset += (group.count - 1) * group.intervalTicks + this.bundle.rules.groupGapTicks;
    }
    const group = wave.groups[groupIndex];
    if (group !== undefined) offset += unitIndex * group.intervalTicks;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error(`Wave ${wave.id} has an unsafe spawn schedule.`);
    }
    return offset;
  }

  private fixedWaveSpawnSpanTicks(wave: BattleBundleV1['waves'][number]): number {
    if (wave.groups.length === 0) return 0;
    const lastGroupIndex = wave.groups.length - 1;
    const lastGroup = wave.groups[lastGroupIndex];
    if (lastGroup === undefined) return 0;
    return this.fixedWaveSpawnOffsetTicks(
      wave,
      lastGroupIndex,
      lastGroup.count - 1,
    );
  }

  private maximumFixedEnemyLifetimeTicks(
    wave: BattleBundleV1['waves'][number],
    definition: EnemyDefinition,
  ): number {
    const speedPxPerSecond = mulBp(
      definition.speedPxPerSecond,
      wave.speedMultiplierBp ?? 10_000,
    );
    if (!Number.isSafeInteger(speedPxPerSecond) || speedPxPerSecond <= 0) {
      throw new Error(`Wave ${wave.id} has an unsafe minimum enemy speed.`);
    }
    const rollbackMilli = mulBp(
      this.route.totalLengthMilli,
      this.bundle.rules.reviveGroundRollbackBp,
    );
    const totalTravelMilli = BigInt(this.route.totalLengthMilli) +
      BigInt(rollbackMilli) * BigInt(this.bundle.rules.maxRevives);
    const speedMilliPerSecond = BigInt(speedPxPerSecond * MILLI_PX);
    const travelTicks = Number(
      (totalTravelMilli * BigInt(TICKS_PER_SECOND) + speedMilliPerSecond - 1n) /
        speedMilliPerSecond,
    );
    const lifetime = travelTicks +
      this.bundle.rules.reviveGuardTicks * this.bundle.rules.maxRevives +
      2;
    if (!Number.isSafeInteger(lifetime) || lifetime <= 0) {
      throw new Error(`Wave ${wave.id} has an unsafe enemy lifetime bound.`);
    }
    return lifetime;
  }

  private maximumFixedWaveLifetimeTicks(wave: BattleBundleV1['waves'][number]): number {
    return wave.groups.reduce((maximum, group) => {
      const definition = this.enemyDefinition(group.enemyId);
      return Math.max(maximum, this.maximumFixedEnemyLifetimeTicks(wave, definition));
    }, 1);
  }

  private maximumFixedWaveStartTick(waveIndex: number): number {
    let maximumStartTick = 0;
    for (let index = 0; index < waveIndex; index += 1) {
      const wave = this.bundle.waves[index];
      if (wave === undefined) break;
      maximumStartTick += this.fixedWaveSpawnSpanTicks(wave) +
        this.maximumFixedWaveLifetimeTicks(wave) +
        this.bundle.rules.waveGapTicks;
    }
    if (!Number.isSafeInteger(maximumStartTick) || maximumStartTick < 0) {
      throw new Error('Fixed wave schedule exceeds the safe tick range.');
    }
    return maximumStartTick;
  }

  private minimumFixedEnemyDistanceMilli(
    state: SerializableState,
    wave: BattleBundleV1['waves'][number],
    enemy: EnemyState,
    definition: EnemyDefinition,
  ): number {
    const speedPxPerSecond = mulBp(
      definition.speedPxPerSecond,
      wave.speedMultiplierBp ?? 10_000,
    );
    const travelledMilli = Number(
      (BigInt(enemy.ageTicks) * BigInt(speedPxPerSecond * MILLI_PX)) /
        BigInt(TICKS_PER_SECOND),
    );
    const rollbackMilli = mulBp(
      this.route.totalLengthMilli,
      this.bundle.rules.reviveGroundRollbackBp,
    );
    const maximumGuardTravelMilli = Math.ceil(
      (speedPxPerSecond * MILLI_PX * this.bundle.rules.reviveGuardTicks) /
        TICKS_PER_SECOND,
    );
    const maximumLostDistance =
      (rollbackMilli + maximumGuardTravelMilli) * state.revivesUsed;
    return Math.min(
      Math.max(0, this.route.totalLengthMilli - 1),
      Math.max(0, travelledMilli - maximumLostDistance),
    );
  }

  private checkedTickAdd(base: number, increment: number, label: string): number {
    if (
      !Number.isSafeInteger(base) ||
      base < 0 ||
      !Number.isSafeInteger(increment) ||
      increment < 0 ||
      base > Number.MAX_SAFE_INTEGER - increment
    ) {
      throw new Error(`${label} tick sequence is exhausted.`);
    }
    return base + increment;
  }

  private assertEventSequenceCapacity(required: number): void {
    if (
      !Number.isSafeInteger(required) ||
      required < 0 ||
      !Number.isSafeInteger(this.state.eventSeq) ||
      this.state.eventSeq < 0 ||
      this.state.eventSeq > Number.MAX_SAFE_INTEGER - required
    ) {
      throw new Error('Battle event sequence is exhausted.');
    }
  }

  private assertEndlessEnemyIdCapacity(required: number): void {
    if (
      !Number.isSafeInteger(required) ||
      required <= 0 ||
      !Number.isSafeInteger(this.state.nextEnemyId) ||
      this.state.nextEnemyId < 0 ||
      this.state.nextEnemyId > PROJECTILE_ENTITY_ID_BASE - required
    ) {
      throw new Error('Endless enemy entity id range exhausted.');
    }
  }

  private takeNextEndlessEnemyId(): number {
    this.assertEndlessEnemyIdCapacity(1);
    const entityId = this.state.nextEnemyId;
    this.state.nextEnemyId += 1;
    return entityId;
  }

  private assertProjectileIdCapacity(required: number): void {
    if (
      !Number.isSafeInteger(required) ||
      required <= 0 ||
      !Number.isSafeInteger(this.state.nextProjectileId) ||
      this.state.nextProjectileId < PROJECTILE_ENTITY_ID_BASE ||
      this.state.nextProjectileId > MAX_RENDER_ENTITY_ID - required
    ) {
      throw new Error('Projectile entity id range exhausted.');
    }
  }

  private cloneState(): SerializableState {
    return JSON.parse(JSON.stringify(this.state)) as SerializableState;
  }

  private step(output: SimulationOutput): void {
    this.assertEventSequenceCapacity(this.requiredEventSequenceReserve(this.state));
    if (battleMode(this.bundle) === 'endless') {
      this.assertEndlessEnemyIdCapacity(ENDLESS_ENEMY_ID_SEQUENCE_RESERVE);
      this.spawnDueEndlessEnemies(output);
    } else {
      this.spawnDueEnemy(output);
    }
    this.moveEnemies();
    this.updateTowerCooldowns();
    this.fireTowers(output);
    this.updateProjectiles(output);
    this.removeDeadEnemies();
    this.checkBreach(output);
    this.updateOverdrive(output);
    if (battleMode(this.bundle) === 'fixed') {
      this.resolveWave(output);
    }
    if (this.state.reviveGuardRemainingTicks > 0) {
      this.state.reviveGuardRemainingTicks -= 1;
    }
    this.state.tick = this.checkedTickAdd(this.state.tick, 1, 'Simulation');
    this.advanceEndlessMilestones(output);
  }

  private requireEndlessRules(): NonNullable<BattleBundleV1['endless']> {
    const rules = this.bundle.endless;
    if (battleMode(this.bundle) !== 'endless' || rules === undefined) {
      throw new Error('Endless rules were requested for fixed battle content.');
    }
    return rules;
  }

  private requireEndlessState(): EndlessState {
    const endless = this.state.endless;
    if (battleMode(this.bundle) !== 'endless' || endless === null) {
      throw new Error('Endless state was requested for fixed battle content.');
    }
    return endless;
  }

  private maximumEnemyExpAward(): number {
    let maximum = 0;
    if (battleMode(this.bundle) === 'endless') {
      const rules = this.requireEndlessRules();
      const enemyIds = new Set([
        ...rules.threatEntries.map((entry) => entry.enemyId),
        ...rules.miniBossEnemyIds,
      ]);
      for (const enemyId of enemyIds) {
        const definition = this.enemyDefinition(enemyId);
        maximum = Math.max(
          maximum,
          multiplyDivideTowardZero(
            definition.exp,
            MAX_ENDLESS_EXP_MULTIPLIER_BP,
            10_000,
          ),
        );
      }
    } else {
      for (const wave of this.bundle.waves) {
        for (const group of wave.groups) {
          const definition = this.enemyDefinition(group.enemyId);
          maximum = Math.max(
            maximum,
            Math.max(
              1,
              multiplyDivideTowardZero(
                definition.exp,
                wave.expMultiplierBp,
                10_000,
              ),
            ),
          );
        }
      }
    }
    if (!Number.isSafeInteger(maximum) || maximum < 0) {
      throw new Error('Battle content has an unsafe maximum enemy experience award.');
    }
    return maximum;
  }

  private maximumRunExperienceAward(): number {
    let maximum = 0n;
    if (battleMode(this.bundle) === 'endless') {
      const rules = this.requireEndlessRules();
      const packCount = Math.ceil(
        (rules.bossPhaseTick - rules.threatStartTick) / rules.threatPackIntervalTicks,
      );
      maximum = BigInt(this.maximumEnemyExpAward()) *
        BigInt(packCount) *
        BigInt(rules.maxPackSize);
    } else {
      for (const wave of this.bundle.waves) {
        for (const group of wave.groups) {
          const definition = this.enemyDefinition(group.enemyId);
          const award = Math.max(
            1,
            multiplyDivideTowardZero(
              definition.exp,
              wave.expMultiplierBp,
              10_000,
            ),
          );
          maximum += BigInt(award) * BigInt(group.count);
        }
      }
    }
    if (maximum < 0n || maximum > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Battle content has an unsafe total experience award.');
    }
    return Number(maximum);
  }

  private maximumEndlessBossLayerAtTick(tick: number): number {
    const rules = this.requireEndlessRules();
    if (tick <= rules.bossPhaseTick) return 1;
    const boundedTick = Math.min(tick, rules.settlementTick);
    return 2 + Math.floor(
      (boundedTick - rules.bossPhaseTick - 1) / rules.bossLayerGuardTicks,
    );
  }

  private maximumEndlessHpMultiplierBp(): number {
    const rules = this.requireEndlessRules();
    const maximumThreatMultiplierBp = rules.threatLutBp.reduce(
      (maximum, value) => Math.max(maximum, value),
      10_000,
    );
    const maximumHpMultiplierBp = mulBp(maximumThreatMultiplierBp, 18_000);
    if (!Number.isSafeInteger(maximumHpMultiplierBp) || maximumHpMultiplierBp < 10_000) {
      throw new Error('Endless HP multiplier bounds are malformed.');
    }
    return maximumHpMultiplierBp;
  }

  private deriveEndlessSpawnStats(spec: EndlessSpawnSpec): {
    maxHpMilli: number;
    expAward: number;
  } {
    if (
      typeof spec !== 'object' ||
      spec === null ||
      typeof spec.enemyId !== 'string' ||
      !Number.isSafeInteger(spec.hpMultiplierBp) ||
      spec.hpMultiplierBp <= 0 ||
      spec.hpMultiplierBp > this.maximumEndlessHpMultiplierBp() ||
      !Number.isSafeInteger(spec.speedMultiplierBp) ||
      spec.speedMultiplierBp <= 0 ||
      spec.speedMultiplierBp > MAX_ENDLESS_SPEED_MULTIPLIER_BP ||
      !Number.isSafeInteger(spec.expMultiplierBp) ||
      spec.expMultiplierBp < 0 ||
      spec.expMultiplierBp > MAX_ENDLESS_EXP_MULTIPLIER_BP
    ) {
      throw new Error('Endless spawn multipliers are outside the deterministic content bounds.');
    }
    const definition = this.enemyDefinition(spec.enemyId);
    if (
      !Number.isSafeInteger(definition.maxHpMilli) ||
      definition.maxHpMilli <= 0 ||
      !Number.isSafeInteger(definition.speedPxPerSecond) ||
      definition.speedPxPerSecond <= 0 ||
      !Number.isSafeInteger(definition.exp) ||
      definition.exp < 0
    ) {
      throw new Error(`Enemy ${definition.id} has unsafe endless spawn values.`);
    }
    const maxHpMilli = mulBp(definition.maxHpMilli, spec.hpMultiplierBp);
    const expAward = multiplyDivideTowardZero(
      definition.exp,
      spec.expMultiplierBp,
      10_000,
    );
    const maximumSpeedPxPerSecond = this.deriveMaximumEnemySpeedPxPerSecond(
      definition.id,
      spec.speedMultiplierBp,
    );
    if (
      !Number.isSafeInteger(maxHpMilli) ||
      maxHpMilli <= 0 ||
      maxHpMilli > MAX_ENEMY_HP_MILLI ||
      !Number.isSafeInteger(expAward) ||
      expAward < 0 ||
      maximumSpeedPxPerSecond > MAX_MOVEMENT_SPEED_PX_PER_SECOND
    ) {
      throw new Error(`Enemy ${definition.id} has unsafe derived endless spawn values.`);
    }
    return { maxHpMilli, expAward };
  }

  private deriveMaximumEnemySpeedPxPerSecond(
    enemyId: string,
    speedMultiplierBp: number,
  ): number {
    if (
      !Number.isSafeInteger(speedMultiplierBp) ||
      speedMultiplierBp <= 0 ||
      speedMultiplierBp > MAX_ENDLESS_SPEED_MULTIPLIER_BP
    ) {
      throw new Error('Endless enemy speed multiplier is outside the deterministic content bounds.');
    }
    const definition = this.enemyDefinition(enemyId);
    if (
      !Number.isSafeInteger(definition.speedPxPerSecond) ||
      definition.speedPxPerSecond <= 0
    ) {
      throw new Error(`Enemy ${definition.id} has an unsafe movement speed.`);
    }
    let maximumSpeedMultiplierBp = speedMultiplierBp;
    if (definition.id === 'MON_SWIFT_EEL') {
      maximumSpeedMultiplierBp = mulBp(maximumSpeedMultiplierBp, 16_000);
    }
    if (definition.enrageSpeedMultiplierBp !== undefined) {
      maximumSpeedMultiplierBp = mulBp(
        maximumSpeedMultiplierBp,
        definition.enrageSpeedMultiplierBp,
      );
    }
    const maximumSpeedPxPerSecond = mulBp(
      definition.speedPxPerSecond,
      maximumSpeedMultiplierBp,
    );
    if (
      !Number.isSafeInteger(maximumSpeedPxPerSecond) ||
      maximumSpeedPxPerSecond <= 0 ||
      maximumSpeedPxPerSecond > MAX_MOVEMENT_SPEED_PX_PER_SECOND
    ) {
      throw new Error(`Enemy ${definition.id} has an unsafe derived movement speed.`);
    }
    return maximumSpeedPxPerSecond;
  }

  private isValidEndlessEnemyMovement(enemy: EnemyState): boolean {
    try {
      this.deriveMaximumEnemySpeedPxPerSecond(
        enemy.definitionId,
        enemy.speedMultiplierBp ?? 10_000,
      );
      return true;
    } catch {
      return false;
    }
  }

  private isValidEndlessEnemyExpAward(enemy: EnemyState): boolean {
    const rules = this.requireEndlessRules();
    if (enemy.definitionId === rules.bossEnemyId || enemy.definitionId === rules.bossSummonEnemyId) {
      return enemy.expAward === 0;
    }
    const isThreatEnemy = rules.threatEntries.some(
      (entry) => entry.enemyId === enemy.definitionId,
    ) || rules.miniBossEnemyIds.includes(enemy.definitionId);
    if (!isThreatEnemy) return false;
    const maximumAward = multiplyDivideTowardZero(
      this.enemyDefinition(enemy.definitionId).exp,
      MAX_ENDLESS_EXP_MULTIPLIER_BP,
      10_000,
    );
    return Number.isSafeInteger(maximumAward) &&
      maximumAward >= 0 &&
      enemy.expAward <= maximumAward;
  }

  private isValidEndlessSpawnSpec(spec: EndlessSpawnSpec): boolean {
    try {
      this.deriveEndlessSpawnStats(spec);
      return true;
    } catch {
      return false;
    }
  }

  private checkedDamageCounterAdd(
    current: number,
    increment: number,
    counterName: string,
  ): number {
    if (
      !Number.isSafeInteger(current) ||
      current < 0 ||
      current > MAX_DAMAGE_COUNTER_MILLI ||
      !Number.isSafeInteger(increment) ||
      increment < 0
    ) {
      throw new Error(`${counterName} overflow reserve is exhausted.`);
    }
    return current > MAX_DAMAGE_COUNTER_MILLI - increment
      ? MAX_DAMAGE_COUNTER_MILLI
      : current + increment;
  }

  private checkedExperienceAdd(current: number, increment: number): number {
    if (
      !Number.isSafeInteger(current) ||
      current < 0 ||
      !Number.isSafeInteger(increment) ||
      increment < 0 ||
      current > Number.MAX_SAFE_INTEGER - increment
    ) {
      throw new Error('Battle experience counter overflow reserve is exhausted.');
    }
    return current + increment;
  }

  private incrementEnemyAge(enemy: EnemyState): void {
    if (!Number.isSafeInteger(enemy.ageTicks) || enemy.ageTicks >= Number.MAX_SAFE_INTEGER) {
      throw new Error(`Enemy ${enemy.entityId} age counter is exhausted.`);
    }
    enemy.ageTicks += 1;
  }

  private endlessScorePayload(): {
    routeId: string;
    reachedBoss: boolean;
    survivalTick: number;
    bossLayer: number;
    bossDamageMilli: number;
    scoreReachedTick: number;
  } {
    const endless = this.requireEndlessState();
    return {
      routeId: endless.routeId,
      reachedBoss: endless.reachedBoss,
      survivalTick: endless.survivalTick,
      bossLayer: endless.bossLayer,
      bossDamageMilli: endless.bossDamageMilli,
      scoreReachedTick: endless.scoreReachedTick,
    };
  }

  private endlessHudProjection(): EndlessHudProjectionV1 | undefined {
    if (battleMode(this.bundle) !== 'endless') return undefined;
    const rules = this.requireEndlessRules();
    const endless = this.requireEndlessState();
    const boss = endless.bossEntityId === null
      ? undefined
      : this.state.enemies.find((enemy) => enemy.entityId === endless.bossEntityId);
    let nextThreatTick: number | undefined;
    if (endless.phase === 'survival') {
      const elapsed = Math.max(0, this.state.tick - rules.threatStartTick);
      const candidate = rules.threatStartTick +
        Math.ceil(elapsed / rules.threatPackIntervalTicks) * rules.threatPackIntervalTicks;
      if (candidate < rules.bossPhaseTick) nextThreatTick = candidate;
    } else if (endless.phase === 'boss') {
      const candidate = rules.bossPhaseTick +
        (endless.bossSummonOrdinal + 1) * rules.bossSummonIntervalTicks;
      if (candidate < rules.settlementTick) nextThreatTick = candidate;
    }
    const nextEliteTick = endless.phase === 'survival'
      ? rules.miniBossTicks.find((tick) => tick >= this.state.tick)
      : undefined;
    const common = {
      ...this.endlessScorePayload(),
      phase: endless.phase,
      settlementReason: endless.settlementReason,
      survivalEndTick: rules.bossPhaseTick,
      hardEndTick: rules.settlementTick,
      threatTier: clamp(Math.floor(endless.survivalTick / 3_600) + 1, 1, 10),
      activeEnemyCount: this.state.enemies.filter((enemy) => enemy.hpMilli > 0).length,
      queuedEnemyCount: endless.pendingPacks.reduce(
        (count, pack) => count + Math.max(0, pack.units.length - pack.nextUnitIndex),
        0,
      ),
      threatPackOrdinal: endless.threatPackOrdinal,
      ...(nextThreatTick === undefined ? {} : { nextThreatTick }),
      ...(nextEliteTick === undefined ? {} : { nextEliteTick }),
    };
    return boss === undefined
      ? common
      : {
          ...common,
          bossHpMilli: boss.hpMilli,
          bossMaxHpMilli: boss.maxHpMilli,
        };
  }

  private threatMultiplierBpAtTick(tick: number): number {
    const rules = this.requireEndlessRules();
    const second = clamp(Math.floor(tick / TICKS_PER_SECOND), 0, rules.threatLutBp.length - 1);
    return rules.threatLutBp[second] ?? rules.threatLutBp[rules.threatLutBp.length - 1] ?? 10_000;
  }

  private createSurvivalThreatPack(
    ordinal: number,
    scheduledTick: number,
  ): EndlessThreatPackState {
    const rules = this.requireEndlessRules();
    const threatMultiplierBp = this.threatMultiplierBpAtTick(scheduledTick);
    const miniBossIndex = rules.miniBossTicks.indexOf(scheduledTick);
    const miniBossEnemyId = miniBossIndex < 0
      ? undefined
      : rules.miniBossEnemyIds[miniBossIndex];
    const speedMultiplierBp = Math.min(
      13_500,
      10_000 + Math.floor((threatMultiplierBp - 10_000) / 10),
    );
    const expMultiplierBp = Math.min(
      7_200,
      6_000 + Math.floor((threatMultiplierBp - 10_000) / 25),
    );
    const units: EndlessSpawnSpec[] = [];
    if (miniBossEnemyId !== undefined) {
      units.push({
        enemyId: miniBossEnemyId,
        hpMultiplierBp: mulBp(threatMultiplierBp, 18_000),
        speedMultiplierBp,
        expMultiplierBp,
      });
    }

    const eligibleEntries = rules.threatEntries.filter(
      (entry) => entry.unlockTick <= scheduledTick && entry.enemyId !== miniBossEnemyId,
    );
    if (eligibleEntries.length === 0) {
      throw new Error(`Endless threat pack ${ordinal} has no eligible enemies.`);
    }
    let budget = Math.min(
      64,
      9 +
        Math.floor((threatMultiplierBp - 10_000) / 850) +
        endlessDerivedRandom(this.state.initialSeed, ordinal, 0) % 4,
    );
    let unitOrdinal = units.length;
    while (units.length < rules.maxPackSize) {
      const affordable = eligibleEntries.filter((entry) => entry.threatCost <= budget);
      if (affordable.length === 0) break;
      const selected = affordable[
        endlessDerivedRandom(this.state.initialSeed, ordinal, unitOrdinal + 1) % affordable.length
      ];
      if (selected === undefined) break;
      units.push({
        enemyId: selected.enemyId,
        hpMultiplierBp: mulBp(threatMultiplierBp, 9_000),
        speedMultiplierBp,
        expMultiplierBp,
      });
      budget -= selected.threatCost;
      unitOrdinal += 1;
    }

    return {
      ordinal,
      scheduledTick,
      nextSpawnTick: scheduledTick,
      nextUnitIndex: 0,
      units,
    };
  }

  private createBossSummonPack(
    summonOrdinal: number,
    scheduledTick: number,
  ): EndlessThreatPackState {
    const rules = this.requireEndlessRules();
    const count = Math.min(
      rules.maxPackSize,
      3 + Math.floor((scheduledTick - rules.bossPhaseTick) / 1_800),
    );
    const threatMultiplierBp = this.threatMultiplierBpAtTick(rules.bossPhaseTick);
    return {
      ordinal: this.requireEndlessState().threatPackOrdinal + summonOrdinal,
      scheduledTick,
      nextSpawnTick: scheduledTick,
      nextUnitIndex: 0,
      units: Array.from({ length: count }, () => ({
        enemyId: rules.bossSummonEnemyId,
        hpMultiplierBp: threatMultiplierBp,
        speedMultiplierBp: 12_000,
        expMultiplierBp: 0,
      })),
    };
  }

  private spawnDueEndlessEnemies(output: SimulationOutput): void {
    const rules = this.requireEndlessRules();
    const endless = this.requireEndlessState();
    if (
      endless.phase === 'survival' &&
      this.state.tick >= rules.threatStartTick &&
      this.state.tick < rules.bossPhaseTick &&
      (this.state.tick - rules.threatStartTick) % rules.threatPackIntervalTicks === 0
    ) {
      const ordinal = Math.floor(
        (this.state.tick - rules.threatStartTick) / rules.threatPackIntervalTicks,
      );
      if (endless.threatPackOrdinal === ordinal) {
        endless.pendingPacks.push(this.createSurvivalThreatPack(ordinal, this.state.tick));
        endless.threatPackOrdinal = ordinal + 1;
      }
    } else if (
      endless.phase === 'boss' &&
      this.state.tick > rules.bossPhaseTick &&
      (this.state.tick - rules.bossPhaseTick) % rules.bossSummonIntervalTicks === 0
    ) {
      const summonOrdinal = Math.floor(
        (this.state.tick - rules.bossPhaseTick) / rules.bossSummonIntervalTicks,
      );
      if (endless.bossSummonOrdinal < summonOrdinal) {
        endless.pendingPacks.push(this.createBossSummonPack(summonOrdinal, this.state.tick));
        endless.bossSummonOrdinal = summonOrdinal;
      }
    }

    endless.pendingPacks.sort((left, right) => left.ordinal - right.ordinal);
    let activeEnemyCount = this.state.enemies.filter((enemy) => enemy.hpMilli > 0).length;
    for (const pack of endless.pendingPacks) {
      if (activeEnemyCount >= rules.maxActiveEnemies) break;
      if (pack.nextUnitIndex >= pack.units.length || this.state.tick < pack.nextSpawnTick) continue;
      const spec = pack.units[pack.nextUnitIndex];
      if (spec === undefined) continue;
      this.spawnEndlessEnemy(spec, output);
      activeEnemyCount += 1;
      pack.nextUnitIndex += 1;
      pack.nextSpawnTick = this.checkedTickAdd(
        this.state.tick,
        rules.unitIntervalTicks,
        'Endless unit spawn',
      );
    }
    endless.pendingPacks = endless.pendingPacks.filter(
      (pack) => pack.nextUnitIndex < pack.units.length,
    );
  }

  private spawnEndlessEnemy(spec: EndlessSpawnSpec, output: SimulationOutput): EnemyState {
    const definition = this.enemyDefinition(spec.enemyId);
    const derived = this.deriveEndlessSpawnStats(spec);
    const entityId = this.takeNextEndlessEnemyId();
    const enemy: EnemyState = {
      entityId,
      definitionId: definition.id,
      hpMilli: derived.maxHpMilli,
      maxHpMilli: derived.maxHpMilli,
      distanceMilli: 0,
      movementRemainder: 0,
      ageTicks: 0,
      expAward: derived.expAward,
      speedMultiplierBp: spec.speedMultiplierBp,
    };
    this.state.enemies.push(enemy);
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'SPAWN',
      entityId,
      enemyId: definition.id,
    });
    return enemy;
  }

  private advanceEndlessMilestones(output: SimulationOutput): void {
    if (battleMode(this.bundle) !== 'endless') return;
    const rules = this.requireEndlessRules();
    const endless = this.requireEndlessState();
    if (endless.phase === 'survival') {
      endless.survivalTick = Math.min(this.state.tick, rules.bossPhaseTick);
      endless.scoreReachedTick = endless.survivalTick;
      if (this.state.tick >= rules.bossPhaseTick && this.state.flowState === 'running') {
        this.enterEndlessBossPhase(output);
      }
    }
    if (
      endless.phase === 'boss' &&
      this.state.tick >= rules.settlementTick &&
      this.state.flowState === 'running'
    ) {
      this.settleEndless('time-limit', output);
    }
  }

  private enterEndlessBossPhase(output: SimulationOutput): void {
    const rules = this.requireEndlessRules();
    const endless = this.requireEndlessState();
    if (endless.phase !== 'survival') return;
    endless.phase = 'boss';
    endless.reachedBoss = true;
    endless.survivalTick = rules.bossPhaseTick;
    endless.scoreReachedTick = rules.bossPhaseTick;
    endless.bossLayer = 1;
    endless.bossSummonOrdinal = 0;
    endless.pendingPacks = [];
    this.state.enemies = [];
    this.state.projectiles = [];
    this.state.outcome = null;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'ENDLESS_PHASE_CHANGED',
      phase: 'boss',
      ...this.endlessScorePayload(),
    });
    const bossDefinition = this.enemyDefinition(rules.bossEnemyId);
    const boss = this.spawnEndlessEnemy({
      enemyId: bossDefinition.id,
      hpMultiplierBp: 10_000,
      speedMultiplierBp: 10_000,
      expMultiplierBp: 0,
    }, output);
    endless.bossEntityId = boss.entityId;
  }

  private settleEndless(reason: EndlessSettlementReason, output: SimulationOutput): void {
    const endless = this.requireEndlessState();
    if (endless.phase === 'settled') return;
    if (reason === 'breach' && endless.phase === 'survival') {
      const rules = this.requireEndlessRules();
      endless.survivalTick = Math.min(this.state.tick + 1, rules.bossPhaseTick);
      endless.scoreReachedTick = endless.survivalTick;
    }
    endless.phase = 'settled';
    endless.settlementReason = reason;
    endless.pendingPacks = [];
    this.state.projectiles = [];
    this.state.activeOffer = null;
    this.state.flowState = 'result';
    this.state.outcome = reason === 'breach' ? 'defeat' : 'settled';
    this.state.wallTickRemainder = 0;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'ENDLESS_PHASE_CHANGED',
      phase: 'settled',
      ...this.endlessScorePayload(),
    });
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'ENDLESS_SETTLED',
      reason,
      ...this.endlessScorePayload(),
    });
  }

  private spawnDueEnemy(output: SimulationOutput): void {
    const scheduler = this.state.scheduler;
    if (scheduler.allGroupsSpawned || this.state.tick < scheduler.nextSpawnTick) {
      return;
    }

    const wave = this.bundle.waves[scheduler.waveIndex];
    const group = wave?.groups[scheduler.groupIndex];
    if (!wave || !group) {
      throw new Error('Wave scheduler references missing content.');
    }
    const definition = this.enemyDefinition(group.enemyId);
    const entityId = (wave.index << 20) | (scheduler.groupIndex << 12) | scheduler.unitIndex;
    const maxHpMilli = mulBp(definition.maxHpMilli, wave.hpMultiplierBp);
    this.state.enemies.push({
      entityId,
      definitionId: definition.id,
      hpMilli: maxHpMilli,
      maxHpMilli,
      distanceMilli: 0,
      movementRemainder: 0,
      ageTicks: 0,
      expAward: Math.max(1, Math.floor((definition.exp * wave.expMultiplierBp) / 10_000)),
      speedMultiplierBp: wave.speedMultiplierBp ?? 10_000,
    });
    scheduler.currentWaveSpawned += 1;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'SPAWN',
      entityId,
      enemyId: definition.id,
    });

    scheduler.unitIndex += 1;
    if (scheduler.unitIndex < group.count) {
      scheduler.nextSpawnTick = this.checkedTickAdd(
        this.state.tick,
        group.intervalTicks,
        'Fixed group spawn',
      );
      return;
    }

    scheduler.groupIndex += 1;
    scheduler.unitIndex = 0;
    if (scheduler.groupIndex < wave.groups.length) {
      scheduler.nextSpawnTick = this.checkedTickAdd(
        this.state.tick,
        this.bundle.rules.groupGapTicks,
        'Fixed group gap',
      );
    } else {
      scheduler.allGroupsSpawned = true;
    }
  }

  private moveEnemies(): void {
    for (const enemy of [...this.state.enemies].sort((left, right) => left.entityId - right.entityId)) {
      if (enemy.hpMilli <= 0 || enemy.distanceMilli >= this.route.totalLengthMilli) {
        continue;
      }
      if (
        enemy.invulnerableUntilTick !== undefined &&
        this.state.tick < enemy.invulnerableUntilTick
      ) {
        this.incrementEnemyAge(enemy);
        continue;
      }
      const definition = this.enemyDefinition(enemy.definitionId);
      const wave = this.bundle.waves[this.state.scheduler.waveIndex];
      let speedBp = enemy.speedMultiplierBp ?? wave?.speedMultiplierBp ?? 10_000;
      if (
        enemy.definitionId === 'MON_SWIFT_EEL' &&
        enemy.ageTicks >= 90 &&
        (enemy.ageTicks - 90) % 180 < 45
      ) {
        speedBp = mulBp(speedBp, 16_000);
      }
      if (this.isEnemyEnraged(enemy, definition)) {
        speedBp = mulBp(speedBp, definition.enrageSpeedMultiplierBp ?? 10_000);
      }
      const speed = mulBp(definition.speedPxPerSecond, speedBp);
      const numerator = enemy.movementRemainder + speed * MILLI_PX;
      const deltaMilli = Math.floor(numerator / TICKS_PER_SECOND);
      enemy.movementRemainder = numerator % TICKS_PER_SECOND;
      enemy.distanceMilli = Math.min(this.route.totalLengthMilli, enemy.distanceMilli + deltaMilli);
      if (enemy.distanceMilli >= this.route.totalLengthMilli && this.state.reviveGuardRemainingTicks > 0) {
        enemy.distanceMilli = this.route.totalLengthMilli - 1;
      }
      this.incrementEnemyAge(enemy);
    }
  }

  private updateTowerCooldowns(): void {
    for (let index = 0; index < this.state.towerCooldowns.length; index += 1) {
      const cooldown = this.state.towerCooldowns[index] ?? 0;
      this.state.towerCooldowns[index] = Math.max(0, cooldown - 1);
    }
  }

  private updateOverdrive(output: SimulationOutput): void {
    const activeTowerId = this.state.overdriveTowerId;
    if (activeTowerId === null) {
      return;
    }
    this.state.overdriveRemainingTicks = Math.max(0, this.state.overdriveRemainingTicks - 1);
    if (this.state.overdriveRemainingTicks > 0) {
      return;
    }
    this.state.overdriveTowerId = null;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'OVERDRIVE_ENDED',
      towerId: activeTowerId,
    });
  }

  private gainOverdrive(amount: number, output: SimulationOutput): void {
    if (
      battleMode(this.bundle) !== 'fixed' ||
      overdriveDurationTicks(this.bundle) <= 0 ||
      this.state.overdriveTowerId !== null ||
      this.state.overdriveCharge >= OVERDRIVE_MAX_CHARGE ||
      amount <= 0
    ) {
      return;
    }
    const previousCharge = this.state.overdriveCharge;
    this.state.overdriveCharge = Math.min(
      OVERDRIVE_MAX_CHARGE,
      previousCharge + amount,
    );
    if (
      previousCharge < OVERDRIVE_MAX_CHARGE &&
      this.state.overdriveCharge === OVERDRIVE_MAX_CHARGE
    ) {
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'OVERDRIVE_READY',
      });
    }
  }

  private fireTowers(output: SimulationOutput): void {
    const reservedPrimaryTargets = new Set<number>();
    let projectileCapacityReserved = false;
    const effectiveStats = deriveEffectiveTowerStats(
      this.bundle.tower,
      tierStats(this.state.level),
      this.state.stats,
      towerStatCaps(this.bundle),
    );
    for (let towerIndex = 0; towerIndex < this.bundle.route.towerAnchors.length; towerIndex += 1) {
      if ((this.state.towerCooldowns[towerIndex] ?? 0) > 0) {
        continue;
      }
      const anchor = this.bundle.route.towerAnchors[towerIndex];
      if (!anchor) {
        continue;
      }
      const targeting = this.towerTargetingSnapshot(anchor, towerIndex, effectiveStats.rangePx);
      const targets = targeting.targets;
      if (targets.length === 0) {
        continue;
      }

      const fixedStage = battleMode(this.bundle) === 'fixed';
      const preferredTargets = fixedStage
        ? targets.filter((target) => targeting.preferredEntityIds.has(target.entityId))
        : targets;
      const primaryPool = preferredTargets.length > 0 ? preferredTargets : targets;
      const unreservedTarget = primaryPool.find(
        (target) => !reservedPrimaryTargets.has(target.entityId),
      );
      const selectedPrimaryTarget = unreservedTarget ?? primaryPool[0];
      const primaryTargetIndex = selectedPrimaryTarget === undefined
        ? 0
        : Math.max(0, targets.findIndex(
            (target) => target.entityId === selectedPrimaryTarget.entityId,
          ));
      const orderedTargets = primaryTargetIndex === 0
        ? targets
        : [...targets.slice(primaryTargetIndex), ...targets.slice(0, primaryTargetIndex)];

      const startXMilli = roundHalfUp(anchor.x * MILLI_PX);
      const startYMilli = roundHalfUp(anchor.y * MILLI_PX);
      const primaryTarget = orderedTargets[0];
      if (!primaryTarget) continue;
      reservedPrimaryTargets.add(primaryTarget.entityId);
      const primaryTargetPoint = pointAtDistance(this.route, primaryTarget.distanceMilli);
      const releaseRotationU16 = toRenderAngleU16(
        primaryTargetPoint.xMilli - startXMilli,
        primaryTargetPoint.yMilli - startYMilli,
      );
      if (!projectileCapacityReserved) {
        this.assertProjectileIdCapacity(PROJECTILE_ID_SEQUENCE_RESERVE);
        projectileCapacityReserved = true;
      }

      const overdriveActive = fixedStage && this.state.overdriveTowerId === towerIndex;
      const attackFocused = !fixedStage ||
        overdriveActive ||
        targeting.preferredEntityIds.has(primaryTarget.entityId);
      const arrowCount = fixedStage
        ? attackFocused
          ? Math.min(
              MAX_ARROW_COUNT,
              effectiveStats.arrowCount + (overdriveActive ? OVERDRIVE_ARROW_COUNT_ADD : 0),
            )
          : 1
        : effectiveStats.arrowCount;
      for (let arrowIndex = 0; arrowIndex < arrowCount; arrowIndex += 1) {
        const target = attackFocused
          ? orderedTargets[arrowIndex % orderedTargets.length]
          : primaryTarget;
        if (!target) {
          continue;
        }
        const critical = this.nextRandomBp() < effectiveStats.critChanceBp;
        const focused = fixedStage && (
          overdriveActive || targeting.preferredEntityIds.has(target.entityId)
        );
        const precisionArrow = focused && arrowIndex === 0;
        let projectileDamage = critical
          ? effectiveStats.criticalDamagePerArrowMilli
          : effectiveStats.damagePerArrowMilli;
        if (focused) {
          projectileDamage = mulBp(
            projectileDamage,
            10_000 + focusDamageBonusBp(this.bundle) +
              (precisionArrow ? PRECISION_FOCUS_DAMAGE_BONUS_BP : 0) +
              (overdriveActive ? OVERDRIVE_DAMAGE_BONUS_BP : 0),
          );
        }
        this.state.projectiles.push({
          entityId: this.state.nextProjectileId,
          towerId: towerIndex as TowerId,
          targetEntityId: target.entityId,
          bornTick: this.state.tick,
          xMilli: startXMilli,
          yMilli: startYMilli,
          movementRemainder: 0,
          damageMilli: projectileDamage,
          critical,
          penetration: fixedStage
            ? focused
              ? Math.min(
                  MAX_PENETRATION_COUNT,
                  effectiveStats.penetrationCount +
                    (precisionArrow ? PRECISION_PENETRATION_ADD : 0) +
                    (overdriveActive ? OVERDRIVE_PENETRATION_ADD : 0),
                )
              : 0
            : effectiveStats.penetrationCount,
          focused,
        });
        this.state.nextProjectileId += 1;
      }

      this.state.towerCooldowns[towerIndex] = overdriveActive
        ? Math.max(3, mulBp(effectiveStats.attackIntervalTicks, OVERDRIVE_ATTACK_INTERVAL_BP))
        : effectiveStats.attackIntervalTicks;
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'ATTACK_RELEASE',
        towerId: towerIndex,
        releaseRotationU16,
        focused: fixedStage && attackFocused,
        arrowCount,
      });
    }
  }

  private legalTargets(anchor: Point, towerIndex: number, rangePx?: number): EnemyState[] {
    const currentRangePx = rangePx ?? deriveEffectiveTowerStats(
      this.bundle.tower,
      tierStats(this.state.level),
      this.state.stats,
      towerStatCaps(this.bundle),
    ).rangePx;
    return this.towerTargetingSnapshot(anchor, towerIndex, currentRangePx).targets;
  }

  private towerTargetingSnapshot(
    anchor: Point,
    towerIndex: number,
    rangePx: number,
  ): TowerTargetingSnapshot {
    const rangeMilli = roundHalfUp(rangePx * MILLI_PX);
    const rangeSquared = BigInt(rangeMilli) * BigInt(rangeMilli);
    const anchorX = roundHalfUp(anchor.x * MILLI_PX);
    const anchorY = roundHalfUp(anchor.y * MILLI_PX);
    const aim = cordicVector(this.state.aimAnglesU16[towerIndex] ?? DEFAULT_AIM_ANGLE_U16);
    const aimNormSquared =
      BigInt(aim.xQ30) * BigInt(aim.xQ30) + BigInt(aim.yQ30) * BigInt(aim.yQ30);
    const halfAngle = cordicVector(this.bundle.tower.aimHalfAngleU16);
    const halfAngleNormSquared =
      BigInt(halfAngle.xQ30) * BigInt(halfAngle.xQ30) +
      BigInt(halfAngle.yQ30) * BigInt(halfAngle.yQ30);
    const halfAngleCosSquared = BigInt(halfAngle.xQ30) * BigInt(halfAngle.xQ30);

    const candidates: Array<{ enemy: EnemyState; preferred: boolean }> = [];
    for (const enemy of this.state.enemies) {
      if (enemy.hpMilli <= 0) continue;
      if (
        enemy.invulnerableUntilTick !== undefined &&
        this.state.tick < enemy.invulnerableUntilTick
      ) continue;
      const point = pointAtDistance(this.route, enemy.distanceMilli);
      if (point.yMilli < TARGETABLE_SCREEN_MIN_Y_PX * MILLI_PX) continue;
      const deltaX = point.xMilli - anchorX;
      const deltaY = point.yMilli - anchorY;
      const distanceSquared = squaredDistance(deltaX, deltaY);
      if (distanceSquared > rangeSquared) continue;

      const dot = BigInt(deltaX) * BigInt(aim.xQ30) + BigInt(deltaY) * BigInt(aim.yQ30);
      const preferred = dot >= 0n && (
        dot * dot * halfAngleNormSquared >=
        distanceSquared * aimNormSquared * halfAngleCosSquared
      );
      candidates.push({ enemy, preferred });
    }

    const targets = candidates
      .sort((left, right) =>
        Number(right.preferred) - Number(left.preferred) ||
        right.enemy.distanceMilli - left.enemy.distanceMilli ||
        left.enemy.entityId - right.enemy.entityId,
      )
      .map(({ enemy }) => enemy);

    return {
      targets,
      preferredEntityIds: new Set(
        candidates
          .filter((candidate) => candidate.preferred)
          .map((candidate) => candidate.enemy.entityId),
      ),
      enemiesInRange: candidates.length,
      preferredEnemiesInRange: candidates.reduce(
        (count, candidate) => count + Number(candidate.preferred),
        0,
      ),
    };
  }

  private updateProjectiles(output: SimulationOutput): void {
    const remaining: ProjectileState[] = [];
    const effectiveStats = deriveEffectiveTowerStats(
      this.bundle.tower,
      tierStats(this.state.level),
      this.state.stats,
      towerStatCaps(this.bundle),
    );
    for (const projectile of [...this.state.projectiles].sort((left, right) => left.entityId - right.entityId)) {
      if (projectile.bornTick === this.state.tick) {
        remaining.push(projectile);
        continue;
      }

      const target = this.state.enemies.find(
        (enemy) => enemy.entityId === projectile.targetEntityId && enemy.hpMilli > 0,
      );
      if (!target) {
        continue;
      }
      const targetPoint = pointAtDistance(this.route, target.distanceMilli);
      const deltaX = targetPoint.xMilli - projectile.xMilli;
      const deltaY = targetPoint.yMilli - projectile.yMilli;
      const distanceSquared = squaredDistance(deltaX, deltaY);
      const speedNumerator =
        projectile.movementRemainder + this.bundle.tower.projectileSpeedPxPerSecond * MILLI_PX;
      const stepMilli = Math.floor(speedNumerator / TICKS_PER_SECOND);
      projectile.movementRemainder = speedNumerator % TICKS_PER_SECOND;
      const definition = this.enemyDefinition(target.definitionId);
      const collisionRadiusMilli =
        (definition.radiusPx + this.bundle.tower.projectileRadiusPx) * MILLI_PX;
      const hitReachMilli = stepMilli + collisionRadiusMilli;
      if (distanceSquared > BigInt(hitReachMilli) * BigInt(hitReachMilli)) {
        const distanceMilli = Number(integerCeilSqrt(distanceSquared));
        projectile.xMilli += multiplyDivideTowardZero(deltaX, stepMilli, distanceMilli);
        projectile.yMilli += multiplyDivideTowardZero(deltaY, stepMilli, distanceMilli);
        remaining.push(projectile);
        continue;
      }

      const impactDistance = target.distanceMilli;
      this.applyDamage(
        target,
        projectile.damageMilli,
        projectile.critical,
        projectile.focused,
        projectile.towerId,
        0,
        output,
      );

      let penetratingDamage = projectile.damageMilli;
      const penetrationTargets = this.state.enemies
        .filter(
          (enemy) =>
            enemy.hpMilli > 0 &&
            enemy.entityId !== target.entityId &&
            enemy.distanceMilli <= impactDistance &&
            impactDistance - enemy.distanceMilli <= 180 * MILLI_PX,
        )
        .sort((left, right) => right.distanceMilli - left.distanceMilli || left.entityId - right.entityId)
        .slice(0, projectile.penetration);

      for (const [penetrationIndex, penetrationTarget] of penetrationTargets.entries()) {
        penetratingDamage = mulBp(penetratingDamage, effectiveStats.penetrationRetentionBp);
        this.applyDamage(
          penetrationTarget,
          Math.max(1, penetratingDamage),
          projectile.critical,
          projectile.focused,
          projectile.towerId,
          penetrationIndex + 1,
          output,
        );
      }
    }
    this.state.projectiles = remaining;
  }

  private applyDamage(
    enemy: EnemyState,
    rawDamageMilli: number,
    critical: boolean,
    focused: boolean,
    towerId: TowerId,
    penetrationIndex: number,
    output: SimulationOutput,
  ): void {
    if (enemy.hpMilli <= 0) {
      return;
    }
    if (
      enemy.invulnerableUntilTick !== undefined &&
      this.state.tick < enemy.invulnerableUntilTick
    ) {
      return;
    }
    const definition = this.enemyDefinition(enemy.definitionId);
    const guardAuraArmorBp = this.guardAuraArmorBpFor(enemy);
    const effectiveArmorBp = Math.min(
      8_500,
      definition.armorBp + guardAuraArmorBp,
    );
    const damageAfterArmor = Math.max(1, mulBp(rawDamageMilli, 10_000 - effectiveArmorBp));
    const ethereal = this.isEnemyEthereal(enemy, definition);
    const damageAfterPhase = ethereal
      ? Math.max(1, mulBp(damageAfterArmor, definition.etherealDamageTakenBp ?? 10_000))
      : damageAfterArmor;
    const phaseShell = this.isPhaseShellActive(enemy, definition);
    const phaseShellCap = phaseShell
      ? Math.max(1, mulBp(enemy.maxHpMilli, definition.phaseShellMaxHitDamageBp ?? 10_000))
      : damageAfterPhase;
    const actualDamage = Math.min(enemy.hpMilli, damageAfterPhase, phaseShellCap);
    const lethal = actualDamage === enemy.hpMilli;
    const mitigation = phaseShell && phaseShellCap < damageAfterPhase
      ? 'phase-shell'
      : ethereal
        ? 'ethereal'
        : guardAuraArmorBp > 0
          ? 'guard-aura'
          : definition.armorBp > 0
            ? 'armor'
            : 'none';
    const impactPoint = pointAtDistance(this.route, enemy.distanceMilli);
    const isEndlessBoss = battleMode(this.bundle) === 'endless' &&
      this.state.endless?.phase === 'boss' &&
      definition.id === this.requireEndlessRules().bossEnemyId;
    const nextDamageDealtMilli = this.checkedDamageCounterAdd(
      this.state.damageDealtMilli,
      actualDamage,
      'Battle damage counter',
    );
    const endless = isEndlessBoss ? this.requireEndlessState() : undefined;
    const nextBossDamageMilli = endless === undefined
      ? undefined
      : this.checkedDamageCounterAdd(
          endless.bossDamageMilli,
          actualDamage,
          'Endless boss damage counter',
        );
    const nextExperience = actualDamage === enemy.hpMilli && !isEndlessBoss
      ? this.checkedExperienceAdd(this.state.exp, enemy.expAward)
      : undefined;
    enemy.hpMilli -= actualDamage;
    this.state.damageDealtMilli = nextDamageDealtMilli;
    if (endless !== undefined && nextBossDamageMilli !== undefined) {
      endless.bossDamageMilli = nextBossDamageMilli;
      endless.scoreReachedTick = this.state.tick;
    }
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'HIT',
      entityId: enemy.entityId,
      towerId,
      penetrationIndex,
      impactX: impactPoint.xMilli / MILLI_PX,
      impactY: impactPoint.yMilli / MILLI_PX,
      damageMilli: actualDamage,
      critical,
      focused,
      lethal,
      mitigation,
    });
    if (focused) {
      this.gainOverdrive(OVERDRIVE_FOCUSED_HIT_CHARGE, output);
    }

    if (enemy.hpMilli === 0) {
      if (isEndlessBoss) {
        this.advanceEndlessBossLayer(enemy, output);
        return;
      }
      if (battleMode(this.bundle) === 'fixed') {
        this.state.scheduler.currentWaveKilled += 1;
      }
      this.state.exp = nextExperience!;
      this.gainOverdrive(OVERDRIVE_KILL_CHARGE, output);
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'DEATH',
        entityId: enemy.entityId,
        enemyId: enemy.definitionId,
        deathX: impactPoint.xMilli / MILLI_PX,
        deathY: impactPoint.yMilli / MILLI_PX,
        movement: definition.movement,
      });
      this.requestLevelIfReady(output);
    }
  }

  private advanceEndlessBossLayer(enemy: EnemyState, output: SimulationOutput): void {
    const rules = this.requireEndlessRules();
    const endless = this.requireEndlessState();
    if (enemy.definitionId !== rules.bossEnemyId || endless.phase !== 'boss') return;
    const nextMaxHpMilli = Math.min(
      rules.bossMaxHpMilli,
      mulBp(enemy.maxHpMilli, rules.bossLayerHpGrowthBp),
    );
    if (
      !Number.isSafeInteger(nextMaxHpMilli) ||
      nextMaxHpMilli <= 0 ||
      nextMaxHpMilli > MAX_ENEMY_HP_MILLI
    ) {
      throw new Error('Endless boss layer HP is outside the safe runtime bounds.');
    }
    const nextBossLayer = endless.bossLayer + 1;
    if (
      !Number.isSafeInteger(nextBossLayer) ||
      nextBossLayer > this.maximumEndlessBossLayerAtTick(this.state.tick + 1)
    ) {
      throw new Error('Endless boss layer sequence is outside the reachable runtime bounds.');
    }
    const entityId = this.takeNextEndlessEnemyId();
    endless.bossLayer = nextBossLayer;
    enemy.entityId = entityId;
    enemy.maxHpMilli = nextMaxHpMilli;
    enemy.hpMilli = enemy.maxHpMilli;
    enemy.distanceMilli = 0;
    enemy.movementRemainder = 0;
    enemy.ageTicks = 0;
    enemy.expAward = 0;
    enemy.speedMultiplierBp = 10_000;
    enemy.invulnerableUntilTick = this.checkedTickAdd(
      this.state.tick,
      rules.bossLayerGuardTicks,
      'Endless boss guard',
    );
    endless.bossEntityId = entityId;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'BOSS_LAYER_ADVANCED',
      ...this.endlessScorePayload(),
    });
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'SPAWN',
      entityId,
      enemyId: enemy.definitionId,
    });
  }

  private removeDeadEnemies(): void {
    const aliveIds = new Set(
      this.state.enemies.filter((enemy) => enemy.hpMilli > 0).map((enemy) => enemy.entityId),
    );
    this.state.enemies = this.state.enemies.filter((enemy) => enemy.hpMilli > 0);
    this.state.projectiles = this.state.projectiles.filter((projectile) =>
      aliveIds.has(projectile.targetEntityId),
    );
  }

  private checkBreach(output: SimulationOutput): void {
    if (this.state.flowState !== 'running' || this.state.reviveGuardRemainingTicks > 0) {
      return;
    }
    const breachedEnemies = [...this.state.enemies]
      .filter((enemy) => enemy.hpMilli > 0 && enemy.distanceMilli >= this.route.totalLengthMilli)
      .sort((left, right) => left.entityId - right.entityId);
    const firstBreached = breachedEnemies[0];
    if (!firstBreached) {
      return;
    }

    if (battleMode(this.bundle) === 'endless') {
      this.state.gateIntegrity = 0;
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'BREACH',
        entityId: firstBreached.entityId,
        enemyId: firstBreached.definitionId,
        damage: 1,
        gateIntegrityRemaining: 0,
        gateIntegrityMax: 1,
      });
      this.state.flowState = 'defeat-pending';
      this.state.outcome = 'defeat';
      if (this.state.revivesUsed < this.bundle.rules.maxRevives) {
        output.flowRequests.push({
          type: 'REVIVE',
          ordinal: this.state.revivesUsed + 1,
          tick: this.state.tick,
        });
      } else {
        this.settleEndless('breach', output);
      }
      return;
    }

    const breachedIds = new Set<number>();
    const maximumIntegrity = gateIntegrityMax(this.bundle);
    for (const breached of breachedEnemies) {
      const definition = this.enemyDefinition(breached.definitionId);
      const damage = Math.min(
        maximumIntegrity,
        definition.breachDamage ?? (definition.movement === 'flying' ? 22 : 18),
      );
      this.state.gateIntegrity = Math.max(0, this.state.gateIntegrity - damage);
      this.state.scheduler.currentWaveKilled += 1;
      breachedIds.add(breached.entityId);
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'BREACH',
        entityId: breached.entityId,
        enemyId: breached.definitionId,
        damage,
        gateIntegrityRemaining: this.state.gateIntegrity,
        gateIntegrityMax: maximumIntegrity,
      });
    }
    this.state.enemies = this.state.enemies.filter(
      (enemy) => !breachedIds.has(enemy.entityId),
    );
    this.state.projectiles = this.state.projectiles.filter(
      (projectile) => !breachedIds.has(projectile.targetEntityId),
    );
    if (this.state.gateIntegrity > 0) {
      return;
    }

    this.state.flowState = 'defeat-pending';
    this.state.outcome = 'defeat';
    this.state.overdriveTowerId = null;
    this.state.overdriveRemainingTicks = 0;
    if (this.state.revivesUsed < this.bundle.rules.maxRevives) {
      output.flowRequests.push({
        type: 'REVIVE',
        ordinal: this.state.revivesUsed + 1,
        tick: this.state.tick,
      });
    } else {
      this.finishDefeat(output);
    }
  }

  private resolveWave(output: SimulationOutput): void {
    const scheduler = this.state.scheduler;
    if (
      this.state.flowState === 'defeat-pending' ||
      this.state.outcome === 'defeat' ||
      !scheduler.allGroupsSpawned ||
      this.state.enemies.length > 0 ||
      scheduler.victoryPending
    ) {
      return;
    }

    scheduler.completedWaves += 1;
    if (scheduler.waveIndex === this.bundle.waves.length - 1) {
      if (this.state.flowState === 'offer-pending') {
        scheduler.victoryPending = true;
      } else if (this.state.flowState === 'running') {
        this.finishVictory(output);
      }
      return;
    }

    scheduler.waveIndex += 1;
    scheduler.groupIndex = 0;
    scheduler.unitIndex = 0;
    scheduler.nextSpawnTick = this.checkedTickAdd(
      this.state.tick,
      this.bundle.rules.waveGapTicks,
      'Fixed wave gap',
    );
    scheduler.allGroupsSpawned = false;
    scheduler.currentWaveSpawned = 0;
    scheduler.currentWaveKilled = 0;
  }

  private requestLevelIfReady(output: SimulationOutput): void {
    if (this.state.flowState === 'offer-pending' || this.state.level >= this.bundle.rules.maxLevel) {
      if (this.state.level >= this.bundle.rules.maxLevel) {
        this.state.exp = 0;
      }
      return;
    }

    const needed = requiredExp(this.state.level, this.bundle.rules.maxLevel);
    if (needed === 0 || this.state.exp < needed) {
      return;
    }
    this.state.exp -= needed;
    this.state.level += 1;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'LEVEL_UP',
      level: this.state.level,
    });
    const eligibleEffectIds = this.eligibleCardEffectIds();
    if (eligibleEffectIds.length === 0) {
      this.requestLevelIfReady(output);
      return;
    }
    this.state.flowState = 'offer-pending';
    output.flowRequests.push({
      type: 'OFFER',
      ordinal: this.state.level,
      tick: this.state.tick,
      eligibleEffectIds,
    });
  }

  private eligibleCardEffectIds(): CardEffectId[] {
    const caps = towerStatCaps(this.bundle);
    const effective = deriveEffectiveTowerStats(
      this.bundle.tower,
      tierStats(this.state.level),
      this.state.stats,
      caps,
    );
    const eligible: CardEffectId[] = [];
    if (this.state.stats.damageBonusBp < MAX_DAMAGE_BONUS_BP) eligible.push('tower-damage');
    if (
      this.state.stats.frequencyBonusBp < MAX_FREQUENCY_BONUS_BP &&
      effective.attackIntervalTicks > MIN_ATTACK_INTERVAL_TICKS
    ) eligible.push('tower-frequency');
    if (
      this.state.stats.arrowCountAdd < MAX_ARROW_COUNT_ADD &&
      effective.arrowCount < caps.arrowCount
    ) eligible.push('arrow-count');
    if (
      this.state.stats.penetrationAdd < MAX_PENETRATION_ADD &&
      effective.penetrationCount < caps.penetrationCount
    ) eligible.push('penetration');
    if (
      this.state.stats.critChanceAddBp < MAX_CRIT_CHANCE_ADD_BP &&
      effective.critChanceBp < MAX_CRIT_CHANCE_BP
    ) eligible.push('crit-rate');
    if (
      this.state.stats.critDamageAddBp < MAX_CRIT_DAMAGE_ADD_BP &&
      effective.critDamageBp < MAX_CRIT_DAMAGE_BP
    ) eligible.push('crit-damage');
    return eligible;
  }

  private applyOfferGranted(event: OfferGranted): void {
    if (this.state.flowState !== 'offer-pending') {
      throw new Error('Offer authority event arrived without a pending level-up request.');
    }
    const currentOffer = this.state.activeOffer;
    if (
      (currentOffer === null && event.replacesOfferId !== undefined) ||
      (currentOffer !== null && event.replacesOfferId !== currentOffer.offerId)
    ) {
      throw new Error(
        `Offer ${event.offerId} does not replace the current offer ${currentOffer?.offerId ?? 'none'}.`,
      );
    }
    for (const cardId of event.cards) {
      if (this.cardDefinition(cardId) === undefined) {
        throw new Error(`Offer ${event.offerId} contains unknown card ${cardId}.`);
      }
    }
    this.state.activeOffer = copyOffer(event);
  }

  private applyCardChoice(offerId: string, cardId: string, output: SimulationOutput): void {
    const offer = this.state.activeOffer;
    if (this.state.flowState !== 'offer-pending' || offer === null || offer.offerId !== offerId) {
      throw new Error(`Card choice references inactive offer ${offerId}.`);
    }
    if (!offer.cards.includes(cardId)) {
      throw new Error(`Card ${cardId} is not part of offer ${offerId}.`);
    }
    const card = this.cardDefinition(cardId);
    if (!card) {
      throw new Error(`Unknown card ${cardId}.`);
    }
    this.applyCardEffect(card);
    this.state.activeOffer = null;
    this.state.flowState = 'running';
    this.requestLevelIfReady(output);
    if (this.state.flowState === 'running' && this.state.scheduler.victoryPending) {
      this.finishVictory(output);
    }
    if (this.state.flowState === 'running' && battleMode(this.bundle) === 'endless') {
      this.advanceEndlessMilestones(output);
    }
  }

  private applyCardEffect(card: CardDefinition): void {
    this.state.stats = applyCardEffectToStats(this.state.stats, card).stats;
  }

  private applyRevive(reviveOrdinal: number, output: SimulationOutput): void {
    const expectedOrdinal = this.state.revivesUsed + 1;
    if (
      this.state.flowState !== 'defeat-pending' ||
      reviveOrdinal !== expectedOrdinal ||
      reviveOrdinal > this.bundle.rules.maxRevives
    ) {
      throw new Error(`Invalid revive ordinal ${reviveOrdinal}; expected ${expectedOrdinal}.`);
    }

    const rollback = mulBp(this.route.totalLengthMilli, this.bundle.rules.reviveGroundRollbackBp);
    const removedFlying = this.state.enemies.filter(
      (enemy) => this.enemyDefinition(enemy.definitionId).movement === 'flying',
    );
    for (const enemy of this.state.enemies) {
      if (this.enemyDefinition(enemy.definitionId).movement === 'ground') {
        enemy.distanceMilli = Math.max(0, enemy.distanceMilli - rollback);
      }
    }
    this.state.enemies = this.state.enemies.filter(
      (enemy) => this.enemyDefinition(enemy.definitionId).movement === 'ground',
    );
    const removedFlyingIds = new Set(removedFlying.map((enemy) => enemy.entityId));
    this.state.projectiles = this.state.projectiles.filter(
      (projectile) => !removedFlyingIds.has(projectile.targetEntityId),
    );
    if (battleMode(this.bundle) === 'fixed') {
      this.state.scheduler.currentWaveKilled += removedFlying.length;
    }
    for (const enemy of removedFlying) {
      const definition = this.enemyDefinition(enemy.definitionId);
      const deathPoint = pointAtDistance(this.route, enemy.distanceMilli);
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'DEATH',
        entityId: enemy.entityId,
        enemyId: enemy.definitionId,
        deathX: deathPoint.xMilli / MILLI_PX,
        deathY: deathPoint.yMilli / MILLI_PX,
        movement: definition.movement,
      });
    }

    this.state.revivesUsed += 1;
    this.state.reviveGuardRemainingTicks = this.bundle.rules.reviveGuardTicks;
    this.state.speed = 1;
    this.state.wallTickRemainder = 0;
    this.state.flowState = 'running';
    this.state.outcome = null;
    const maximumIntegrity = gateIntegrityMax(this.bundle);
    this.state.gateIntegrity = battleMode(this.bundle) === 'endless'
      ? 1
      : Math.max(1, mulBp(maximumIntegrity, reviveGateRestoreBp(this.bundle)));
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'REVIVED',
      gateIntegrityRemaining: this.state.gateIntegrity,
      gateIntegrityMax: maximumIntegrity,
    });
    if (battleMode(this.bundle) === 'endless') {
      this.advanceEndlessMilestones(output);
    }
  }

  private finishVictory(output: SimulationOutput): void {
    if (battleMode(this.bundle) === 'endless') {
      throw new Error('Endless stages cannot resolve as VICTORY.');
    }
    this.state.scheduler.victoryPending = false;
    this.state.flowState = 'result';
    this.state.outcome = 'victory';
    this.state.overdriveTowerId = null;
    this.state.overdriveRemainingTicks = 0;
    output.events.push({ eventId: this.nextEventId(), tick: this.state.tick, type: 'VICTORY' });
  }

  private finishDefeat(output: SimulationOutput): void {
    if (battleMode(this.bundle) === 'endless') {
      throw new Error('Endless stages settle through ENDLESS_SETTLED.');
    }
    this.state.flowState = 'result';
    this.state.outcome = 'defeat';
    this.state.activeOffer = null;
    this.state.projectiles = [];
    this.state.wallTickRemainder = 0;
    this.state.overdriveTowerId = null;
    this.state.overdriveRemainingTicks = 0;
    output.events.push({ eventId: this.nextEventId(), tick: this.state.tick, type: 'DEFEAT' });
  }

  private nextRandomBp(): number {
    this.state.rngState = xorshift32(this.state.rngState);
    return Math.floor((this.state.rngState * 10_000) / UINT32_MAX_PLUS_ONE);
  }

  private nextEventId(): string {
    if (
      !Number.isSafeInteger(this.state.eventSeq) ||
      this.state.eventSeq < 0 ||
      this.state.eventSeq >= Number.MAX_SAFE_INTEGER
    ) {
      throw new Error('Battle event sequence is exhausted.');
    }
    const eventId = `${this.state.tick}:sim:${this.state.eventSeq}`;
    this.state.eventSeq += 1;
    return eventId;
  }

  private enemyDefinition(enemyId: string) {
    const definition = this.bundle.enemies[enemyId];
    if (!definition) {
      throw new Error(`Unknown enemy definition ${enemyId}.`);
    }
    return definition;
  }

  private isEnemyEnraged(
    enemy: EnemyState,
    definition = this.enemyDefinition(enemy.definitionId),
  ): boolean {
    const thresholdBp = definition.enrageBelowHpBp;
    return thresholdBp !== undefined && enemy.hpMilli * 10_000 <= enemy.maxHpMilli * thresholdBp;
  }

  private isPhaseShellActive(
    enemy: EnemyState,
    definition = this.enemyDefinition(enemy.definitionId),
  ): boolean {
    const thresholdBp = definition.phaseShellAboveHpBp;
    return thresholdBp !== undefined && enemy.hpMilli * 10_000 > enemy.maxHpMilli * thresholdBp;
  }

  private isEnemyEthereal(
    enemy: EnemyState,
    definition = this.enemyDefinition(enemy.definitionId),
  ): boolean {
    const cycleTicks = definition.etherealCycleTicks;
    const solidTicks = definition.etherealSolidTicks;
    if (cycleTicks === undefined || solidTicks === undefined) return false;
    const phaseOffset = xorshift32(enemy.entityId >>> 0) % cycleTicks;
    return (enemy.ageTicks + phaseOffset) % cycleTicks >= solidTicks;
  }

  private guardAuraArmorBpFor(enemy: EnemyState): number {
    let strongestAuraBp = 0;
    for (const source of this.state.enemies) {
      if (source.entityId === enemy.entityId || source.hpMilli <= 0) continue;
      const sourceDefinition = this.enemyDefinition(source.definitionId);
      const auraArmorBp = sourceDefinition.guardAuraArmorBp;
      const auraRadiusPx = sourceDefinition.guardAuraRadiusPx;
      if (auraArmorBp === undefined || auraRadiusPx === undefined) continue;
      if (Math.abs(source.distanceMilli - enemy.distanceMilli) > auraRadiusPx * MILLI_PX) continue;
      strongestAuraBp = Math.max(strongestAuraBp, auraArmorBp);
    }
    return strongestAuraBp;
  }

  private cardDefinition(cardId: string): CardDefinition | undefined {
    return this.bundle.cards.find((card) => card.id === cardId);
  }
}

export function createBattleSimulation(
  bundle: BattleBundleV1,
  seed: number,
  checkpoint?: Uint8Array,
): BattleSimulation {
  return new BattleSimulationImpl(bundle, seed, checkpoint);
}
