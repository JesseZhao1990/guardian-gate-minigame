import {
  BATTLE_STAGE_ORDER,
  DEFAULT_AIM_ANGLE_U16,
  ENEMY_FLAG_ENRAGED,
  ENEMY_FLAG_FLYING,
  ENEMY_FLAG_GUARD_AURA,
  ENEMY_FLAG_GUARDED,
  ENEMY_FLAG_PHASE_SHELL,
  PROJECTILE_FLAG_CRITICAL,
  PROJECTILE_FLAG_PENETRATION,
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  TICKS_PER_SECOND,
  type AuthorityEventV1,
  type BattleBundleV1,
  type BattleCommand,
  type BattleEvent,
  type BattleFlowState,
  type CardDefinition,
  type HudProjectionV1,
  type OfferGranted,
  type Point,
  type RenderEntityV1,
  type RenderSnapshotV1,
  type TowerAimAnglesU16,
} from './contracts';

const CHECKPOINT_SCHEMA_VERSION = 3;
const LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION = 2;
const MILLI_PX = 1_000;
const TARGETABLE_SCREEN_MIN_Y_PX = 64;
const U16_TURN = 65_536;
const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;
const CORDIC_QUARTER_TURN = U16_TURN / 4;
const CORDIC_HALF_TURN = U16_TURN / 2;
const CORDIC_INITIAL_X_Q30 = 652_032_874;
const CORDIC_ATAN_U16 = [8_192, 4_836, 2_555, 1_297, 651, 326, 163, 81, 41, 20, 10, 5, 3, 1, 1] as const;

export interface CommandAck {
  seq: number;
  appliedTick: number;
  status: 'applied' | 'duplicate' | 'rejected';
}

export interface FlowRequest {
  type: 'OFFER' | 'REVIVE';
  ordinal: number;
  tick: number;
}

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
}

interface ProjectileState {
  entityId: number;
  towerId: number;
  targetEntityId: number;
  bornTick: number;
  xMilli: number;
  yMilli: number;
  movementRemainder: number;
  damageMilli: number;
  critical: boolean;
  penetration: number;
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

interface SerializableState {
  tick: number;
  speed: 1 | 2;
  flowState: BattleFlowState;
  aimAnglesU16: TowerAimAnglesU16;
  towerCooldowns: number[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  scheduler: SchedulerState;
  level: number;
  exp: number;
  stats: PlayerStats;
  activeOffer: OfferGranted | null;
  revivesUsed: number;
  reviveGuardRemainingTicks: number;
  damageDealtMilli: number;
  rngState: number;
  initialSeed: number;
  lastCommandSeq: number;
  lastAuthoritySeq: number;
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

type LegacySharedAimState = Omit<SerializableState, 'aimAnglesU16'> & {
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
    if (command.seq <= this.state.lastCommandSeq) {
      output.commandAcks.push({ seq: command.seq, appliedTick: this.state.tick, status: 'duplicate' });
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
      case 'SET_SPEED':
        if (this.state.flowState === 'result') {
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
    }

    output.commandAcks.push({ seq: command.seq, appliedTick: this.state.tick, status });
    return output;
  }

  applyAuthorityEvent(event: AuthorityEventV1): SimulationOutput {
    const output = emptyOutput();
    if (event.authoritySeq <= this.state.lastAuthoritySeq) {
      return output;
    }
    if (event.authoritySeq !== this.state.lastAuthoritySeq + 1) {
      throw new Error(
        `Authority sequence gap: expected ${this.state.lastAuthoritySeq + 1}, received ${event.authoritySeq}.`,
      );
    }

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
    const numerator =
      this.state.wallTickRemainder + microseconds * TICKS_PER_SECOND * this.state.speed;
    const ticks = Math.floor(numerator / 1_000_000);
    this.state.wallTickRemainder = numerator % 1_000_000;
    return this.advanceTicks(ticks);
  }

  advanceTicks(ticks: number): SimulationOutput {
    if (!Number.isInteger(ticks) || ticks < 0) {
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
    const waveCount = this.bundle.waves.length;
    const currentWave = this.bundle.waves[this.state.scheduler.waveIndex];
    const totalInWave = currentWave?.groups.reduce((sum, group) => sum + group.count, 0) ?? 1;
    const waveFraction = this.state.scheduler.currentWaveKilled / totalInWave;
    const progressBp =
      this.state.flowState === 'result' && this.state.scheduler.completedWaves === waveCount
        ? 10_000
        : clamp(
            roundHalfUp(
              ((this.state.scheduler.completedWaves + waveFraction) * 10_000) / Math.max(1, waveCount),
            ),
            0,
            10_000,
          );

    const projection = {
      tick: this.state.tick,
      flowState: this.state.flowState,
      speed: this.state.speed,
      level: this.state.level,
      exp: this.state.exp,
      expRequired: requiredExp(this.state.level, this.bundle.rules.maxLevel),
      waveIndex: Math.min(this.state.scheduler.waveIndex + 1, waveCount),
      waveCount,
      progressBp,
      aimAnglesU16: [...this.state.aimAnglesU16] as TowerAimAnglesU16,
      revivesUsed: this.state.revivesUsed,
      damageDealtMilli: this.state.damageDealtMilli,
    } satisfies Omit<HudProjectionV1, 'activeOffer'>;

    return this.state.activeOffer === null
      ? projection
      : { ...projection, activeOffer: copyOffer(this.state.activeOffer) };
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
          (this.isPhaseShellActive(enemy, definition) ? ENEMY_FLAG_PHASE_SHELL : 0),
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
      tick: this.state.tick,
      flowState: this.state.flowState,
      aimAnglesU16: this.state.aimAnglesU16,
      towerCooldowns: this.state.towerCooldowns,
      enemies: [...this.state.enemies].sort((left, right) => left.entityId - right.entityId),
      projectiles: [...this.state.projectiles].sort((left, right) => left.entityId - right.entityId),
      scheduler: this.state.scheduler,
      level: this.state.level,
      exp: this.state.exp,
      stats: this.state.stats,
      activeOffer: this.state.activeOffer,
      revivesUsed: this.state.revivesUsed,
      reviveGuardRemainingTicks: this.state.reviveGuardRemainingTicks,
      damageDealtMilli: this.state.damageDealtMilli,
      rngState: this.state.rngState,
      initialSeed: this.state.initialSeed,
      lastCommandSeq: this.state.lastCommandSeq,
      lastAuthoritySeq: this.state.lastAuthoritySeq,
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
    if (bundle.route.towerAnchors.length !== 3 || bundle.waves.length !== 5) {
      throw new Error('A battle stage requires exactly three towers and five waves.');
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
    for (const [waveIndex, wave] of bundle.waves.entries()) {
      if (wave.index !== waveIndex + 1 || wave.groups.length === 0) {
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
          !Number.isInteger(group.intervalTicks) ||
          group.intervalTicks <= 0
        ) {
          throw new Error(`Wave ${wave.id} contains an invalid spawn group.`);
        }
      }
    }
    for (const definition of Object.values(bundle.enemies)) {
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
    }
  }

  private createInitialState(seed: number): SerializableState {
    const normalizedSeed = seed >>> 0 || 0x6d2b79f5;
    return {
      tick: 0,
      speed: 1,
      flowState: 'running',
      aimAnglesU16: [
        DEFAULT_AIM_ANGLE_U16,
        DEFAULT_AIM_ANGLE_U16,
        DEFAULT_AIM_ANGLE_U16,
      ],
      towerCooldowns: [0, 0, 0],
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
      damageDealtMilli: 0,
      rngState: normalizedSeed,
      initialSeed: normalizedSeed,
      lastCommandSeq: 0,
      lastAuthoritySeq: 0,
      nextProjectileId: 1_500_000_000,
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
      schemaVersion !== LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION
    ) {
      throw new Error(`Unsupported checkpoint schema ${String(schemaVersion)}.`);
    }
    const envelope = parsed as CheckpointEnvelope | LegacySharedAimCheckpointEnvelope;
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
    if (envelope.schemaVersion === LEGACY_SHARED_AIM_CHECKPOINT_SCHEMA_VERSION) {
      if (!Number.isInteger(envelope.state.aimAngleU16)) {
        throw new Error('Legacy checkpoint aim angle is malformed.');
      }
      const { aimAngleU16, ...legacyState } = envelope.state;
      const normalizedAngle = aimAngleU16 & 0xffff;
      return JSON.parse(JSON.stringify({
        ...legacyState,
        aimAnglesU16: [normalizedAngle, normalizedAngle, normalizedAngle],
      })) as SerializableState;
    }
    if (
      !Array.isArray(envelope.state.aimAnglesU16) ||
      envelope.state.aimAnglesU16.length !== this.bundle.route.towerAnchors.length ||
      envelope.state.aimAnglesU16.some((angle) => !Number.isInteger(angle))
    ) {
      throw new Error('Checkpoint tower aim angles are malformed.');
    }
    return JSON.parse(JSON.stringify(envelope.state)) as SerializableState;
  }

  private cloneState(): SerializableState {
    return JSON.parse(JSON.stringify(this.state)) as SerializableState;
  }

  private step(output: SimulationOutput): void {
    this.spawnDueEnemy(output);
    this.moveEnemies();
    this.updateTowerCooldowns();
    this.fireTowers(output);
    this.updateProjectiles(output);
    this.removeDeadEnemies();
    this.checkBreach(output);
    this.resolveWave(output);
    if (this.state.reviveGuardRemainingTicks > 0) {
      this.state.reviveGuardRemainingTicks -= 1;
    }
    this.state.tick += 1;
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
      scheduler.nextSpawnTick = this.state.tick + group.intervalTicks;
      return;
    }

    scheduler.groupIndex += 1;
    scheduler.unitIndex = 0;
    if (scheduler.groupIndex < wave.groups.length) {
      scheduler.nextSpawnTick = this.state.tick + this.bundle.rules.groupGapTicks;
    } else {
      scheduler.allGroupsSpawned = true;
    }
  }

  private moveEnemies(): void {
    for (const enemy of [...this.state.enemies].sort((left, right) => left.entityId - right.entityId)) {
      if (enemy.hpMilli <= 0 || enemy.distanceMilli >= this.route.totalLengthMilli) {
        continue;
      }
      const definition = this.enemyDefinition(enemy.definitionId);
      const wave = this.bundle.waves[this.state.scheduler.waveIndex];
      let speedBp = wave?.speedMultiplierBp ?? 10_000;
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
      enemy.ageTicks += 1;
    }
  }

  private updateTowerCooldowns(): void {
    for (let index = 0; index < this.state.towerCooldowns.length; index += 1) {
      const cooldown = this.state.towerCooldowns[index] ?? 0;
      this.state.towerCooldowns[index] = Math.max(0, cooldown - 1);
    }
  }

  private fireTowers(output: SimulationOutput): void {
    const reservedPrimaryTargets = new Set<number>();
    for (let towerIndex = 0; towerIndex < this.bundle.route.towerAnchors.length; towerIndex += 1) {
      if ((this.state.towerCooldowns[towerIndex] ?? 0) > 0) {
        continue;
      }
      const anchor = this.bundle.route.towerAnchors[towerIndex];
      if (!anchor) {
        continue;
      }
      const targets = this.legalTargets(anchor, towerIndex);
      if (targets.length === 0) {
        continue;
      }

      const unreservedIndex = targets.findIndex((target) => !reservedPrimaryTargets.has(target.entityId));
      const primaryTargetIndex = unreservedIndex >= 0 ? unreservedIndex : 0;
      const orderedTargets = primaryTargetIndex === 0
        ? targets
        : [...targets.slice(primaryTargetIndex), ...targets.slice(0, primaryTargetIndex)];

      const tier = tierStats(this.state.level);
      const arrowCount = Math.min(9, this.bundle.tower.baseArrowCount + this.state.stats.arrowCountAdd);
      const penetration = Math.min(6, this.bundle.tower.basePenetration + this.state.stats.penetrationAdd);
      let damageMilli = mulBp(this.bundle.tower.baseDamageMilli, tier.damageBp);
      damageMilli = mulBp(damageMilli, 10_000 + Math.min(30_000, this.state.stats.damageBonusBp));
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

      for (let arrowIndex = 0; arrowIndex < arrowCount; arrowIndex += 1) {
        const target = orderedTargets[arrowIndex % orderedTargets.length];
        if (!target) {
          continue;
        }
        const critical = this.nextRandomBp() < this.effectiveCritChanceBp();
        const projectileDamage = critical
          ? mulBp(damageMilli, this.effectiveCritDamageBp())
          : damageMilli;
        this.state.projectiles.push({
          entityId: this.state.nextProjectileId,
          towerId: towerIndex,
          targetEntityId: target.entityId,
          bornTick: this.state.tick,
          xMilli: startXMilli,
          yMilli: startYMilli,
          movementRemainder: 0,
          damageMilli: projectileDamage,
          critical,
          penetration,
        });
        this.state.nextProjectileId += 1;
      }

      const frequencyBp = mulBp(
        tier.frequencyBp,
        10_000 + Math.min(20_000, this.state.stats.frequencyBonusBp),
      );
      this.state.towerCooldowns[towerIndex] = Math.max(
        6,
        Math.ceil((this.bundle.tower.attackIntervalTicks * 10_000) / frequencyBp),
      );
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'ATTACK_RELEASE',
        towerId: towerIndex,
        releaseRotationU16,
      });
    }
  }

  private legalTargets(anchor: Point, towerIndex: number): EnemyState[] {
    const tier = tierStats(this.state.level);
    const rangeMilli = mulBp(this.bundle.tower.rangePx * MILLI_PX, tier.rangeBp);
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

    return candidates
      .sort((left, right) =>
        Number(right.preferred) - Number(left.preferred) ||
        right.enemy.distanceMilli - left.enemy.distanceMilli ||
        left.enemy.entityId - right.enemy.entityId,
      )
      .map(({ enemy }) => enemy);
  }

  private updateProjectiles(output: SimulationOutput): void {
    const remaining: ProjectileState[] = [];
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
      this.applyDamage(target, projectile.damageMilli, projectile.critical, output);

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

      for (const penetrationTarget of penetrationTargets) {
        penetratingDamage = mulBp(penetratingDamage, this.bundle.tower.penetrationRetentionBp);
        this.applyDamage(penetrationTarget, Math.max(1, penetratingDamage), projectile.critical, output);
      }
    }
    this.state.projectiles = remaining;
  }

  private applyDamage(
    enemy: EnemyState,
    rawDamageMilli: number,
    critical: boolean,
    output: SimulationOutput,
  ): void {
    if (enemy.hpMilli <= 0) {
      return;
    }
    const definition = this.enemyDefinition(enemy.definitionId);
    const effectiveArmorBp = Math.min(
      8_500,
      definition.armorBp + this.guardAuraArmorBpFor(enemy),
    );
    const damageAfterArmor = Math.max(1, mulBp(rawDamageMilli, 10_000 - effectiveArmorBp));
    const phaseShellCap = this.isPhaseShellActive(enemy, definition)
      ? Math.max(1, mulBp(enemy.maxHpMilli, definition.phaseShellMaxHitDamageBp ?? 10_000))
      : damageAfterArmor;
    const actualDamage = Math.min(enemy.hpMilli, damageAfterArmor, phaseShellCap);
    enemy.hpMilli -= actualDamage;
    this.state.damageDealtMilli += actualDamage;
    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'HIT',
      entityId: enemy.entityId,
      damageMilli: actualDamage,
      critical,
    });

    if (enemy.hpMilli === 0) {
      this.state.scheduler.currentWaveKilled += 1;
      this.state.exp += enemy.expAward;
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'DEATH',
        entityId: enemy.entityId,
      });
      this.requestLevelIfReady(output);
    }
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
    const breached = [...this.state.enemies]
      .filter((enemy) => enemy.hpMilli > 0 && enemy.distanceMilli >= this.route.totalLengthMilli)
      .sort((left, right) => left.entityId - right.entityId)[0];
    if (!breached) {
      return;
    }

    output.events.push({
      eventId: this.nextEventId(),
      tick: this.state.tick,
      type: 'BREACH',
      entityId: breached.entityId,
    });
    this.state.flowState = 'defeat-pending';
    if (this.state.revivesUsed < this.bundle.rules.maxRevives) {
      output.flowRequests.push({
        type: 'REVIVE',
        ordinal: this.state.revivesUsed + 1,
        tick: this.state.tick,
      });
    }
  }

  private resolveWave(output: SimulationOutput): void {
    const scheduler = this.state.scheduler;
    if (!scheduler.allGroupsSpawned || this.state.enemies.length > 0 || scheduler.victoryPending) {
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
    scheduler.nextSpawnTick = this.state.tick + this.bundle.rules.waveGapTicks;
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
    this.state.flowState = 'offer-pending';
    output.flowRequests.push({ type: 'OFFER', ordinal: this.state.level, tick: this.state.tick });
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
  }

  private applyCardEffect(card: CardDefinition): void {
    switch (card.effectId) {
      case 'tower-damage':
        this.state.stats.damageBonusBp = Math.min(
          30_000,
          this.state.stats.damageBonusBp + (card.valueBp ?? 0),
        );
        break;
      case 'tower-frequency':
        this.state.stats.frequencyBonusBp = Math.min(
          20_000,
          this.state.stats.frequencyBonusBp + (card.valueBp ?? 0),
        );
        break;
      case 'arrow-count':
        this.state.stats.arrowCountAdd = Math.min(
          8,
          this.state.stats.arrowCountAdd + (card.valueInt ?? 0),
        );
        break;
      case 'penetration':
        this.state.stats.penetrationAdd = Math.min(
          6,
          this.state.stats.penetrationAdd + (card.valueInt ?? 0),
        );
        break;
      case 'crit-rate':
        this.state.stats.critChanceAddBp = Math.min(
          7_500,
          this.state.stats.critChanceAddBp + (card.valueBp ?? 0),
        );
        break;
      case 'crit-damage':
        this.state.stats.critDamageAddBp = Math.min(
          20_000,
          this.state.stats.critDamageAddBp + (card.valueBp ?? 0),
        );
        break;
    }
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
    for (const enemy of removedFlying) {
      output.events.push({
        eventId: this.nextEventId(),
        tick: this.state.tick,
        type: 'DEATH',
        entityId: enemy.entityId,
      });
    }

    this.state.revivesUsed += 1;
    this.state.reviveGuardRemainingTicks = this.bundle.rules.reviveGuardTicks;
    this.state.speed = 1;
    this.state.wallTickRemainder = 0;
    this.state.flowState = 'running';
    output.events.push({ eventId: this.nextEventId(), tick: this.state.tick, type: 'REVIVED' });
  }

  private finishVictory(output: SimulationOutput): void {
    this.state.scheduler.victoryPending = false;
    this.state.flowState = 'result';
    output.events.push({ eventId: this.nextEventId(), tick: this.state.tick, type: 'VICTORY' });
  }

  private effectiveCritChanceBp(): number {
    return Math.min(8_000, this.bundle.tower.critChanceBp + this.state.stats.critChanceAddBp);
  }

  private effectiveCritDamageBp(): number {
    return Math.min(35_000, this.bundle.tower.critDamageBp + this.state.stats.critDamageAddBp);
  }

  private nextRandomBp(): number {
    this.state.rngState = xorshift32(this.state.rngState);
    return Math.floor((this.state.rngState * 10_000) / UINT32_MAX_PLUS_ONE);
  }

  private nextEventId(): string {
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
