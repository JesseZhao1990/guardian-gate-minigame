import {
  createBattleSimulation,
  type BattleSimulation,
  type SimulationOutput,
} from '../src/core/battle-sim';
import { createHash } from 'node:crypto';
import {
  createStage01Bundle,
  createStage02Bundle,
  createStage03Bundle,
  createStage04Bundle,
  createStage05Bundle,
  createStage06Bundle,
  createStage07Bundle,
  STAGE_BUNDLES,
} from '../src/core/content';
import {
  BATTLE_STAGE_ORDER,
  DEFAULT_AIM_ANGLE_U16,
  ENEMY_FLAG_ENRAGED,
  ENEMY_FLAG_ETHEREAL,
  ENEMY_FLAG_GUARD_AURA,
  ENEMY_FLAG_GUARDED,
  ENEMY_FLAG_PHASE_SHELL,
  PROJECTILE_FLAG_CRITICAL,
  PROJECTILE_FLAG_FOCUSED,
  PROJECTILE_FLAG_PENETRATION,
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  FIXED_WAVE_PREPARATION_TICKS,
  type AuthorityEventV1,
  type BattleBundleV1,
  type BattleEvent,
  type Point,
  type TowerId,
} from '../src/core/contracts';
import { LocalPracticeAuthority } from '../src/core/local-authority';
import {
  createDefaultTowerBuildZones,
  findNearestValidTowerPlacement,
} from '../src/core/tower-placement';
import { checkpointChecksum, decodeText, encodeText } from '../src/platform/wechat';
import {
  BATTLE_BOTTOM_HUD_LEFT_RIGHT,
  BATTLE_BOTTOM_HUD_RIGHT_LEFT,
  BATTLE_BOTTOM_HUD_TOP,
  BATTLE_WORLD_SCALE,
  BREACH_SEAL_VISUAL_RADIUS,
  projectBattleWorldPoint,
  resolveBreachSealPlacement,
  resolveBreachSealVisualExtents,
  resolveCanvasFontWeight,
  resolveCardOverlayContentLayout,
  resolveCardOverlayLayout,
  resolveHomeBadgeLayout,
  resolveHomeStageCompactPresentation,
  resolveHomeStageCardLayout,
  resolveShopShortcutLayout,
  resolveShopShortcutText,
  resolveViewportLayout,
  unprojectBattleWorldPoint,
} from '../src/render/CanvasRenderer';

const assert = {
  equal(actual: unknown, expected: unknown): void {
    if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  },
  ok(value: unknown, message?: string): void {
    if (!value) throw new Error(message ?? `Expected a truthy value, received ${String(value)}`);
  },
};

function startPreparedWave(simulation: BattleSimulation): SimulationOutput {
  const before = simulation.getHudProjection();
  assert.equal(before.flowState, 'preparing');
  assert.ok(before.preparationTicksRemaining > 0);
  const output = simulation.applyCommand({
    seq: before.lastCommandSeq + 1,
    type: 'START_WAVE',
  });
  assert.equal(output.commandAcks[0]?.status, 'applied');
  assert.equal(simulation.getHudProjection().flowState, 'running');
  assert.equal(simulation.getHudProjection().preparationTicksRemaining, 0);
  return output;
}

function createFixedMechanicSimulation(
  bundle: BattleBundleV1,
  seed: number,
  activeTowerIds: TowerId[],
): BattleSimulation {
  const initial = createBattleSimulation(bundle, seed);
  const envelope = JSON.parse(decodeText(initial.createCheckpoint())) as {
    state: { activeTowerIds: TowerId[]; towerCooldowns: number[] };
  };
  envelope.state.activeTowerIds = [...activeTowerIds];
  for (const towerId of activeTowerIds) envelope.state.towerCooldowns[towerId] = 0;
  return createBattleSimulation(bundle, seed, encodeText(JSON.stringify(envelope)));
}

const oneX = createBattleSimulation(createStage01Bundle(), 0x12345678);
const twoX = createBattleSimulation(createStage01Bundle(), 0x12345678);
assert.equal(oneX.getHudProjection().flowState, 'preparing');
assert.equal(oneX.getHudProjection().preparationTicksRemaining, FIXED_WAVE_PREPARATION_TICKS);
twoX.applyCommand({ seq: 1, type: 'SET_SPEED', value: 2 });
assert.equal(oneX.advanceWallTime(1_000).ticksAdvanced, 30);
assert.equal(twoX.advanceWallTime(1_000).ticksAdvanced, 60);
assert.equal(
  oneX.getHudProjection().preparationTicksRemaining,
  FIXED_WAVE_PREPARATION_TICKS - 30,
);
assert.equal(
  twoX.getHudProjection().preparationTicksRemaining,
  FIXED_WAVE_PREPARATION_TICKS - 60,
);

assert.deepEqual(oneX.getHudProjection().aimAnglesU16, [
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
]);
oneX.applyCommand({ seq: 2, type: 'SET_AIM', towerId: 0, angleU16: 12_345 });
oneX.applyCommand({ seq: 3, type: 'SET_AIM', towerId: 1, angleU16: 23_456 });
const lockedTowerAim = oneX.applyCommand({ seq: 4, type: 'SET_AIM', towerId: 2, angleU16: 34_567 });
assert.equal(lockedTowerAim.commandAcks[0]?.status, 'rejected');
assert.deepEqual(oneX.getHudProjection().aimAnglesU16, [
  12_345,
  23_456,
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
]);
const rejectedAim = oneX.applyCommand({
  seq: 5,
  type: 'SET_AIM',
  towerId: 4,
  angleU16: 45_678,
} as never);
assert.equal(rejectedAim.commandAcks[0]?.status, 'rejected');
const rejectedNegativeTower = oneX.applyCommand({
  seq: 6,
  type: 'SET_AIM',
  towerId: -1,
  angleU16: 45_678,
} as never);
assert.equal(rejectedNegativeTower.commandAcks[0]?.status, 'rejected');
const rejectedFractionalTower = oneX.applyCommand({
  seq: 7,
  type: 'SET_AIM',
  towerId: 1.5,
  angleU16: 45_678,
} as never);
assert.equal(rejectedFractionalTower.commandAcks[0]?.status, 'rejected');
const rejectedFractionalAngle = oneX.applyCommand({
  seq: 8,
  type: 'SET_AIM',
  towerId: 1,
  angleU16: 45_678.5,
} as never);
assert.equal(rejectedFractionalAngle.commandAcks[0]?.status, 'rejected');
assert.deepEqual(oneX.getHudProjection().aimAnglesU16, [
  12_345,
  23_456,
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
]);
startPreparedWave(oneX);
oneX.advanceTicks(90);
const checkpoint = oneX.createCheckpoint();
const restored = createBattleSimulation(createStage01Bundle(), 0x12345678, checkpoint);
assert.equal(restored.getChecksum(), oneX.getChecksum());
assert.deepEqual(restored.createCheckpoint(), checkpoint);
const checkpointText = decodeText(checkpoint);
assert.equal((JSON.parse(checkpointText) as { schemaVersion: number }).schemaVersion, 7);
assert.deepEqual(encodeText(checkpointText), checkpoint);
assert.equal(checkpointChecksum(checkpointText), checkpointChecksum(checkpointText));

const legacyCheckpoint = JSON.parse(checkpointText) as {
  schemaVersion: number;
  state: Record<string, unknown>;
};
legacyCheckpoint.schemaVersion = 2;
legacyCheckpoint.state.aimAngleU16 = 54_321;
delete legacyCheckpoint.state.aimAnglesU16;
legacyCheckpoint.state.towerCooldowns = (
  legacyCheckpoint.state.towerCooldowns as number[]
).slice(0, 3);
const migratedLegacy = createBattleSimulation(
  createStage01Bundle(),
  0x12345678,
  encodeText(JSON.stringify(legacyCheckpoint)),
);
assert.deepEqual(migratedLegacy.getHudProjection().aimAnglesU16, [
  54_321,
  54_321,
  54_321,
  DEFAULT_AIM_ANGLE_U16,
]);

function angleTo(from: Point, to: Point): number {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return Math.round(((angle / (Math.PI * 2) + 1) % 1) * 65_536) & 0xffff;
}

const fallbackBundle = createStage01Bundle();
const fallbackSimulation = createFixedMechanicSimulation(fallbackBundle, 0xfa11bac, [0, 1, 2]);
const fallbackAimAngles = [4_096, 20_480, 53_248, DEFAULT_AIM_ANGLE_U16] as const;
fallbackAimAngles.forEach((angleU16, towerId) => {
  if (!fallbackSimulation.getHudProjection().activeTowerIds.includes(towerId as TowerId)) return;
  fallbackSimulation.applyCommand({
    seq: towerId + 1,
    type: 'SET_AIM',
    towerId: towerId as TowerId,
    angleU16,
  });
});
assert.deepEqual(fallbackSimulation.getRenderSnapshot().towerFacingsU16, fallbackAimAngles);

const targetingBundle = createStage01Bundle();
// Auto-target fallback owns aim/facing semantics; the Stage 01 protected
// ingress is exercised independently by stage01-ingress-smoke.
targetingBundle.route.combatStartDistancePx = 1;
targetingBundle.tower.rangePx = 5_000;
targetingBundle.tower.projectileSpeedPxPerSecond = 60;
targetingBundle.tower.baseDamageMilli = 1;
targetingBundle.tower.basePenetration = 2;
targetingBundle.tower.critChanceBp = 10_000;
const spawnPoint = targetingBundle.route.points[0];
if (!spawnPoint) throw new Error('Stage 01 route requires a spawn point.');
const targetingSimulation = createFixedMechanicSimulation(targetingBundle, 0xa11ce, [0, 1, 2]);
startPreparedWave(targetingSimulation);
const autoTrackingTowerId = 2 as const;
let configuredTrackingAim = 0;
targetingBundle.route.towerAnchors.forEach((anchor, index) => {
  if (!targetingSimulation.getHudProjection().activeTowerIds.includes(index as TowerId)) return;
  const towardSpawn = angleTo(anchor, spawnPoint);
  const angleU16 = index === autoTrackingTowerId
    ? (towardSpawn + 5_461) & 0xffff
    : (towardSpawn + 32_768) & 0xffff;
  if (index === autoTrackingTowerId) configuredTrackingAim = angleU16;
  targetingSimulation.applyCommand({
    seq: targetingSimulation.getHudProjection().lastCommandSeq + 1,
    type: 'SET_AIM',
    towerId: index as TowerId,
    angleU16,
  });
});
let targetingOutput: SimulationOutput | undefined;
for (let tick = 0; tick < 90; tick += 1) {
  const output = targetingSimulation.advanceTicks(1);
  if (output.events.some((event) => event.type === 'ATTACK_RELEASE')) {
    targetingOutput = output;
    break;
  }
}
if (!targetingOutput) throw new Error('Auto-target fallback smoke test requires a release event.');
const releaseEvent = targetingOutput.events.find(
  (event): event is Extract<BattleEvent, { type: 'ATTACK_RELEASE' }> =>
    event.type === 'ATTACK_RELEASE' && event.towerId === autoTrackingTowerId,
);
assert.deepEqual(
  targetingOutput.events.filter((event) => event.type === 'ATTACK_RELEASE').map((event) => event.towerId),
  [0, 1, 2],
);
assert.equal(
  targetingSimulation.getHudProjection().aimAnglesU16[autoTrackingTowerId],
  configuredTrackingAim,
);

const targetingSnapshot = targetingSimulation.getRenderSnapshot();
const trackedEnemy = targetingSnapshot.entities.find((entity) => entity.renderKind === 'enemy');
const trackedProjectile = targetingSnapshot.entities.find(
  (entity) =>
    entity.renderKind === 'projectile' &&
    ((entity.flags & PROJECTILE_FLAG_TOWER_ID_MASK) >>> PROJECTILE_FLAG_TOWER_ID_SHIFT) === autoTrackingTowerId,
);
const trackingAnchor = targetingBundle.route.towerAnchors[autoTrackingTowerId];
if (!trackedEnemy || !trackedProjectile || !trackingAnchor) {
  throw new Error('Auto-facing smoke test requires an enemy, projectile, and tower anchor.');
}
if (!releaseEvent) throw new Error('Auto-facing smoke test requires an attack release event.');
assert.equal(releaseEvent.releaseRotationU16, angleTo(trackingAnchor, trackedEnemy));
assert.equal(
  targetingSnapshot.towerFacingsU16[autoTrackingTowerId],
  angleTo(trackingAnchor, trackedEnemy),
);
assert.ok(
  targetingSnapshot.towerFacingsU16[autoTrackingTowerId] !== configuredTrackingAim,
);
assert.equal(trackedProjectile.rotationU16, angleTo(trackedProjectile, trackedEnemy));
assert.equal(
  trackedProjectile.flags,
  PROJECTILE_FLAG_CRITICAL |
    PROJECTILE_FLAG_FOCUSED |
    PROJECTILE_FLAG_PENETRATION |
    (autoTrackingTowerId << PROJECTILE_FLAG_TOWER_ID_SHIFT),
);
assert.equal(
  (trackedProjectile.flags & PROJECTILE_FLAG_TOWER_ID_MASK) >>> PROJECTILE_FLAG_TOWER_ID_SHIFT,
  autoTrackingTowerId,
);

const initialProjectileRotation = trackedProjectile.rotationU16;
targetingSimulation.advanceTicks(12);
const trackingSnapshotAfterMovement = targetingSimulation.getRenderSnapshot();
const movedEnemy = trackingSnapshotAfterMovement.entities.find(
  (entity) => entity.entityId === trackedEnemy.entityId,
);
const movedProjectile = trackingSnapshotAfterMovement.entities.find(
  (entity) => entity.entityId === trackedProjectile.entityId,
);
if (!movedEnemy || !movedProjectile) {
  throw new Error('Tracked projectile must remain alive while its target moves.');
}
assert.equal(movedProjectile.rotationU16, angleTo(movedProjectile, movedEnemy));
assert.ok(movedProjectile.rotationU16 !== initialProjectileRotation);
assert.equal(
  targetingSimulation.getHudProjection().aimAnglesU16[autoTrackingTowerId],
  configuredTrackingAim,
);

const leftAuthority = new LocalPracticeAuthority(createStage01Bundle(), 42);
leftAuthority.requestOffer(1);
leftAuthority.requestOffer(2);
const rightAuthority = new LocalPracticeAuthority(createStage01Bundle(), 999, leftAuthority.snapshot());
assert.deepEqual(rightAuthority.requestOffer(3).cards, leftAuthority.requestOffer(3).cards);

function projectedSmokeThroughput(stats: {
  damagePerArrowMilli: number;
  attackIntervalTicks: number;
  arrowCount: number;
  penetrationCount: number;
  penetrationRetentionBp: number;
  critChanceBp: number;
  critDamageBp: number;
}): number {
  const averageCritMultiplierBp = 10_000 + Math.round(
    (stats.critChanceBp * (stats.critDamageBp - 10_000)) / 10_000,
  );
  let penetrationValueBp = 10_000;
  let retainedBp = 10_000;
  for (let index = 0; index < stats.penetrationCount; index += 1) {
    retainedBp = Math.round((retainedBp * stats.penetrationRetentionBp) / 10_000);
    penetrationValueBp += retainedBp;
  }
  return (
    stats.damagePerArrowMilli *
    stats.arrowCount *
    averageCritMultiplierBp *
    penetrationValueBp
  ) / Math.max(1, stats.attackIntervalTicks);
}

interface VictoryRun {
  simulation: BattleSimulation;
  events: BattleEvent[];
}

interface StageCombatDistribution {
  attacksByWave: number[][];
  peakAliveByWave: number[];
}

function stageCombatDistribution(events: BattleEvent[], waveCount: number): StageCombatDistribution {
  const attacksByWave = Array.from({ length: waveCount }, () => [0, 0, 0, 0]);
  const aliveByWave = Array.from({ length: waveCount }, () => 0);
  const peakAliveByWave = Array.from({ length: waveCount }, () => 0);
  let activeWaveIndex = 0;
  let activeTick = events[0]?.tick ?? 0;

  function sampleVisibleEnemies(): void {
    for (let waveIndex = 0; waveIndex < waveCount; waveIndex += 1) {
      peakAliveByWave[waveIndex] = Math.max(
        peakAliveByWave[waveIndex] ?? 0,
        aliveByWave[waveIndex] ?? 0,
      );
    }
  }

  for (const event of events) {
    if (event.tick !== activeTick) {
      sampleVisibleEnemies();
      activeTick = event.tick;
    }
    if (event.type === 'SPAWN') {
      activeWaveIndex = Math.max(0, Math.min(waveCount - 1, (event.entityId >>> 20) - 1));
      aliveByWave[activeWaveIndex] = (aliveByWave[activeWaveIndex] ?? 0) + 1;
    } else if (event.type === 'DEATH') {
      const waveIndex = Math.max(0, Math.min(waveCount - 1, (event.entityId >>> 20) - 1));
      aliveByWave[waveIndex] = Math.max(0, (aliveByWave[waveIndex] ?? 0) - 1);
    } else if (event.type === 'ATTACK_RELEASE') {
      const counters = attacksByWave[activeWaveIndex];
      if (counters) counters[event.towerId] = (counters[event.towerId] ?? 0) + 1;
    }
  }
  sampleVisibleEnemies();

  return { attacksByWave, peakAliveByWave };
}

function runStageToVictory(bundle: BattleBundleV1, seed: number): VictoryRun {
  let commandSequence = 1_000_000;
  let nextTacticTick = 0;
  const simulation = createBattleSimulation(bundle, seed);
  const authority = new LocalPracticeAuthority(bundle, seed);
  const events: BattleEvent[] = [];
  const lastShopAttemptBalanceByWave = new Map<number, number>();
  const routeSegments = bundle.route.points.slice(0, -1).map((start, index) => {
    const end = bundle.route.points[index + 1];
    if (!end) throw new Error('A smoke-test route segment requires an end point.');
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    return { start, deltaX, deltaY, length: Math.hypot(deltaX, deltaY) };
  });

  function routeProgress(point: Point): number {
    let cumulative = 0;
    let bestProgress = 0;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const segment of routeSegments) {
      const lengthSquared = segment.deltaX ** 2 + segment.deltaY ** 2;
      const projection = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, (
            (point.x - segment.start.x) * segment.deltaX +
            (point.y - segment.start.y) * segment.deltaY
          ) / lengthSquared));
      const projectedX = segment.start.x + segment.deltaX * projection;
      const projectedY = segment.start.y + segment.deltaY * projection;
      const distanceSquared = (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;
      const progress = cumulative + segment.length * projection;
      if (
        distanceSquared < bestDistanceSquared ||
        (distanceSquared === bestDistanceSquared && progress > bestProgress)
      ) {
        bestDistanceSquared = distanceSquared;
        bestProgress = progress;
      }
      cumulative += segment.length;
    }
    return bestProgress;
  }

  function applyAndQueue(event: AuthorityEventV1, pending: SimulationOutput[]): void {
    pending.push(simulation.applyAuthorityEvent(event));
  }

  function resolveOutput(initial: SimulationOutput): void {
    const pending = [initial];
    while (pending.length > 0) {
      const output = pending.shift();
      if (!output) continue;
      events.push(...output.events);
      for (const request of output.flowRequests) {
        if (request.type === 'REVIVE') {
          applyAndQueue(authority.grantRevive(request.ordinal), pending);
          continue;
        }
        applyAndQueue(
          authority.requestOffer(request.ordinal, undefined, request.eligibleEffectIds),
          pending,
        );
      }
    }
  }

  function attemptShopPurchase(): void {
    const beforeOpen = simulation.getHudProjection();
    if (!beforeOpen.shopAvailable) return;
    if (lastShopAttemptBalanceByWave.get(beforeOpen.waveIndex) === beforeOpen.warPointsBalance) {
      return;
    }
    lastShopAttemptBalanceByWave.set(beforeOpen.waveIndex, beforeOpen.warPointsBalance);

    const openOutput = simulation.applyCommand({ seq: ++commandSequence, type: 'OPEN_SHOP' });
    resolveOutput(openOutput);
    if (openOutput.commandAcks[0]?.status !== 'applied') return;

    const shopHud = simulation.getHudProjection();
    if (shopHud.flowState !== 'offer-pending' || !shopHud.activeOffer) {
      throw new Error('An opened fixed-stage shop must expose its authority-backed offer.');
    }
    const towerReserve = shopHud.towerBuild.nextTowerId !== null &&
      shopHud.towerBuild.completedWaves >= shopHud.towerBuild.requiredCompletedWaves - 1
      ? shopHud.towerBuild.cost
      : 0;
    const affordable = [...(shopHud.offerPreviews ?? [])]
      .filter((preview) => {
        if (
          preview.capped ||
          preview.warPointCost > shopHud.warPointsBalance - towerReserve
        ) return false;
        return true;
      })
      .sort((left, right) => {
        const leftIsTower = left.towerCountAfter !== undefined;
        const rightIsTower = right.towerCountAfter !== undefined;
        return Number(rightIsTower) - Number(leftIsTower) ||
          projectedSmokeThroughput(right.after) - projectedSmokeThroughput(left.after) ||
          left.warPointCost - right.warPointCost ||
          left.cardId.localeCompare(right.cardId);
      });
    const choice = affordable[0];
    if (choice) {
      resolveOutput(simulation.applyAuthorityEvent(
        authority.acceptChoice(shopHud.activeOffer.offerId, choice.cardId),
      ));
      return;
    }
    resolveOutput(simulation.applyCommand({ seq: ++commandSequence, type: 'CLOSE_SHOP' }));
  }

  function attemptTowerBuild(): void {
    const hud = simulation.getHudProjection();
    if (!hud.towerBuild.canBuild || hud.towerBuild.nextTowerId === null) return;
    const authoredPoint = hud.towerPositions[hud.towerBuild.nextTowerId];
    if (!authoredPoint) throw new Error('A buildable fixed-stage tower requires an authored default position.');
    const placement = findNearestValidTowerPlacement({
      point: authoredPoint,
      buildZones: createDefaultTowerBuildZones(),
      routePoints: bundle.route.points,
      breachPoint: bundle.route.breachPoint,
      existingTowerPoints: hud.activeTowerIds
        .map((towerId) => hud.towerPositions[towerId])
        .filter((point): point is Point => point !== undefined),
    });
    if (!placement) throw new Error('A buildable fixed-stage tower requires a legal placement.');
    const output = simulation.applyCommand({
      seq: ++commandSequence,
      type: 'BUILD_TOWER',
      point: placement.point,
    });
    resolveOutput(output);
    assert.equal(output.commandAcks[0]?.status, 'applied');
  }

  function applyTactics(): void {
    const hud = simulation.getHudProjection();
    if (hud.flowState !== 'running' || hud.tick < nextTacticTick) return;
    nextTacticTick = hud.tick + 10;
    const enemies = simulation.getRenderSnapshot().entities.filter(
      (entity) => entity.renderKind === 'enemy',
    );
    const rangeSquared = hud.towerStats.current.rangePx ** 2;
    for (const [towerIndex, anchor] of hud.towerPositions.entries()) {
      if (!hud.activeTowerIds.includes(towerIndex as TowerId)) continue;
      const inRange = enemies.filter((enemy) => {
        const deltaX = enemy.x - anchor.x;
        const deltaY = enemy.y - anchor.y;
        return deltaX * deltaX + deltaY * deltaY <= rangeSquared;
      });
      const target = inRange.sort((left, right) => {
        return Number((left.flags & ENEMY_FLAG_ETHEREAL) !== 0) -
          Number((right.flags & ENEMY_FLAG_ETHEREAL) !== 0) ||
          routeProgress(right) - routeProgress(left) ||
          left.entityId - right.entityId;
      })[0];
      if (!target) continue;
      resolveOutput(simulation.applyCommand({
        seq: ++commandSequence,
        type: 'SET_AIM',
        towerId: towerIndex as TowerId,
        angleU16: angleTo(anchor, target),
      }));
    }
    const tacticalHud = simulation.getHudProjection();
    if (tacticalHud.overdrive.ready && tacticalHud.overdrive.activeTowerId === null) {
      const pressure = [...tacticalHud.towerRuntime]
        .filter((tower) => tower.active && tower.enemiesInRange > 0)
        .sort((left, right) =>
          right.enemiesInRange - left.enemiesInRange ||
          right.preferredEnemiesInRange - left.preferredEnemiesInRange ||
          left.towerId - right.towerId,
        )[0];
      if (pressure) {
        resolveOutput(simulation.applyCommand({
          seq: ++commandSequence,
          type: 'ACTIVATE_OVERDRIVE',
          towerId: pressure.towerId,
        }));
      }
    }
  }

  let tickBudget = 180_000;
  while (tickBudget > 0 && simulation.getHudProjection().flowState !== 'result') {
    attemptTowerBuild();
    attemptShopPurchase();
    if (simulation.getHudProjection().flowState === 'preparing') {
      resolveOutput(startPreparedWave(simulation));
    }
    applyTactics();
    const output = simulation.advanceTicks(Math.min(10, tickBudget));
    tickBudget -= output.ticksAdvanced;
    resolveOutput(output);
    if (output.ticksAdvanced === 0 && output.flowRequests.length === 0) break;
  }
  return { simulation, events };
}

function assertVictory(run: VictoryRun, expectedSpawnCount: number): void {
  const hud = run.simulation.getHudProjection();
  assert.ok(
    run.events.some((event) => event.type === 'VICTORY'),
    `Expected a victory, received ${JSON.stringify({
      outcome: hud.outcome,
      progressBp: hud.progressBp,
      gateIntegrity: hud.gateIntegrity,
      warPointsBalance: hud.warPointsBalance,
      warPointsEarned: hud.warPointsEarned,
      activeTowerIds: hud.activeTowerIds,
      currentStats: hud.towerStats.current,
      breaches: run.events
        .filter((event) => event.type === 'BREACH')
        .map((event) => [event.enemyId, event.damage]),
      remainingEnemies: run.simulation.getRenderSnapshot().entities
        .filter((entity) => entity.renderKind === 'enemy')
        .map((entity) => entity.assetId),
      purchases: run.events
        .filter((event) => event.type === 'CARD_PURCHASED')
        .map((event) => event.cardId),
    })}`,
  );
  assert.equal(run.events.filter((event) => event.type === 'SPAWN').length, expectedSpawnCount);
  assert.deepEqual(hud.activeTowerIds, [0, 1, 2, 3]);
  assert.deepEqual(
    {
      flowState: run.simulation.getHudProjection().flowState,
      waveIndex: run.simulation.getHudProjection().waveIndex,
      progressBp: run.simulation.getHudProjection().progressBp,
    },
    { flowState: 'result', waveIndex: 5, progressBp: 10_000 },
  );
}

const stage01Bundle = createStage01Bundle();
const stage01Victory = runStageToVictory(stage01Bundle, 0xdecafbad);
assert.equal(stage01Bundle.route.towerAnchors.length, 4);
assertVictory(stage01Victory, 95);

const stage02Bundle = createStage02Bundle();
assert.equal(stage02Bundle.stage.id, 'STAGE_02');
assert.equal(stage02Bundle.stage.name, '东海礁港');
assert.equal(stage02Bundle.route.towerAnchors.length, 4);
assert.equal(stage02Bundle.waves.length, 5);
assert.ok(stage02Bundle.releaseId !== createStage01Bundle().releaseId);
assert.ok(stage02Bundle.configHash !== createStage01Bundle().configHash);
assert.ok(stage02Bundle.route.id !== createStage01Bundle().route.id);
for (let index = 1; index < stage02Bundle.waves.length; index += 1) {
  const previous = stage02Bundle.waves[index - 1];
  const current = stage02Bundle.waves[index];
  if (!previous || !current) throw new Error('Stage 02 must contain five complete waves.');
  assert.ok(current.hpMultiplierBp > previous.hpMultiplierBp);
  assert.ok(
    current.groups.reduce((sum, group) => sum + group.count, 0) >
      previous.groups.reduce((sum, group) => sum + group.count, 0),
  );
}

const stage02FirstVictory = runStageToVictory(createStage02Bundle(), 0x5a6e0202);
const stage02SecondVictory = runStageToVictory(createStage02Bundle(), 0x5a6e0202);
assertVictory(stage02FirstVictory, 130);
assertVictory(stage02SecondVictory, 130);
const stage02Distribution = stageCombatDistribution(stage02FirstVictory.events, stage02Bundle.waves.length);
for (const waveIndex of [2, 3, 4]) {
  const towerAttacks = stage02Distribution.attacksByWave[waveIndex] ?? [];
  const activeTowerAttacks = towerAttacks.filter((count) => count > 0);
  assert.ok(activeTowerAttacks.length >= 2);
  assert.ok(towerAttacks.reduce((sum, count) => sum + count, 0) >= 30);
  assert.ok((stage02Distribution.peakAliveByWave[waveIndex] ?? 0) >= 5);
}
const firstStage02Attack = stage02FirstVictory.events.find((event) => event.type === 'ATTACK_RELEASE');
assert.ok(firstStage02Attack?.tick !== undefined && firstStage02Attack.tick >= 40);
assert.equal(stage02FirstVictory.simulation.getChecksum(), stage02SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage02FirstVictory.events.map((event) => [event.tick, event.type]),
  stage02SecondVictory.events.map((event) => [event.tick, event.type]),
);

const stage03Bundle = createStage03Bundle();
assert.equal(stage03Bundle.stage.id, 'STAGE_03');
assert.equal(stage03Bundle.stage.name, '镇海龙门');
assert.equal(stage03Bundle.route.towerAnchors.length, 4);
assert.equal(stage03Bundle.waves.length, 5);
assert.ok(stage03Bundle.releaseId !== stage02Bundle.releaseId);
assert.ok(stage03Bundle.configHash !== stage02Bundle.configHash);
assert.ok(/^sha256:[0-9a-f]{64}$/.test(stage03Bundle.configHash));
assert.ok(stage03Bundle.configHash !== `sha256:${'0'.repeat(64)}`);
assert.ok(stage03Bundle.route.id !== stage02Bundle.route.id);
assert.equal(
  stage03Bundle.waves.reduce(
    (total, wave) => total + wave.groups.reduce((count, group) => count + group.count, 0),
    0,
  ),
  141,
);
for (let index = 1; index < stage03Bundle.waves.length; index += 1) {
  const previous = stage03Bundle.waves[index - 1];
  const current = stage03Bundle.waves[index];
  if (!previous || !current) throw new Error('Stage 03 must contain five complete waves.');
  assert.ok(current.hpMultiplierBp > previous.hpMultiplierBp);
  assert.ok((current.speedMultiplierBp ?? 10_000) > (previous.speedMultiplierBp ?? 10_000));
}
assert.ok(stage03Bundle.waves[4]?.groups.some((group) => group.enemyId === 'MON_DRAGON_TORTOISE'));

const stage04Bundle = createStage04Bundle();
assert.equal(stage04Bundle.stage.id, 'STAGE_04');
assert.equal(stage04Bundle.stage.name, '归墟潮眼');
assert.equal(stage04Bundle.route.towerAnchors.length, 4);
assert.equal(stage04Bundle.tower.rangePx, 750);
assert.equal(stage04Bundle.waves.length, 5);
assert.ok(stage04Bundle.releaseId !== stage03Bundle.releaseId);
assert.ok(stage04Bundle.configHash !== stage03Bundle.configHash);
assert.ok(/^sha256:[0-9a-f]{64}$/.test(stage04Bundle.configHash));
assert.ok(stage04Bundle.configHash !== `sha256:${'0'.repeat(64)}`);
const stage04HashInput = createStage04Bundle();
stage04HashInput.configHash = '';
assert.equal(
  stage04Bundle.configHash,
  `sha256:${createHash('sha256').update(JSON.stringify(stage04HashInput)).digest('hex')}`,
);
assert.ok(stage04Bundle.route.id !== stage03Bundle.route.id);
assert.equal(
  stage04Bundle.waves.reduce(
    (total, wave) => total + wave.groups.reduce((count, group) => count + group.count, 0),
    0,
  ),
  165,
);
assert.ok(stage04Bundle.waves[4]?.groups.some((group) => group.enemyId === 'MON_ABYSS_WYRM'));
assert.equal(stage04Bundle.enemies.MON_ABYSS_WYRM?.maxHpMilli, 1_100_000);
assert.equal(stage04Bundle.enemies.MON_ABYSS_WYRM?.enrageBelowHpBp, 5_000);
assert.equal(stage04Bundle.enemies.MON_ABYSS_WYRM?.enrageSpeedMultiplierBp, 25_000);

const stage05Bundle = createStage05Bundle();
assert.equal(stage05Bundle.stage.id, 'STAGE_05');
assert.equal(stage05Bundle.stage.name, '扶桑天阙');
assert.equal(stage05Bundle.route.towerAnchors.length, 4);
assert.equal(stage05Bundle.tower.rangePx, 750);
assert.equal(stage05Bundle.waves.length, 5);
assert.ok(stage05Bundle.releaseId !== stage04Bundle.releaseId);
assert.ok(stage05Bundle.configHash !== stage04Bundle.configHash);
assert.ok(/^sha256:[0-9a-f]{64}$/.test(stage05Bundle.configHash));
assert.ok(stage05Bundle.configHash !== `sha256:${'0'.repeat(64)}`);
const stage05HashInput = createStage05Bundle();
stage05HashInput.configHash = '';
assert.equal(
  stage05Bundle.configHash,
  `sha256:${createHash('sha256').update(JSON.stringify(stage05HashInput)).digest('hex')}`,
);
assert.ok(stage05Bundle.route.id !== stage04Bundle.route.id);
assert.equal(
  stage05Bundle.waves.reduce(
    (total, wave) => total + wave.groups.reduce((count, group) => count + group.count, 0),
    0,
  ),
  184,
);
assert.ok(stage05Bundle.waves[4]?.groups.some((group) => group.enemyId === 'MON_ECLIPSE_KUN_EMPEROR'));
assert.equal(stage05Bundle.enemies.MON_SOLAR_FORMATION_PRIEST?.guardAuraArmorBp, 5_000);
assert.equal(stage05Bundle.enemies.MON_SOLAR_FORMATION_PRIEST?.guardAuraRadiusPx, 300);
assert.equal(stage05Bundle.enemies.MON_ECLIPSE_KUN_EMPEROR?.maxHpMilli, 1_428_571);
assert.equal(stage05Bundle.enemies.MON_ECLIPSE_KUN_EMPEROR?.guardAuraArmorBp, 2_500);
assert.equal(stage05Bundle.enemies.MON_ECLIPSE_KUN_EMPEROR?.guardAuraRadiusPx, 400);

const stage06Bundle = createStage06Bundle();
assert.deepEqual(BATTLE_STAGE_ORDER, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
  'STAGE_08',
]);
assert.deepEqual(Object.keys(STAGE_BUNDLES), BATTLE_STAGE_ORDER);
assert.equal(stage06Bundle.stage.id, 'STAGE_06');
assert.equal(stage06Bundle.stage.name, '太初蜃庭');
assert.equal(stage06Bundle.route.towerAnchors.length, 4);
assert.equal(stage06Bundle.tower.rangePx, 750);
assert.equal(stage06Bundle.waves.length, 5);
assert.ok(stage06Bundle.releaseId !== stage05Bundle.releaseId);
assert.ok(stage06Bundle.configHash !== stage05Bundle.configHash);
assert.ok(/^sha256:[0-9a-f]{64}$/.test(stage06Bundle.configHash));
assert.ok(stage06Bundle.configHash !== `sha256:${'0'.repeat(64)}`);
const stage06HashInput = createStage06Bundle();
stage06HashInput.configHash = '';
assert.equal(
  stage06Bundle.configHash,
  `sha256:${createHash('sha256').update(JSON.stringify(stage06HashInput)).digest('hex')}`,
);
assert.equal(
  stage06Bundle.waves.reduce(
    (total, wave) => total + wave.groups.reduce((count, group) => count + group.count, 0),
    0,
  ),
  195,
);
assert.ok(stage06Bundle.waves[4]?.groups.some((group) => group.enemyId === 'MON_MIRAGE_MOTHER'));
assert.equal(stage06Bundle.enemies.MON_PHASE_SHELL_WEAVER?.phaseShellAboveHpBp, 6_000);
assert.equal(stage06Bundle.enemies.MON_PHASE_SHELL_WEAVER?.phaseShellMaxHitDamageBp, 250);
assert.equal(stage06Bundle.enemies.MON_MIRAGE_MOTHER?.phaseShellAboveHpBp, 7_000);
assert.equal(stage06Bundle.enemies.MON_MIRAGE_MOTHER?.phaseShellMaxHitDamageBp, 15);
const incompletePhaseShellBundle = createStage06Bundle();
delete incompletePhaseShellBundle.enemies.MON_MIRAGE_MOTHER?.phaseShellMaxHitDamageBp;
let rejectedIncompletePhaseShell = false;
try {
  createBattleSimulation(incompletePhaseShellBundle, 0xbad506);
} catch (error) {
  rejectedIncompletePhaseShell = error instanceof Error && error.message.includes('both phase shell fields');
}
assert.ok(rejectedIncompletePhaseShell);

const invalidPhaseShellBundle = createStage06Bundle();
const invalidPhaseShellBoss = invalidPhaseShellBundle.enemies.MON_MIRAGE_MOTHER;
if (!invalidPhaseShellBoss) throw new Error('Stage 06 invalid phase-shell probe requires its boss.');
invalidPhaseShellBoss.phaseShellMaxHitDamageBp = 5_001;
let rejectedInvalidPhaseShell = false;
try {
  createBattleSimulation(invalidPhaseShellBundle, 0xbad507);
} catch (error) {
  rejectedInvalidPhaseShell = error instanceof Error && error.message.includes('invalid phase shell');
}
assert.ok(rejectedInvalidPhaseShell);

const stage07Bundle = createStage07Bundle();
assert.equal(stage07Bundle.stage.id, 'STAGE_07');
assert.equal(stage07Bundle.stage.name, '山河残卷');
assert.equal(stage07Bundle.route.towerAnchors.length, 4);
assert.equal(stage07Bundle.tower.rangePx, 750);
assert.equal(stage07Bundle.waves.length, 5);
assert.ok(stage07Bundle.releaseId !== stage06Bundle.releaseId);
assert.ok(stage07Bundle.configHash !== stage06Bundle.configHash);
assert.ok(/^sha256:[0-9a-f]{64}$/.test(stage07Bundle.configHash));
assert.ok(stage07Bundle.configHash !== `sha256:${'0'.repeat(64)}`);
const stage07HashInput = createStage07Bundle();
stage07HashInput.configHash = '';
assert.equal(
  stage07Bundle.configHash,
  `sha256:${createHash('sha256').update(JSON.stringify(stage07HashInput)).digest('hex')}`,
);
assert.equal(
  stage07Bundle.waves.reduce(
    (total, wave) => total + wave.groups.reduce((count, group) => count + group.count, 0),
    0,
  ),
  216,
);
assert.ok(stage07Bundle.waves[4]?.groups.some((group) => group.enemyId === 'MON_DUAL_PHASE_BOOK_MOTH'));
assert.equal(stage07Bundle.enemies.MON_ETHEREAL_WALKER?.etherealCycleTicks, 150);
assert.equal(stage07Bundle.enemies.MON_ETHEREAL_WALKER?.etherealSolidTicks, 90);
assert.equal(stage07Bundle.enemies.MON_ETHEREAL_WALKER?.etherealDamageTakenBp, 3_000);
assert.equal(stage07Bundle.enemies.MON_DUAL_PHASE_BOOK_MOTH?.etherealCycleTicks, 210);
assert.equal(stage07Bundle.enemies.MON_DUAL_PHASE_BOOK_MOTH?.etherealSolidTicks, 105);
assert.equal(stage07Bundle.enemies.MON_DUAL_PHASE_BOOK_MOTH?.etherealDamageTakenBp, 2_000);

const incompleteEtherealBundle = createStage07Bundle();
delete incompleteEtherealBundle.enemies.MON_DUAL_PHASE_BOOK_MOTH?.etherealDamageTakenBp;
let rejectedIncompleteEthereal = false;
try {
  createBattleSimulation(incompleteEtherealBundle, 0xbad707);
} catch (error) {
  rejectedIncompleteEthereal = error instanceof Error && error.message.includes('all ethereal phase fields');
}
assert.ok(rejectedIncompleteEthereal);

const invalidEtherealBundle = createStage07Bundle();
const invalidEtherealBoss = invalidEtherealBundle.enemies.MON_DUAL_PHASE_BOOK_MOTH;
if (!invalidEtherealBoss) throw new Error('Stage 07 invalid ethereal probe requires its boss.');
invalidEtherealBoss.etherealSolidTicks = invalidEtherealBoss.etherealCycleTicks;
let rejectedInvalidEthereal = false;
try {
  createBattleSimulation(invalidEtherealBundle, 0xbad708);
} catch (error) {
  rejectedInvalidEthereal = error instanceof Error && error.message.includes('invalid ethereal phase');
}
assert.ok(rejectedInvalidEthereal);

const fixedStageBundles = [
  stage01Bundle,
  stage02Bundle,
  stage03Bundle,
  stage04Bundle,
  stage05Bundle,
  stage06Bundle,
  stage07Bundle,
];
const stage08EndlessRoutes = STAGE_BUNDLES.STAGE_08.endless?.routes ?? [];
assert.equal(stage08EndlessRoutes.length, 3);
assert.deepEqual(stage08EndlessRoutes[0]?.towerAnchors, [
  { x: 800, y: 352 },
  { x: 1088, y: 384 },
  { x: 1440, y: 480 },
]);
assert.deepEqual(
  stage08EndlessRoutes.map((route) => ({
    start: route.points[0],
    pointCount: route.points.length,
    breachPoint: route.breachPoint,
  })),
  [
    { start: { x: 300, y: -70 }, pointCount: 15, breachPoint: { x: 1885, y: 1035 } },
    { start: { x: 330, y: -60 }, pointCount: 15, breachPoint: { x: 1900, y: 1030 } },
    { start: { x: 360, y: -50 }, pointCount: 15, breachPoint: { x: 1915, y: 1005 } },
  ],
);
const breachRoutes = [
  ...fixedStageBundles.map((bundle) => ({ route: bundle.route, towerAnchors: bundle.route.towerAnchors })),
  ...stage08EndlessRoutes.map((route) => ({
    route,
    towerAnchors: route.towerAnchors,
  })),
];
const breachSealPlacements = breachRoutes.map(({ route }) => resolveBreachSealPlacement(route));
const projectedBreachSealPlacements = breachSealPlacements.map(projectBattleWorldPoint);
const breachSealVisualExtents = breachRoutes.map(({ route }) => resolveBreachSealVisualExtents(route));
const projectedSealRadius = BREACH_SEAL_VISUAL_RADIUS * BATTLE_WORLD_SCALE;
const projectedTowerRadius = 112 * BATTLE_WORLD_SCALE;
for (const [index, placement] of breachSealPlacements.entries()) {
  const routeCase = breachRoutes[index];
  const projected = projectedBreachSealPlacements[index];
  const visualExtents = breachSealVisualExtents[index];
  assert.ok(routeCase && projected && visualExtents);
  const projectedSealTop = visualExtents.top * BATTLE_WORLD_SCALE;
  const projectedSealBottom = visualExtents.bottom * BATTLE_WORLD_SCALE;
  assert.ok(Number.isFinite(placement.x));
  assert.ok(Number.isFinite(placement.y));
  assert.ok(Number.isFinite(placement.tangentRadians));
  assert.deepEqual({ x: placement.x, y: placement.y }, routeCase.route.breachPoint);
  assert.deepEqual(routeCase.route.points[routeCase.route.points.length - 1], routeCase.route.breachPoint);
  assert.ok(projected.x - projectedSealRadius >= 0);
  assert.ok(projected.x + projectedSealRadius <= 1_920);
  assert.ok(projected.y - projectedSealTop >= 0);
  assert.ok(projected.y + projectedSealBottom <= 1_080);
  const roundTrip = unprojectBattleWorldPoint(projected);
  assert.ok(Math.abs(roundTrip.x - placement.x) < .000_001);
  assert.ok(Math.abs(roundTrip.y - placement.y) < .000_001);
  if (projected.y + projectedSealBottom > BATTLE_BOTTOM_HUD_TOP) {
    assert.ok(
      projected.x - projectedSealRadius >= BATTLE_BOTTOM_HUD_LEFT_RIGHT + 8 &&
      projected.x + projectedSealRadius <= BATTLE_BOTTOM_HUD_RIGHT_LEFT - 8,
      'A projected breach seal overlaps a bottom HUD module.',
    );
  }
  for (const towerAnchor of routeCase.towerAnchors) {
    const projectedTower = projectBattleWorldPoint(towerAnchor);
    const deltaX = projectedTower.x - projected.x;
    const deltaY = projectedTower.y - projected.y;
    assert.ok(
      Math.hypot(deltaX, deltaY) >= projectedSealRadius + projectedTowerRadius + 16,
      'A projected breach seal overlaps a tower exclusion zone.',
    );
  }
}

const stage06CardLayouts = Array.from({ length: 6 }, (_, index) =>
  resolveHomeStageCardLayout(6, index));
for (const [index, layout] of stage06CardLayouts.entries()) {
  assert.ok(layout.x >= 0);
  assert.ok(layout.x + layout.width <= 1_810);
  assert.ok(layout.hitY + layout.hitHeight <= 750);
  assert.ok(layout.width * (812 / 1_920) >= 44);
  assert.ok(layout.hitHeight * (375 / 1_080) >= 44);
  if (index > 0) {
    const previous = stage06CardLayouts[index - 1];
    if (!previous) throw new Error('Six-card rail requires contiguous layouts.');
    assert.ok(layout.x - (previous.x + previous.width) >= 14);
  }
}

const stage07CardLayouts = Array.from({ length: 7 }, (_, index) =>
  resolveHomeStageCardLayout(7, index));
for (const [index, layout] of stage07CardLayouts.entries()) {
  assert.ok(layout.x >= 0);
  assert.ok(layout.x + layout.width <= 1_810);
  assert.ok(layout.hitY + layout.hitHeight <= 750);
  for (const [viewportWidth, viewportHeight] of [[1_920, 1_080], [1_280, 720], [812, 375]]) {
    const scale = Math.min(viewportWidth / 1_920, viewportHeight / 1_080);
    assert.ok(layout.width * scale >= 44);
    assert.ok(layout.hitHeight * scale >= 44);
  }
  if (index > 0) {
    const previous = stage07CardLayouts[index - 1];
    if (!previous) throw new Error('Seven-card rail requires contiguous layouts.');
    assert.ok(layout.x - (previous.x + previous.width) >= 12);
  }
}

const stage08CardLayouts = Array.from({ length: 8 }, (_, index) =>
  resolveHomeStageCardLayout(8, index));
assert.ok((stage08CardLayouts.at(-1)?.x ?? 1_920) + (stage08CardLayouts.at(-1)?.width ?? 0) <= 1_920);
for (const [index, layout] of stage08CardLayouts.entries()) {
  assert.ok(layout.x >= 0);
  assert.ok(layout.x + layout.width <= 1_920);
  assert.ok(layout.hitY + layout.hitHeight <= 750);
  if (index > 0) {
    const previous = stage08CardLayouts[index - 1];
    if (!previous) throw new Error('Eight-card rail requires contiguous layouts.');
    assert.ok(previous.x + previous.width <= layout.x);
  }
}

const fullHomeViewport = resolveViewportLayout(1_920, 1_080);
const fullHomeSize = {
  width: 1_920,
  height: 1_080,
  pixelRatio: 1,
  safeArea: { left: 0, top: 0, right: 1_920, bottom: 1_080, width: 1_920, height: 1_080 },
};
assert.deepEqual(
  resolveHomeBadgeLayout(fullHomeSize, fullHomeViewport),
  { x: 1_590, y: 46, width: 250, height: 58 },
);

const iphone5Viewport = resolveViewportLayout(568, 320);
const iphone5Menu = { left: 480, top: 5, right: 560, bottom: 36, width: 80, height: 31 };
const iphone5Size = {
  width: 568,
  height: 320,
  pixelRatio: 2,
  safeArea: { left: 0, top: 0, right: 568, bottom: 320, width: 568, height: 320 },
  menuButtonRect: iphone5Menu,
};
const iphone5Badge = resolveHomeBadgeLayout(iphone5Size, iphone5Viewport);
const iphone5BadgeRight = iphone5Viewport.offsetX +
  (iphone5Badge.x + iphone5Badge.width) * iphone5Viewport.scale;
assert.ok(iphone5BadgeRight <= iphone5Menu.left - 12 + .000_001);

const verticallySeparateMenuBadge = resolveHomeBadgeLayout({
  ...iphone5Size,
  menuButtonRect: { ...iphone5Menu, top: 150, bottom: 181 },
}, iphone5Viewport);
assert.equal(verticallySeparateMenuBadge.x, 1_590);

const narrowedSafeAreaBadge = resolveHomeBadgeLayout({
  ...iphone5Size,
  safeArea: { left: 0, top: 0, right: 500, bottom: 320, width: 500, height: 320 },
  menuButtonRect: undefined,
}, iphone5Viewport);
const narrowedBadgeRight = iphone5Viewport.offsetX +
  (narrowedSafeAreaBadge.x + narrowedSafeAreaBadge.width) * iphone5Viewport.scale;
assert.ok(narrowedBadgeRight <= 500 - 12 + .000_001);

const compactHomePresentations = [
  resolveHomeStageCompactPresentation({ id: 'STAGE_01', unlocked: true, completed: false }),
  resolveHomeStageCompactPresentation({ id: 'STAGE_02', unlocked: true, completed: true }),
  resolveHomeStageCompactPresentation({ id: 'STAGE_03', unlocked: false, completed: false }),
  resolveHomeStageCompactPresentation({ id: 'STAGE_08', unlocked: true, completed: false }),
  resolveHomeStageCompactPresentation({
    id: 'STAGE_08',
    unlocked: true,
    completed: false,
    best: [{ routeId: 'ROUTE_A' }, { routeId: 'ROUTE_B' }, { routeId: 'ROUTE_C' }],
  }),
];
assert.deepEqual(
  compactHomePresentations.map((presentation) => presentation.status),
  ['可挑战', '已通关', '未解锁', '待挑战', '3路已录'],
);
for (const [width, height] of [[568, 320], [667, 375], [844, 390]] as const) {
  const viewport = resolveViewportLayout(width, height);
  const compactCardWidthPx = (stage08CardLayouts[0]?.width ?? 0) * viewport.scale -
    16 * viewport.scale;
  for (const presentation of compactHomePresentations) {
    assert.ok(presentation.name.length <= 3);
    assert.ok(presentation.status.length <= 4);
    assert.ok(presentation.name.length * 11 <= compactCardWidthPx);
    assert.ok(presentation.status.length * 9 <= compactCardWidthPx);
  }
  assert.ok((42 - 4) * viewport.scale >= 11);
  assert.ok((80 - 42) * viewport.scale >= 11 * .2 + 9 * .8);
  assert.ok((96 - 80) * viewport.scale >= 9 * .25);

  const shortcuts = Array.from({ length: 3 }, (_, index) =>
    resolveShopShortcutLayout(viewport.scale, index));
  for (const [index, shortcut] of shortcuts.entries()) {
    assert.ok(shortcut.compact);
    assert.equal(shortcut.width, 330);
    assert.ok(shortcut.iconX + shortcut.iconSize <= shortcut.textX);
    assert.ok(shortcut.textX + shortcut.textWidth <= shortcut.actionX - 8);
    assert.ok(shortcut.actionX + shortcut.actionWidth <= shortcut.x + shortcut.width - 8);
    assert.ok(shortcut.priceY + shortcut.actionHeight <= shortcut.statusY);
    assert.ok(shortcut.statusY + shortcut.actionHeight <= shortcut.y + shortcut.height - 10);
    assert.ok(shortcut.actionHeight * viewport.scale >= 8);
    assert.ok(shortcut.x + shortcut.width <= 372);
    assert.ok(shortcut.y + shortcut.height <= 870);
    if (index > 0) {
      const previous = shortcuts[index - 1];
      if (!previous) throw new Error('Shortcut rail requires contiguous layouts.');
      assert.ok(previous.y + previous.height <= shortcut.y);
    }
  }
}
assert.ok(!resolveShopShortcutLayout(resolveViewportLayout(1_280, 720).scale, 0).compact);

const compactShortcutBase = {
  compact: true,
  qualityName: '绝品',
  cardName: '箭矢数量',
  metric: { label: '每轮箭矢', before: '1 支', after: '3 支' },
  cost: 140,
  shortfall: 140,
  full: false,
  atCap: false,
  affordable: false,
};
assert.deepEqual(resolveShopShortcutText(compactShortcutBase), {
  title: '箭矢数量',
  metric: '1→3',
  price: '140功',
  status: '差140',
});
assert.equal(resolveShopShortcutText({ ...compactShortcutBase, affordable: true }).status, '可换');
assert.equal(resolveShopShortcutText({ ...compactShortcutBase, atCap: true }).status, '封顶');
assert.equal(resolveShopShortcutText({ ...compactShortcutBase, full: true }).status, '已满');
assert.equal(resolveShopShortcutText({
  ...compactShortcutBase,
  cardName: '会心术',
  metric: { label: '暴击伤害', before: '150%', after: '169.8%' },
}).metric, '→169.8%');
assert.deepEqual(resolveShopShortcutText({ ...compactShortcutBase, compact: false }), {
  title: '绝品 · 箭矢数量',
  metric: '每轮箭矢 1 支 → 3 支',
  price: '140 战功',
  status: '还差 140',
});

function estimatedCompactTextWidthPx(value: string, fontSizePx: number): number {
  const units = [...value].reduce((sum, character) => {
    if (/\d/u.test(character)) return sum + .55;
    if (character === '.') return sum + .35;
    if (character === '%') return sum + .75;
    return sum + 1;
  }, 0);
  return units * fontSizePx;
}

const iphone5Shortcut = resolveShopShortcutLayout(iphone5Viewport.scale, 0);
const longCompactMetric = resolveShopShortcutText({
  ...compactShortcutBase,
  cardName: '会心术',
  metric: { label: '暴击伤害', before: '150%', after: '169.8%' },
});
for (const [value, fontSizePx, availableDesignWidth] of [
  [compactShortcutBase.cardName, 9, iphone5Shortcut.textWidth],
  [longCompactMetric.metric, 8, iphone5Shortcut.textWidth],
  [longCompactMetric.price, 8, iphone5Shortcut.actionWidth - 12],
  [longCompactMetric.status, 8, iphone5Shortcut.actionWidth - 12],
] as const) {
  assert.ok(
    estimatedCompactTextWidthPx(value, fontSizePx) <=
      availableDesignWidth * iphone5Viewport.scale,
  );
}

const responsiveViewports = [
  [1_920, 1_080],
  [2_400, 1_080],
  [568, 320],
  [667, 375],
  [844, 390],
  [852, 393],
  [800, 360],
  [840, 360],
  [1_280, 800],
  [1_024, 768],
] as const;
for (const [width, height] of responsiveViewports) {
  const viewport = resolveViewportLayout(width, height);
  assert.ok(viewport.scale > 0);
  assert.ok(Math.abs(viewport.left * viewport.scale + viewport.offsetX) < 0.000_001);
  assert.ok(Math.abs(viewport.top * viewport.scale + viewport.offsetY) < 0.000_001);
  assert.ok(Math.abs(viewport.right * viewport.scale + viewport.offsetX - width) < 0.000_001);
  assert.ok(Math.abs(viewport.bottom * viewport.scale + viewport.offsetY - height) < 0.000_001);
  assert.ok(viewport.left <= 0 && viewport.top <= 0);
  assert.ok(viewport.right >= 1_920 && viewport.bottom >= 1_080);

  const cardLayout = resolveCardOverlayLayout(viewport);
  const contentLayout = resolveCardOverlayContentLayout(viewport.scale);
  for (const start of cardLayout.starts) {
    assert.ok(start >= viewport.left);
    assert.ok(start + cardLayout.cardWidth <= viewport.right);
  }
  assert.ok(cardLayout.starts[1] > cardLayout.starts[0] + cardLayout.cardWidth);
  assert.ok(cardLayout.starts[2] > cardLayout.starts[1] + cardLayout.cardWidth);

  const costPillLeft = (cardLayout.cardWidth - contentLayout.costPillWidth) / 2;
  const costPillRight = costPillLeft + contentLayout.costPillWidth;
  const qualityPillLeft = cardLayout.cardWidth -
    contentLayout.metaSideInset -
    contentLayout.qualityPillWidth;
  assert.ok(qualityPillLeft - costPillRight >= 24);
  assert.ok(contentLayout.metaTop + contentLayout.metaHeight < contentLayout.iconTop);
  assert.ok(
    contentLayout.iconTop + contentLayout.iconSize <=
      contentLayout.titleBaseline - contentLayout.typography.title,
  );
  assert.ok(
    contentLayout.titleBaseline + contentLayout.typography.title * .35 < contentLayout.dividerY,
  );
  assert.ok(contentLayout.dividerY < contentLayout.metricTop);
  assert.ok(
    contentLayout.masteryMetricBaselines[1] - contentLayout.masteryMetricBaselines[0] >=
      contentLayout.typography.masteryValue * 1.4,
  );
  assert.ok(
    contentLayout.deltaBaseline - contentLayout.masteryMetricBaselines[1] >=
      Math.max(contentLayout.typography.masteryValue, contentLayout.typography.delta) * 1.4,
  );
  assert.ok(
    contentLayout.deltaBaseline - contentLayout.singleMetricBaseline >=
      Math.max(contentLayout.typography.value, contentLayout.typography.delta) * 1.4,
  );
  assert.ok(contentLayout.metricTop + contentLayout.metricHeight < contentLayout.actionTop);
  assert.ok(contentLayout.actionTop + contentLayout.actionHeight <= cardLayout.cardHeight);
  assert.ok(cardLayout.cardY - 210 >= contentLayout.typography.subtitle * 1.5);
}

const twentyByNineViewport = resolveViewportLayout(2_400, 1_080);
assert.equal(twentyByNineViewport.left, -240);
assert.equal(twentyByNineViewport.right, 2_160);
assert.deepEqual(resolveCardOverlayLayout(twentyByNineViewport).starts, [90, 710, 1_330]);
const compactCardContent = resolveCardOverlayContentLayout(resolveViewportLayout(800, 360).scale);
assert.equal(compactCardContent.typography.meta, 22);
assert.equal(compactCardContent.typography.title, 36);
assert.equal(compactCardContent.typography.label, 20);
assert.equal(compactCardContent.typography.value, 30);
assert.equal(compactCardContent.typography.masteryValue, 24);
assert.equal(compactCardContent.typography.delta, 20);
assert.equal(compactCardContent.typography.action, 27);
assert.equal(resolveCanvasFontWeight(450), 'normal');
assert.equal(resolveCanvasFontWeight(650), 'bold');
assert.equal(resolveCanvasFontWeight(720), 'bold');

const stage03FirstVictory = runStageToVictory(createStage03Bundle(), 0x5a6e0303);
const stage03SecondVictory = runStageToVictory(createStage03Bundle(), 0x5a6e0303);
assertVictory(stage03FirstVictory, 141);
assertVictory(stage03SecondVictory, 141);
const stage03Distribution = stageCombatDistribution(stage03FirstVictory.events, stage03Bundle.waves.length);
assert.equal(
  stage03FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_DRAGON_TORTOISE',
  ).length,
  1,
);
for (const waveIndex of [2, 3, 4]) {
  const towerAttacks = stage03Distribution.attacksByWave[waveIndex] ?? [];
  const activeTowerAttacks = towerAttacks.filter((count) => count > 0);
  const minimumAttacks = waveIndex === 2 ? 6 : 10;
  assert.ok(activeTowerAttacks.length >= 2);
  assert.ok(
    activeTowerAttacks.every((count) => count >= minimumAttacks),
    `Stage 03 wave ${waveIndex + 1} attack density ${JSON.stringify(towerAttacks)}`,
  );
  assert.ok(
    Math.max(...activeTowerAttacks) / Math.max(1, Math.min(...activeTowerAttacks)) <= 3,
    `Stage 03 wave ${waveIndex + 1} tower imbalance ${JSON.stringify(towerAttacks)}`,
  );
}
assert.ok((stage03Distribution.peakAliveByWave[4] ?? 0) >= 7);
assert.ok((stage03Distribution.peakAliveByWave[4] ?? 0) <= 35);
assert.equal(stage03FirstVictory.simulation.getChecksum(), stage03SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage03FirstVictory.events.map((event) => [event.tick, event.type]),
  stage03SecondVictory.events.map((event) => [event.tick, event.type]),
);

const enrageProbeBundle = createStage04Bundle();
const firstProbeWave = enrageProbeBundle.waves[0];
if (!firstProbeWave) throw new Error('Stage 04 enrage probe requires its first wave.');
firstProbeWave.groups = [{ enemyId: 'MON_ABYSS_WYRM', count: 1, intervalTicks: 1 }];
firstProbeWave.hpMultiplierBp = 10_000;
enrageProbeBundle.tower.rangePx = 5_000;
enrageProbeBundle.tower.attackIntervalTicks = 1;
enrageProbeBundle.tower.baseDamageMilli = 40_000;
enrageProbeBundle.tower.projectileSpeedPxPerSecond = 5_000;
const enrageProbe = createBattleSimulation(enrageProbeBundle, 0xe04a9e);
startPreparedWave(enrageProbe);
let sawCalmBoss = false;
let sawEnragedBoss = false;
for (let tick = 0; tick < 300 && !sawEnragedBoss; tick += 1) {
  enrageProbe.advanceTicks(1);
  const boss = enrageProbe.getRenderSnapshot().entities.find(
    (entity) => entity.renderKind === 'enemy' && entity.assetId === 'MON_ABYSS_WYRM',
  );
  if (!boss) continue;
  if ((boss.flags & ENEMY_FLAG_ENRAGED) === 0) sawCalmBoss = true;
  else sawEnragedBoss = true;
}
assert.ok(sawCalmBoss);
assert.ok(sawEnragedBoss);

const stage04FirstVictory = runStageToVictory(createStage04Bundle(), 0x5a6e0404);
const stage04SecondVictory = runStageToVictory(createStage04Bundle(), 0x5a6e0404);
assertVictory(stage04FirstVictory, 165);
assertVictory(stage04SecondVictory, 165);
const stage04Distribution = stageCombatDistribution(stage04FirstVictory.events, stage04Bundle.waves.length);
assert.equal(
  stage04FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_ABYSS_WYRM',
  ).length,
  1,
);
for (const waveIndex of [2, 3, 4]) {
  const towerAttacks = stage04Distribution.attacksByWave[waveIndex] ?? [];
  const activeTowerAttacks = towerAttacks.filter((count) => count > 0);
  const minimumAttacks = waveIndex === 2 ? 10 : waveIndex === 3 ? 16 : 20;
  assert.ok(activeTowerAttacks.length >= 2);
  assert.ok(
    activeTowerAttacks.every((count) => count >= minimumAttacks),
    `Stage 04 wave ${waveIndex + 1} attack density ${JSON.stringify(towerAttacks)}`,
  );
  assert.ok(
    Math.max(...activeTowerAttacks) / Math.max(1, Math.min(...activeTowerAttacks)) <= 3,
  );
  assert.ok((stage04Distribution.peakAliveByWave[waveIndex] ?? 0) >= 8);
  assert.ok((stage04Distribution.peakAliveByWave[waveIndex] ?? 0) <= 45);
}
assert.equal(stage04FirstVictory.simulation.getChecksum(), stage04SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage04FirstVictory.events.map((event) => [event.tick, event.type]),
  stage04SecondVictory.events.map((event) => [event.tick, event.type]),
);

function auraProbeBundle(enabled: boolean): BattleBundleV1 {
  const bundle = createStage05Bundle();
  // Keep this combat-rule probe independent from the authored map-platform layout.
  // Projectile travel timing must remain stable so the first hit exercises an
  // already-established guard aura instead of whichever tower pad is nearest.
  bundle.route.towerAnchors = [
    { x: 570, y: 355 },
    { x: 1382, y: 354 },
    { x: 463, y: 620 },
    { x: 1152, y: 608 },
  ];
  const firstWave = bundle.waves[0];
  const priest = bundle.enemies.MON_SOLAR_FORMATION_PRIEST;
  if (!firstWave || !priest) throw new Error('Stage 05 aura probe requires its first wave and priest.');
  firstWave.groups = [{ enemyId: priest.id, count: 3, intervalTicks: 1 }];
  firstWave.hpMultiplierBp = 10_000;
  bundle.rules.groupGapTicks = 1;
  bundle.tower.rangePx = 5_000;
  bundle.tower.attackIntervalTicks = 200;
  bundle.tower.projectileSpeedPxPerSecond = 5_000;
  bundle.tower.baseDamageMilli = 10_000;
  bundle.tower.critChanceBp = 0;
  if (!enabled) {
    delete priest.guardAuraArmorBp;
    delete priest.guardAuraRadiusPx;
  }
  return bundle;
}

function firstAuraProbeHit(bundle: BattleBundleV1): {
  damageMilli: number;
  enemyFlags: number[];
} {
  const simulation = createBattleSimulation(bundle, 0xa05a05);
  startPreparedWave(simulation);
  let enemyFlags: number[] = [];
  for (let tick = 0; tick < 180; tick += 1) {
    const output = simulation.advanceTicks(1);
    const currentFlags = simulation.getRenderSnapshot().entities
      .filter((entity) => entity.renderKind === 'enemy')
      .map((entity) => entity.flags);
    if (currentFlags.length >= 2) enemyFlags = currentFlags;
    const hit = output.events.find((event) => event.type === 'HIT');
    if (hit?.type === 'HIT') return { damageMilli: hit.damageMilli, enemyFlags };
  }
  throw new Error('Stage 05 aura probe did not produce a hit.');
}

const guardedProbe = firstAuraProbeHit(auraProbeBundle(true));
const unguardedProbe = firstAuraProbeHit(auraProbeBundle(false));
assert.ok(guardedProbe.enemyFlags.every((flags) => (flags & ENEMY_FLAG_GUARD_AURA) !== 0));
assert.ok(guardedProbe.enemyFlags.every((flags) => (flags & ENEMY_FLAG_GUARDED) !== 0));
assert.equal(guardedProbe.damageMilli, 5_000);
assert.equal(unguardedProbe.damageMilli, 10_000);
const cappedAuraBundle = auraProbeBundle(true);
const cappedPriest = cappedAuraBundle.enemies.MON_SOLAR_FORMATION_PRIEST;
if (!cappedPriest) throw new Error('Stage 05 capped aura probe requires its priest.');
cappedPriest.armorBp = 5_000;
assert.equal(firstAuraProbeHit(cappedAuraBundle).damageMilli, 1_500);

const selfAuraBundle = auraProbeBundle(true);
const selfAuraFirstWave = selfAuraBundle.waves[0];
if (!selfAuraFirstWave) throw new Error('Stage 05 self-aura probe requires its first wave.');
selfAuraFirstWave.groups = [{ enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 1, intervalTicks: 1 }];
const selfAuraSimulation = createBattleSimulation(selfAuraBundle, 0x51f0a05);
startPreparedWave(selfAuraSimulation);
let selfAuraFlags = 0;
for (let tick = 0; tick < 90; tick += 1) {
  selfAuraSimulation.advanceTicks(1);
  selfAuraFlags = selfAuraSimulation.getRenderSnapshot().entities.find(
    (entity) => entity.renderKind === 'enemy',
  )?.flags ?? selfAuraFlags;
}
assert.ok((selfAuraFlags & ENEMY_FLAG_GUARD_AURA) !== 0);
assert.equal(selfAuraFlags & ENEMY_FLAG_GUARDED, 0);

const stage05FirstVictory = runStageToVictory(createStage05Bundle(), 0x5a6e0505);
const stage05SecondVictory = runStageToVictory(createStage05Bundle(), 0x5a6e0505);
assertVictory(stage05FirstVictory, 184);
assertVictory(stage05SecondVictory, 184);
const stage05Distribution = stageCombatDistribution(stage05FirstVictory.events, stage05Bundle.waves.length);
assert.equal(
  stage05FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_ECLIPSE_KUN_EMPEROR',
  ).length,
  1,
);
for (const waveIndex of [0, 1, 2, 3, 4]) {
  const towerAttacks = stage05Distribution.attacksByWave[waveIndex] ?? [];
  const activeTowerAttacks = towerAttacks.filter((count) => count > 0);
  if (waveIndex < 2) assert.equal(towerAttacks[2], 0);
  assert.ok(activeTowerAttacks.length >= 2);
  assert.ok(activeTowerAttacks.every((count) => count >= 3));
  assert.ok(
    Math.max(...activeTowerAttacks) / Math.max(1, Math.min(...activeTowerAttacks)) <= 3,
  );
  assert.ok((stage05Distribution.peakAliveByWave[waveIndex] ?? 0) >= 5);
  assert.ok((stage05Distribution.peakAliveByWave[waveIndex] ?? 0) <= 50);
}
assert.equal(stage05FirstVictory.simulation.getChecksum(), stage05SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage05FirstVictory.events.map((event) => [event.tick, event.type]),
  stage05SecondVictory.events.map((event) => [event.tick, event.type]),
);

function phaseShellProbeBundle(enabled: boolean): BattleBundleV1 {
  const bundle = createStage06Bundle();
  const firstWave = bundle.waves[0];
  const boss = bundle.enemies.MON_MIRAGE_MOTHER;
  if (!firstWave || !boss) throw new Error('Stage 06 phase-shell probe requires its first wave and boss.');
  firstWave.groups = [{ enemyId: boss.id, count: 1, intervalTicks: 1 }];
  firstWave.hpMultiplierBp = 10_000;
  boss.maxHpMilli = 1_000_000;
  boss.armorBp = 0;
  boss.phaseShellAboveHpBp = 9_700;
  boss.phaseShellMaxHitDamageBp = 100;
  bundle.tower.rangePx = 5_000;
  bundle.tower.attackIntervalTicks = 1;
  bundle.tower.projectileSpeedPxPerSecond = 5_000;
  bundle.tower.baseDamageMilli = 20_000;
  bundle.tower.critChanceBp = 10_000;
  bundle.tower.critDamageBp = 15_000;
  if (!enabled) {
    delete boss.phaseShellAboveHpBp;
    delete boss.phaseShellMaxHitDamageBp;
  }
  return bundle;
}

interface PhaseShellProbeResult {
  hitDamages: number[];
  hitCritical: boolean[];
  sawActiveFlag: boolean;
  sawBrokenFlagAtThreshold: boolean;
  restoredAtThreshold: boolean;
}

function runPhaseShellProbe(bundle: BattleBundleV1): PhaseShellProbeResult {
  const simulation = createFixedMechanicSimulation(bundle, 0x506e11, [0, 1, 2]);
  startPreparedWave(simulation);
  const hitDamages: number[] = [];
  const hitCritical: boolean[] = [];
  let sawActiveFlag = false;
  let sawBrokenFlagAtThreshold = false;
  let restoredAtThreshold = false;
  for (let tick = 0; tick < 180 && hitDamages.length < 4; tick += 1) {
    const output = simulation.advanceTicks(1);
    const enemy = simulation.getRenderSnapshot().entities.find((entity) => entity.renderKind === 'enemy');
    if (enemy && (enemy.flags & ENEMY_FLAG_PHASE_SHELL) !== 0) sawActiveFlag = true;
    for (const event of output.events) {
      if (event.type !== 'HIT') continue;
      hitDamages.push(event.damageMilli);
      hitCritical.push(event.critical);
      if (hitDamages.length === 3) {
        const thresholdEnemy = simulation.getRenderSnapshot().entities.find(
          (entity) => entity.renderKind === 'enemy',
        );
        sawBrokenFlagAtThreshold = Boolean(
          thresholdEnemy && (thresholdEnemy.flags & ENEMY_FLAG_PHASE_SHELL) === 0,
        );
        const checkpointAtThreshold = simulation.createCheckpoint();
        const restored = createBattleSimulation(bundle, 0x506e11, checkpointAtThreshold);
        restoredAtThreshold =
          restored.getChecksum() === simulation.getChecksum() &&
          ((restored.getRenderSnapshot().entities.find((entity) => entity.renderKind === 'enemy')?.flags ?? 0)
            & ENEMY_FLAG_PHASE_SHELL) === 0;
      }
    }
  }
  return { hitDamages, hitCritical, sawActiveFlag, sawBrokenFlagAtThreshold, restoredAtThreshold };
}

const phaseShellProbe = runPhaseShellProbe(phaseShellProbeBundle(true));
const noPhaseShellProbe = runPhaseShellProbe(phaseShellProbeBundle(false));
assert.deepEqual(phaseShellProbe.hitDamages.slice(0, 4), [10_000, 10_000, 10_000, 30_000]);
assert.ok(phaseShellProbe.hitCritical.slice(0, 4).some(Boolean));
assert.ok(phaseShellProbe.sawActiveFlag);
assert.ok(phaseShellProbe.sawBrokenFlagAtThreshold);
assert.ok(phaseShellProbe.restoredAtThreshold);
assert.equal(noPhaseShellProbe.hitDamages[0], 30_000);
assert.equal(noPhaseShellProbe.sawActiveFlag, false);

const stage06FirstVictory = runStageToVictory(createStage06Bundle(), 0x5a6e0606);
const stage06SecondVictory = runStageToVictory(createStage06Bundle(), 0x5a6e0606);
assertVictory(stage06FirstVictory, 195);
assertVictory(stage06SecondVictory, 195);
const stage06Distribution = stageCombatDistribution(stage06FirstVictory.events, stage06Bundle.waves.length);
assert.equal(
  stage06FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_MIRAGE_MOTHER',
  ).length,
  1,
);
for (const waveIndex of [0, 1, 2, 3, 4]) {
  const towerAttacks = stage06Distribution.attacksByWave[waveIndex] ?? [];
  const activeTowerAttacks = towerAttacks.filter((count) => count > 0);
  if (waveIndex < 2) assert.equal(towerAttacks[2], 0);
  assert.ok(
    activeTowerAttacks.length >= 2,
    `Stage 06 wave ${waveIndex + 1} active tower count ${JSON.stringify(towerAttacks)}`,
  );
  const minimumAttacks = waveIndex === 0 ? 8 : 10;
  assert.ok(
    activeTowerAttacks.every((count) => count >= minimumAttacks),
    `Stage 06 wave ${waveIndex + 1} attack density ${JSON.stringify(towerAttacks)}`,
  );
  assert.ok(
    Math.max(...activeTowerAttacks) / Math.max(1, Math.min(...activeTowerAttacks)) <= 3,
  );
  assert.ok((stage06Distribution.peakAliveByWave[waveIndex] ?? 0) >= 5);
  assert.ok((stage06Distribution.peakAliveByWave[waveIndex] ?? 0) <= 55);
}
assert.equal(stage06FirstVictory.simulation.getChecksum(), stage06SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage06FirstVictory.events.map((event) => [event.tick, event.type]),
  stage06SecondVictory.events.map((event) => [event.tick, event.type]),
);

function etherealProbeBundle(enabled: boolean): BattleBundleV1 {
  const bundle = createStage07Bundle();
  const firstWave = bundle.waves[0];
  const boss = bundle.enemies.MON_DUAL_PHASE_BOOK_MOTH;
  if (!firstWave || !boss) throw new Error('Stage 07 ethereal probe requires its first wave and boss.');
  firstWave.groups = [{ enemyId: boss.id, count: 1, intervalTicks: 1 }];
  firstWave.hpMultiplierBp = 10_000;
  boss.maxHpMilli = 300_000;
  boss.armorBp = 0;
  boss.etherealCycleTicks = 60;
  boss.etherealSolidTicks = 30;
  boss.etherealDamageTakenBp = 2_000;
  bundle.tower.rangePx = 5_000;
  bundle.tower.aimHalfAngleU16 = 0;
  bundle.tower.attackIntervalTicks = 6;
  bundle.tower.projectileSpeedPxPerSecond = 5_000;
  bundle.tower.baseDamageMilli = 1_000;
  bundle.tower.critChanceBp = 0;
  if (!enabled) {
    delete boss.etherealCycleTicks;
    delete boss.etherealSolidTicks;
    delete boss.etherealDamageTakenBp;
  }
  return bundle;
}

function runEtherealProbe(bundle: BattleBundleV1): {
  solidDamage: number;
  etherealDamage: number;
  sawSolid: boolean;
  sawEthereal: boolean;
  restoredEthereal: boolean;
} {
  const simulation = createBattleSimulation(bundle, 0x707e7e);
  startPreparedWave(simulation);
  let solidDamage = 0;
  let etherealDamage = 0;
  let sawSolid = false;
  let sawEthereal = false;
  let restoredEthereal = false;
  for (let tick = 0; tick < 360 && (!solidDamage || !etherealDamage); tick += 1) {
    const output = simulation.advanceTicks(1);
    const enemy = simulation.getRenderSnapshot().entities.find((entity) => entity.renderKind === 'enemy');
    if (!enemy) continue;
    const ethereal = (enemy.flags & ENEMY_FLAG_ETHEREAL) !== 0;
    if (ethereal) {
      sawEthereal = true;
      if (!restoredEthereal) {
        const checkpoint = simulation.createCheckpoint();
        const restored = createBattleSimulation(bundle, 0x707e7e, checkpoint);
        restoredEthereal =
          restored.getChecksum() === simulation.getChecksum() &&
          ((restored.getRenderSnapshot().entities.find((entity) => entity.renderKind === 'enemy')?.flags ?? 0)
            & ENEMY_FLAG_ETHEREAL) !== 0;
      }
    } else {
      sawSolid = true;
    }
    const hit = output.events.find((event) => event.type === 'HIT');
    if (hit?.type !== 'HIT') continue;
    if (hit.damageMilli === 200) etherealDamage = hit.damageMilli;
    if (hit.damageMilli === 1_000) solidDamage = hit.damageMilli;
  }
  return { solidDamage, etherealDamage, sawSolid, sawEthereal, restoredEthereal };
}

const etherealProbe = runEtherealProbe(etherealProbeBundle(true));
const noEtherealProbe = runEtherealProbe(etherealProbeBundle(false));
assert.equal(etherealProbe.solidDamage, 1_000);
assert.equal(etherealProbe.etherealDamage, 200);
assert.ok(etherealProbe.sawSolid);
assert.ok(etherealProbe.sawEthereal);
assert.ok(etherealProbe.restoredEthereal);
assert.equal(noEtherealProbe.solidDamage, 1_000);
assert.equal(noEtherealProbe.etherealDamage, 0);
assert.equal(noEtherealProbe.sawEthereal, false);

const stage07FirstVictory = runStageToVictory(createStage07Bundle(), 0x9e3779b1);
const stage07SecondVictory = runStageToVictory(createStage07Bundle(), 0x9e3779b1);
assertVictory(stage07FirstVictory, 216);
assertVictory(stage07SecondVictory, 216);
const stage07Distribution = stageCombatDistribution(stage07FirstVictory.events, stage07Bundle.waves.length);
assert.equal(
  stage07FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_DUAL_PHASE_BOOK_MOTH',
  ).length,
  1,
);
for (const waveIndex of [0, 1, 2, 3, 4]) {
  const towerAttacks = stage07Distribution.attacksByWave[waveIndex] ?? [];
  assert.ok(towerAttacks.some((count) => count > 0));
  assert.ok(
    towerAttacks.reduce((sum, count) => sum + count, 0) >= 10,
    `Stage 07 wave ${waveIndex + 1} attack density ${JSON.stringify(towerAttacks)}`,
  );
  const minimumPeakAlive = waveIndex === 0 ? 4 : 5;
  assert.ok(
    (stage07Distribution.peakAliveByWave[waveIndex] ?? 0) >= minimumPeakAlive,
    `Stage 07 wave ${waveIndex + 1} peak alive ${String(stage07Distribution.peakAliveByWave[waveIndex])}`,
  );
  assert.ok((stage07Distribution.peakAliveByWave[waveIndex] ?? 0) <= 60);
}
assert.ok([0, 1, 2, 3].every((towerId) =>
  stage07Distribution.attacksByWave.reduce(
    (sum, attacks) => sum + (attacks[towerId] ?? 0),
    0,
  ) > 0
));
assert.equal(stage07FirstVictory.simulation.getChecksum(), stage07SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage07FirstVictory.events.map((event) => [event.tick, event.type]),
  stage07SecondVictory.events.map((event) => [event.tick, event.type]),
);
const stage07FinalHud = stage07FirstVictory.simulation.getHudProjection();
const stage07PurchaseCount = stage07FirstVictory.events.filter(
  (event) => event.type === 'CARD_PURCHASED',
).length;

let rejectedStage06CheckpointInStage07 = false;
try {
  createBattleSimulation(createStage07Bundle(), 0x5a6e0707, stage06FirstVictory.simulation.createCheckpoint());
} catch (error) {
  rejectedStage06CheckpointInStage07 = error instanceof Error && error.message.includes('release does not match');
}
assert.ok(rejectedStage06CheckpointInStage07);

let rejectedCrossStageCheckpoint = false;
try {
  createBattleSimulation(createStage01Bundle(), 0x5a6e0202, stage02FirstVictory.simulation.createCheckpoint());
} catch (error) {
  rejectedCrossStageCheckpoint = error instanceof Error && error.message.includes('release does not match');
}
assert.ok(rejectedCrossStageCheckpoint);

console.log('✓ 30 Hz 与 1/2 倍速逻辑通过');
console.log('✓ 四塔位独立优先方向、自动索敌回退、自动转向、弹体旗标与三塔旧存档迁移通过');
console.log('✓ checkpoint 编解码、校验和确定性恢复通过');
console.log('✓ 本地发牌 Authority 快照恢复通过');
console.log('✓ Stage 01 五波、95 名敌人与胜利结算通过');
console.log('✓ Stage 02 独立配置、五波 130 名敌人、确定性与完整通关通过');
console.log(`✓ Stage 02 四塔位逐波出手 ${JSON.stringify(stage02Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage02Distribution.peakAliveByWave)}`);
console.log('✓ Stage 03 五波 141 名敌人、疾潮递增、重甲与首领出场顺序通过');
console.log(`✓ Stage 03 四塔位逐波出手 ${JSON.stringify(stage03Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage03Distribution.peakAliveByWave)}`);
console.log('✓ Stage 04 五波 165 名敌人、残血狂潮与噬潮魔蛟首领阶段通过');
console.log(`✓ Stage 04 四塔位逐波出手 ${JSON.stringify(stage04Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage04Distribution.peakAliveByWave)}`);
console.log('✓ Stage 05 五波 184 名敌人、护阵光环与蚀日鲲皇首领阶段通过');
console.log(`✓ Stage 05 四塔位逐波出手 ${JSON.stringify(stage05Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage05Distribution.peakAliveByWave)}`);
console.log('✓ Stage 06 五波 195 名敌人、相壳阈值/限伤/恢复与万相蜃母首领阶段通过');
console.log(`✓ Stage 06 四塔位逐波出手 ${JSON.stringify(stage06Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage06Distribution.peakAliveByWave)}`);
console.log('✓ Stage 07 五波 216 名敌人、虚实轮转/恢复与双相天蠹首领阶段通过');
console.log(`✓ Stage 07 四塔位逐波出手 ${JSON.stringify(stage07Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage07Distribution.peakAliveByWave)}；结算关印 ${stage07FinalHud.gateIntegrity}/${stage07FinalHud.gateIntegrityMax}，战功 ${stage07FinalHud.warPointsBalance}/${stage07FinalHud.warPointsEarned}，购买 ${stage07PurchaseCount} 次`);
console.log(`✓ 七关与无尽三路的真实终点、可见关印、塔位和双侧 HUD 安全区一致 ${JSON.stringify(projectedBreachSealPlacements.map((point) => [Math.round(point.x), Math.round(point.y)]))}`);
