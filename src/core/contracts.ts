export const PROTOCOL_VERSION = 1 as const;
export const TICKS_PER_SECOND = 30 as const;
export const DESIGN_WIDTH = 1920 as const;
export const DESIGN_HEIGHT = 1080 as const;
export const DEFAULT_AIM_ANGLE_U16 = 32_768 as const;
export const RENDER_SNAPSHOT_HEADER_I32 = 5 as const;
export const RENDER_ENTITY_STRIDE_I32 = 10 as const;
export const PROJECTILE_FLAG_CRITICAL = 0b0001 as const;
export const PROJECTILE_FLAG_PENETRATION = 0b0010 as const;
export const PROJECTILE_FLAG_FOCUSED = 0b0100 as const;
export const PROJECTILE_FLAG_TOWER_ID_SHIFT = 8 as const;
export const PROJECTILE_FLAG_TOWER_ID_MASK = 0b11_0000_0000 as const;
export const ENEMY_FLAG_FLYING = 0b0001 as const;
export const ENEMY_FLAG_ENRAGED = 0b0010 as const;
export const ENEMY_FLAG_GUARD_AURA = 0b0100 as const;
export const ENEMY_FLAG_GUARDED = 0b1000 as const;
export const ENEMY_FLAG_PHASE_SHELL = 0b1_0000 as const;
export const ENEMY_FLAG_ETHEREAL = 0b10_0000 as const;

export type BattleFlowState =
  | 'idle'
  | 'loading'
  | 'running'
  | 'paused'
  | 'offer-pending'
  | 'defeat-pending'
  | 'suspended'
  | 'performance-paused'
  | 'settling'
  | 'result';

export interface Point {
  x: number;
  y: number;
}

export type BattleStageId =
  | 'STAGE_01'
  | 'STAGE_02'
  | 'STAGE_03'
  | 'STAGE_04'
  | 'STAGE_05'
  | 'STAGE_06'
  | 'STAGE_07'
  | 'STAGE_08';
export const BATTLE_STAGE_ORDER = [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
  'STAGE_08',
] as const satisfies readonly BattleStageId[];
export type BattleMode = 'fixed' | 'endless';
export type BattleOutcome = 'victory' | 'defeat' | 'settled';
export type EndlessPhase = 'survival' | 'boss' | 'settled';
export type EndlessSettlementReason = 'time-limit' | 'breach' | 'manual';
export type TowerId = 0 | 1 | 2;
export type TowerAimAnglesU16 = [number, number, number];

export interface RouteDefinition {
  id: string;
  points: Point[];
  towerAnchors: [Point, Point, Point];
  breachPoint: Point;
}

export interface TowerDefinition {
  baseDamageMilli: number;
  attackIntervalTicks: number;
  rangePx: number;
  aimHalfAngleU16: number;
  projectileSpeedPxPerSecond: number;
  projectileRadiusPx: number;
  baseArrowCount: number;
  basePenetration: number;
  penetrationRetentionBp: number;
  critChanceBp: number;
  critDamageBp: number;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  maxHpMilli: number;
  speedPxPerSecond: number;
  radiusPx: number;
  exp: number;
  armorBp: number;
  controlResistanceBp: number;
  movement: 'ground' | 'flying';
  renderAssetId: string;
  renderScaleBp?: number;
  enrageBelowHpBp?: number;
  enrageSpeedMultiplierBp?: number;
  guardAuraArmorBp?: number;
  guardAuraRadiusPx?: number;
  phaseShellAboveHpBp?: number;
  phaseShellMaxHitDamageBp?: number;
  etherealCycleTicks?: number;
  etherealSolidTicks?: number;
  etherealDamageTakenBp?: number;
  /** Damage dealt to fixed-stage gate integrity when this enemy reaches the breach point. */
  breachDamage?: number;
}

export interface WaveGroupDefinition {
  enemyId: string;
  count: number;
  intervalTicks: number;
}

export interface WaveDefinition {
  id: string;
  index: number;
  hpMultiplierBp: number;
  expMultiplierBp: number;
  speedMultiplierBp?: number;
  groups: WaveGroupDefinition[];
}

export type CardEffectId =
  | 'tower-damage'
  | 'tower-frequency'
  | 'arrow-count'
  | 'penetration'
  | 'crit-rate'
  | 'crit-damage';

export interface CardDefinition {
  id: string;
  name: string;
  quality: 'G' | 'B' | 'P';
  effectId: CardEffectId;
  valueBp?: number;
  valueInt?: number;
  iconAssetId: string;
}

export interface EndlessThreatEntryV1 {
  enemyId: string;
  unlockTick: number;
  threatCost: number;
}

export interface EndlessRulesV1 {
  routes: [RouteDefinition, RouteDefinition, RouteDefinition];
  threatEntries: EndlessThreatEntryV1[];
  miniBossEnemyIds: [string, string, string];
  bossEnemyId: string;
  bossSummonEnemyId: string;
  bossSummonIntervalTicks: number;
  threatStartTick: number;
  bossPhaseTick: number;
  settlementTick: number;
  threatPackIntervalTicks: number;
  unitIntervalTicks: number;
  maxPackSize: number;
  maxActiveEnemies: number;
  miniBossTicks: [number, number, number];
  bossLayerGuardTicks: number;
  bossLayerHpGrowthBp: number;
  bossMaxHpMilli: number;
  /** Quantized threat multiplier for second 0 through second 1200, inclusive. */
  threatLutBp: number[];
}

export interface BattleBundleV1 {
  schemaVersion: 1;
  releaseId: string;
  configHash: string;
  /** Omitted by legacy content; omitted is equivalent to `fixed`. */
  mode?: BattleMode;
  stage: {
    id: BattleStageId;
    name: string;
    backgroundAssetId: string;
  };
  route: RouteDefinition;
  tower: TowerDefinition;
  enemies: Record<string, EnemyDefinition>;
  waves: WaveDefinition[];
  cards: CardDefinition[];
  endless?: EndlessRulesV1;
  rules: {
    maxLevel: number;
    groupGapTicks: number;
    waveGapTicks: number;
    reviveGuardTicks: number;
    reviveGroundRollbackBp: number;
    maxRevives: number;
    /** Fixed-stage gate durability. Omitted keeps legacy one-breach defeat semantics. */
    gateIntegrity?: number;
    /** Fixed-stage gate integrity restored by revive, as basis points of maximum integrity. */
    reviveGateRestoreBp?: number;
    /** Extra damage for enemies inside the manually aimed cone. */
    focusDamageBonusBp?: number;
    /** Fixed-stage total arrow cap after cards. Omitted keeps the engine maximum. */
    arrowCountCap?: number;
    /** Fixed-stage penetration cap after cards. Omitted keeps the engine maximum. */
    penetrationCap?: number;
    /** Per-extra-arrow damage falloff in basis points; preserves projectile density without linear DPS. */
    volleyDamageFalloffBp?: number;
    /** Duration of shared tower overdrive; fixed stages default to 5 seconds and zero disables it. */
    overdriveDurationTicks?: number;
  };
}

export type BattleCommand =
  | { seq: number; type: 'SET_AIM'; towerId: TowerId; angleU16: number }
  | { seq: number; type: 'ACTIVATE_OVERDRIVE'; towerId: TowerId }
  | { seq: number; type: 'SET_SPEED'; value: 1 | 2 }
  | { seq: number; type: 'PAUSE' }
  | { seq: number; type: 'RESUME' }
  | { seq: number; type: 'FORFEIT' };

export interface OfferGranted {
  type: 'OFFER_GRANTED';
  authoritySeq: number;
  authorizationId: string;
  offerId: string;
  replacesOfferId?: string;
  cards: [string, string, string];
}

export interface CardChoiceAccepted {
  type: 'CARD_CHOICE_ACCEPTED';
  authoritySeq: number;
  authorizationId: string;
  offerId: string;
  cardId: string;
}

export interface ReviveGranted {
  type: 'REVIVE_GRANTED';
  authoritySeq: number;
  authorizationId: string;
  reviveOrdinal: number;
}

export type AuthorityEventV1 = OfferGranted | CardChoiceAccepted | ReviveGranted;

export interface EndlessScoreV1 {
  routeId: string;
  reachedBoss: boolean;
  survivalTick: number;
  bossLayer: number;
  /** Cumulative actual damage dealt to Abyss Dragon layers, in milli HP. */
  bossDamageMilli: number;
  /** Tick at which the current survival/damage score was most recently increased. */
  scoreReachedTick: number;
}

export type HitMitigationV1 = 'none' | 'armor' | 'guard-aura' | 'phase-shell' | 'ethereal';

export type BattleEvent =
  | { eventId: string; tick: number; type: 'SPAWN'; entityId: number; enemyId: string }
  | {
      eventId: string;
      tick: number;
      type: 'ATTACK_RELEASE';
      towerId: number;
      releaseRotationU16: number;
      focused: boolean;
      arrowCount: number;
    }
  | {
      eventId: string;
      tick: number;
      type: 'HIT';
      entityId: number;
      towerId: TowerId;
      penetrationIndex: number;
      impactX: number;
      impactY: number;
      damageMilli: number;
      critical: boolean;
      focused: boolean;
      lethal: boolean;
      mitigation: HitMitigationV1;
    }
  | {
      eventId: string;
      tick: number;
      type: 'DEATH';
      entityId: number;
      enemyId: string;
      deathX: number;
      deathY: number;
      movement: EnemyDefinition['movement'];
    }
  | { eventId: string; tick: number; type: 'LEVEL_UP'; level: number }
  | {
      eventId: string;
      tick: number;
      type: 'BREACH';
      entityId: number;
      enemyId: string;
      damage: number;
      gateIntegrityRemaining: number;
      gateIntegrityMax: number;
    }
  | {
      eventId: string;
      tick: number;
      type: 'REVIVED';
      gateIntegrityRemaining: number;
      gateIntegrityMax: number;
    }
  | { eventId: string; tick: number; type: 'VICTORY' }
  | { eventId: string; tick: number; type: 'DEFEAT' }
  | { eventId: string; tick: number; type: 'OVERDRIVE_READY' }
  | {
      eventId: string;
      tick: number;
      type: 'OVERDRIVE_ACTIVATED';
      towerId: TowerId;
      durationTicks: number;
    }
  | { eventId: string; tick: number; type: 'OVERDRIVE_ENDED'; towerId: TowerId }
  | ({
      eventId: string;
      tick: number;
      type: 'ENDLESS_PHASE_CHANGED';
      phase: EndlessPhase;
    } & EndlessScoreV1)
  | ({
      eventId: string;
      tick: number;
      type: 'BOSS_LAYER_ADVANCED';
    } & EndlessScoreV1)
  | ({
      eventId: string;
      tick: number;
      type: 'ENDLESS_SETTLED';
      reason: EndlessSettlementReason;
    } & EndlessScoreV1);

export interface RenderEntityV1 {
  entityId: number;
  renderKind: 'enemy' | 'projectile';
  assetId: string;
  x: number;
  y: number;
  rotationU16: number;
  scaleBp: number;
  sortY: number;
  hpBp: number;
  flags: number;
}

export interface RenderSnapshotV1 {
  protocolVersion: 1;
  workerEpoch: number;
  snapshotSeq: number;
  tick: number;
  towerFacingsU16: TowerAimAnglesU16;
  entities: RenderEntityV1[];
}

export interface PackedRenderSnapshotHeaderV1 {
  protocolVersion: 1;
  workerEpoch: number;
  snapshotSeq: number;
  tick: number;
  entityCount: number;
}

export interface PackedRenderEntityV1 {
  entityId: number;
  renderKind: 0 | 1;
  assetIndex: number;
  xQ16: number;
  yQ16: number;
  rotationU16: number;
  scaleBp: number;
  sortY: number;
  hpBp: number;
  flags: number;
}

export interface EffectiveTowerStatsV1 {
  damagePerArrowMilli: number;
  criticalDamagePerArrowMilli: number;
  attackIntervalTicks: number;
  attackRateMilliPerSecond: number;
  rangePx: number;
  arrowCount: number;
  penetrationCount: number;
  penetrationRetentionBp: number;
  critChanceBp: number;
  critDamageBp: number;
}

export interface TowerStatsProjectionV1 {
  base: EffectiveTowerStatsV1;
  afterLevel: EffectiveTowerStatsV1;
  current: EffectiveTowerStatsV1;
}

export interface TowerCardPreviewV1 {
  cardId: string;
  before: EffectiveTowerStatsV1;
  after: EffectiveTowerStatsV1;
  capped: boolean;
}

export interface TowerRuntimeProjectionV1 {
  towerId: TowerId;
  currentTargetEntityId?: number;
  currentTargetName?: string;
  enemiesInRange: number;
  preferredEnemiesInRange: number;
}

export interface EndlessHudProjectionV1 extends EndlessScoreV1 {
  phase: EndlessPhase;
  settlementReason: EndlessSettlementReason | null;
  survivalEndTick: number;
  hardEndTick: number;
  threatTier: number;
  nextThreatTick?: number;
  nextEliteTick?: number;
  bossHpMilli?: number;
  bossMaxHpMilli?: number;
  activeEnemyCount: number;
  queuedEnemyCount: number;
  threatPackOrdinal: number;
}

export interface OverdriveHudProjectionV1 {
  charge: number;
  maxCharge: number;
  ready: boolean;
  activeTowerId: TowerId | null;
  remainingTicks: number;
  durationTicks: number;
}

export interface HudProjectionV1 {
  tick: number;
  lastCommandSeq: number;
  flowState: BattleFlowState;
  mode: BattleMode;
  outcome: BattleOutcome | null;
  speed: 1 | 2;
  level: number;
  exp: number;
  expRequired: number;
  waveIndex: number;
  waveCount: number;
  progressBp: number;
  aimAnglesU16: TowerAimAnglesU16;
  revivesUsed: number;
  gateIntegrity: number;
  gateIntegrityMax: number;
  overdrive: OverdriveHudProjectionV1;
  damageDealtMilli: number;
  towerStats: TowerStatsProjectionV1;
  towerRuntime: TowerRuntimeProjectionV1[];
  endless?: EndlessHudProjectionV1;
  activeOffer?: OfferGranted;
  offerPreviews?: TowerCardPreviewV1[];
}

export type MainToWorker =
  | {
      protocolVersion: 1;
      workerEpoch: number;
      type: 'INIT_BATTLE';
      bundle: BattleBundleV1;
      seed: number;
      checkpoint?: Uint8Array;
      checkpointRevision?: number;
    }
  | { protocolVersion: 1; workerEpoch: number; type: 'LIVE_COMMAND'; command: BattleCommand }
  | { protocolVersion: 1; workerEpoch: number; type: 'APPLY_AUTHORITY_EVENT'; event: AuthorityEventV1 }
  | { protocolVersion: 1; workerEpoch: number; type: 'ADVANCE_WALL_TIME'; milliseconds: number }
  | { protocolVersion: 1; workerEpoch: number; type: 'REQUEST_CHECKPOINT' }
  | { protocolVersion: 1; workerEpoch: number; type: 'RELEASE_SNAPSHOT_BUFFER'; buffer: ArrayBuffer }
  | { protocolVersion: 1; workerEpoch: number; type: 'DISPOSE_BATTLE' };

export type WorkerToMain =
  | { protocolVersion: 1; workerEpoch: number; type: 'WORKER_READY' }
  | { protocolVersion: 1; workerEpoch: number; type: 'COMMAND_ACK'; seq: number; appliedTick: number; status: 'applied' | 'duplicate' | 'rejected' }
  | {
      protocolVersion: 1;
      workerEpoch: number;
      type: 'FLOW_REQUEST';
      request:
        | { type: 'OFFER'; ordinal: number; tick: number; eligibleEffectIds: CardEffectId[] }
        | { type: 'REVIVE'; ordinal: number; tick: number };
    }
  | { protocolVersion: 1; workerEpoch: number; type: 'RENDER_SNAPSHOT'; buffer: ArrayBuffer; byteLength: number }
  | { protocolVersion: 1; workerEpoch: number; type: 'BATTLE_EVENT_BATCH'; events: BattleEvent[] }
  | { protocolVersion: 1; workerEpoch: number; type: 'HUD_PROJECTION'; projection: HudProjectionV1 }
  | { protocolVersion: 1; workerEpoch: number; type: 'CHECKPOINT_READY'; revision: number; payload: Uint8Array }
  | { protocolVersion: 1; workerEpoch: number; type: 'WORKER_FATAL'; code: string; message: string };
