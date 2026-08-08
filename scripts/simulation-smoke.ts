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
  STAGE_BUNDLES,
} from '../src/core/content';
import {
  BATTLE_STAGE_ORDER,
  DEFAULT_AIM_ANGLE_U16,
  ENEMY_FLAG_ENRAGED,
  ENEMY_FLAG_GUARD_AURA,
  ENEMY_FLAG_GUARDED,
  ENEMY_FLAG_PHASE_SHELL,
  PROJECTILE_FLAG_CRITICAL,
  PROJECTILE_FLAG_PENETRATION,
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  type AuthorityEventV1,
  type BattleBundleV1,
  type BattleEvent,
  type Point,
} from '../src/core/contracts';
import { LocalPracticeAuthority } from '../src/core/local-authority';
import { checkpointChecksum, decodeText, encodeText } from '../src/platform/wechat';
import {
  BREACH_SEAL_MAX_Y,
  resolveBreachSealPlacement,
  resolveHomeStageCardLayout,
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
  ok(value: unknown): void {
    if (!value) throw new Error(`Expected a truthy value, received ${String(value)}`);
  },
};

const oneX = createBattleSimulation(createStage01Bundle(), 0x12345678);
const twoX = createBattleSimulation(createStage01Bundle(), 0x12345678);
twoX.applyCommand({ seq: 1, type: 'SET_SPEED', value: 2 });
assert.equal(oneX.advanceWallTime(1_000).ticksAdvanced, 30);
assert.equal(twoX.advanceWallTime(1_000).ticksAdvanced, 60);

assert.deepEqual(oneX.getHudProjection().aimAnglesU16, [
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
  DEFAULT_AIM_ANGLE_U16,
]);
oneX.applyCommand({ seq: 2, type: 'SET_AIM', towerId: 0, angleU16: 12_345 });
oneX.applyCommand({ seq: 3, type: 'SET_AIM', towerId: 1, angleU16: 23_456 });
oneX.applyCommand({ seq: 4, type: 'SET_AIM', towerId: 2, angleU16: 34_567 });
assert.deepEqual(oneX.getHudProjection().aimAnglesU16, [12_345, 23_456, 34_567]);
const rejectedAim = oneX.applyCommand({
  seq: 5,
  type: 'SET_AIM',
  towerId: 3,
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
assert.deepEqual(oneX.getHudProjection().aimAnglesU16, [12_345, 23_456, 34_567]);
oneX.advanceTicks(90);
const checkpoint = oneX.createCheckpoint();
const restored = createBattleSimulation(createStage01Bundle(), 0x12345678, checkpoint);
assert.equal(restored.getChecksum(), oneX.getChecksum());
assert.deepEqual(restored.createCheckpoint(), checkpoint);
const checkpointText = decodeText(checkpoint);
assert.deepEqual(encodeText(checkpointText), checkpoint);
assert.equal(checkpointChecksum(checkpointText), checkpointChecksum(checkpointText));

const legacyCheckpoint = JSON.parse(checkpointText) as {
  schemaVersion: number;
  state: Record<string, unknown>;
};
legacyCheckpoint.schemaVersion = 2;
legacyCheckpoint.state.aimAngleU16 = 54_321;
delete legacyCheckpoint.state.aimAnglesU16;
const migratedLegacy = createBattleSimulation(
  createStage01Bundle(),
  0x12345678,
  encodeText(JSON.stringify(legacyCheckpoint)),
);
assert.deepEqual(migratedLegacy.getHudProjection().aimAnglesU16, [54_321, 54_321, 54_321]);

function angleTo(from: Point, to: Point): number {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return Math.round(((angle / (Math.PI * 2) + 1) % 1) * 65_536) & 0xffff;
}

const fallbackSimulation = createBattleSimulation(createStage01Bundle(), 0xfa11bac);
const fallbackAimAngles = [4_096, 20_480, 53_248] as const;
fallbackAimAngles.forEach((angleU16, towerId) => {
  fallbackSimulation.applyCommand({
    seq: towerId + 1,
    type: 'SET_AIM',
    towerId: towerId as 0 | 1 | 2,
    angleU16,
  });
});
assert.deepEqual(fallbackSimulation.getRenderSnapshot().towerFacingsU16, fallbackAimAngles);

const targetingBundle = createStage01Bundle();
targetingBundle.tower.rangePx = 5_000;
targetingBundle.tower.projectileSpeedPxPerSecond = 60;
targetingBundle.tower.baseDamageMilli = 1;
targetingBundle.tower.basePenetration = 2;
targetingBundle.tower.critChanceBp = 10_000;
const spawnPoint = targetingBundle.route.points[0];
if (!spawnPoint) throw new Error('Stage 01 route requires a spawn point.');
const targetingSimulation = createBattleSimulation(targetingBundle, 0xa11ce);
const autoTrackingTowerId = 2 as const;
let configuredTrackingAim = 0;
targetingBundle.route.towerAnchors.forEach((anchor, index) => {
  const towardSpawn = angleTo(anchor, spawnPoint);
  const angleU16 = index === autoTrackingTowerId
    ? (towardSpawn + 5_461) & 0xffff
    : (towardSpawn + 32_768) & 0xffff;
  if (index === autoTrackingTowerId) configuredTrackingAim = angleU16;
  targetingSimulation.applyCommand({
    seq: index + 1,
    type: 'SET_AIM',
    towerId: index as 0 | 1 | 2,
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

const offerCards = [
  'CARD_BASIC_DAMAGE_P',
  'CARD_BASIC_FREQUENCY_P',
  'CARD_BASIC_ARROW_COUNT_P',
] as const;

interface VictoryRun {
  simulation: BattleSimulation;
  events: BattleEvent[];
}

interface StageCombatDistribution {
  attacksByWave: number[][];
  peakAliveByWave: number[];
}

function stageCombatDistribution(events: BattleEvent[], waveCount: number): StageCombatDistribution {
  const attacksByWave = Array.from({ length: waveCount }, () => [0, 0, 0]);
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
  let authoritySequence = 1;
  let offerOrdinal = 1;
  const simulation = createBattleSimulation(bundle, seed);
  const events: BattleEvent[] = [];

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
        if (request.type !== 'OFFER') {
          throw new Error(
            `${bundle.stage.id} breached before victory during its smoke test: ${JSON.stringify(simulation.getHudProjection())}`,
          );
        }
        const id = `${bundle.stage.id.toLowerCase()}-smoke-offer-${offerOrdinal}`;
        applyAndQueue({
          type: 'OFFER_GRANTED',
          authoritySeq: authoritySequence++,
          authorizationId: `${id}-grant`,
          offerId: id,
          cards: [...offerCards],
        }, pending);
        applyAndQueue({
          type: 'CARD_CHOICE_ACCEPTED',
          authoritySeq: authoritySequence++,
          authorizationId: `${id}-choice`,
          offerId: id,
          cardId: offerCards[(offerOrdinal - 1) % offerCards.length] ?? offerCards[0],
        }, pending);
        offerOrdinal += 1;
      }
    }
  }

  let tickBudget = 180_000;
  while (tickBudget > 0 && simulation.getHudProjection().flowState !== 'result') {
    const output = simulation.advanceTicks(Math.min(300, tickBudget));
    tickBudget -= output.ticksAdvanced;
    resolveOutput(output);
    if (output.ticksAdvanced === 0 && output.flowRequests.length === 0) break;
  }
  return { simulation, events };
}

function assertVictory(run: VictoryRun, expectedSpawnCount: number): void {
  assert.ok(run.events.some((event) => event.type === 'VICTORY'));
  assert.equal(run.events.filter((event) => event.type === 'SPAWN').length, expectedSpawnCount);
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
assertVictory(stage01Victory, 45);

const stage02Bundle = createStage02Bundle();
assert.equal(stage02Bundle.stage.id, 'STAGE_02');
assert.equal(stage02Bundle.stage.name, '东海礁港');
assert.equal(stage02Bundle.route.towerAnchors.length, 3);
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
assertVictory(stage02FirstVictory, 70);
assertVictory(stage02SecondVictory, 70);
const stage02Distribution = stageCombatDistribution(stage02FirstVictory.events, stage02Bundle.waves.length);
for (const waveIndex of [2, 3, 4]) {
  const towerAttacks = stage02Distribution.attacksByWave[waveIndex] ?? [];
  assert.ok(towerAttacks.every((count) => count >= 10));
  assert.ok(Math.max(...towerAttacks) / Math.max(1, Math.min(...towerAttacks)) <= 1.5);
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
assert.equal(stage03Bundle.route.towerAnchors.length, 3);
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
  84,
);
for (let index = 1; index < stage03Bundle.waves.length; index += 1) {
  const previous = stage03Bundle.waves[index - 1];
  const current = stage03Bundle.waves[index];
  if (!previous || !current) throw new Error('Stage 03 must contain five complete waves.');
  assert.ok(current.hpMultiplierBp > previous.hpMultiplierBp);
  assert.ok((current.speedMultiplierBp ?? 10_000) > (previous.speedMultiplierBp ?? 10_000));
}
assert.equal(stage03Bundle.waves[4]?.groups[0]?.enemyId, 'MON_DRAGON_TORTOISE');

const stage04Bundle = createStage04Bundle();
assert.equal(stage04Bundle.stage.id, 'STAGE_04');
assert.equal(stage04Bundle.stage.name, '归墟潮眼');
assert.equal(stage04Bundle.route.towerAnchors.length, 3);
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
  93,
);
assert.equal(stage04Bundle.waves[4]?.groups[1]?.enemyId, 'MON_ABYSS_WYRM');
assert.equal(stage04Bundle.enemies.MON_ABYSS_WYRM?.maxHpMilli, 1_100_000);
assert.equal(stage04Bundle.enemies.MON_ABYSS_WYRM?.enrageBelowHpBp, 5_000);
assert.equal(stage04Bundle.enemies.MON_ABYSS_WYRM?.enrageSpeedMultiplierBp, 16_000);

const stage05Bundle = createStage05Bundle();
assert.equal(stage05Bundle.stage.id, 'STAGE_05');
assert.equal(stage05Bundle.stage.name, '扶桑天阙');
assert.equal(stage05Bundle.route.towerAnchors.length, 3);
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
  94,
);
assert.equal(stage05Bundle.waves[4]?.groups[1]?.enemyId, 'MON_ECLIPSE_KUN_EMPEROR');
assert.equal(stage05Bundle.enemies.MON_SOLAR_FORMATION_PRIEST?.guardAuraArmorBp, 5_000);
assert.equal(stage05Bundle.enemies.MON_SOLAR_FORMATION_PRIEST?.guardAuraRadiusPx, 300);
assert.equal(stage05Bundle.enemies.MON_ECLIPSE_KUN_EMPEROR?.maxHpMilli, 1_250_000);
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
]);
assert.deepEqual(Object.keys(STAGE_BUNDLES), BATTLE_STAGE_ORDER);
assert.equal(stage06Bundle.stage.id, 'STAGE_06');
assert.equal(stage06Bundle.stage.name, '太初蜃庭');
assert.equal(stage06Bundle.route.towerAnchors.length, 3);
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
  103,
);
assert.equal(stage06Bundle.waves[4]?.groups[1]?.enemyId, 'MON_MIRAGE_MOTHER');
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

const breachSealPlacements = [
  stage01Bundle,
  stage02Bundle,
  stage03Bundle,
  stage04Bundle,
  stage05Bundle,
  stage06Bundle,
]
  .map((bundle) => resolveBreachSealPlacement(bundle.route));
for (const placement of breachSealPlacements) {
  assert.ok(Number.isFinite(placement.x));
  assert.ok(Number.isFinite(placement.y));
  assert.ok(Number.isFinite(placement.tangentRadians));
  assert.ok(placement.x >= 180 && placement.x <= 1_740);
  assert.equal(placement.y, BREACH_SEAL_MAX_Y);
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

const stage03FirstVictory = runStageToVictory(createStage03Bundle(), 0x5a6e0303);
const stage03SecondVictory = runStageToVictory(createStage03Bundle(), 0x5a6e0303);
assertVictory(stage03FirstVictory, 84);
assertVictory(stage03SecondVictory, 84);
const stage03Distribution = stageCombatDistribution(stage03FirstVictory.events, stage03Bundle.waves.length);
assert.equal(
  stage03FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_DRAGON_TORTOISE',
  ).length,
  1,
);
for (const waveIndex of [2, 3, 4]) {
  const towerAttacks = stage03Distribution.attacksByWave[waveIndex] ?? [];
  const minimumAttacks = waveIndex === 2 ? 10 : 12;
  assert.ok(towerAttacks.every((count) => count >= minimumAttacks));
  assert.ok(Math.max(...towerAttacks) / Math.max(1, Math.min(...towerAttacks)) <= 1.6);
}
assert.ok((stage03Distribution.peakAliveByWave[4] ?? 0) >= 7);
assert.ok((stage03Distribution.peakAliveByWave[4] ?? 0) <= 14);
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
assertVictory(stage04FirstVictory, 93);
assertVictory(stage04SecondVictory, 93);
const stage04Distribution = stageCombatDistribution(stage04FirstVictory.events, stage04Bundle.waves.length);
assert.equal(
  stage04FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_ABYSS_WYRM',
  ).length,
  1,
);
for (const waveIndex of [2, 3, 4]) {
  const towerAttacks = stage04Distribution.attacksByWave[waveIndex] ?? [];
  const minimumAttacks = waveIndex === 2 ? 12 : waveIndex === 3 ? 16 : 20;
  assert.ok(towerAttacks.every((count) => count >= minimumAttacks));
  assert.ok(Math.max(...towerAttacks) / Math.max(1, Math.min(...towerAttacks)) <= 1.5);
  assert.ok((stage04Distribution.peakAliveByWave[waveIndex] ?? 0) >= 8);
  assert.ok((stage04Distribution.peakAliveByWave[waveIndex] ?? 0) <= 16);
}
assert.equal(stage04FirstVictory.simulation.getChecksum(), stage04SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage04FirstVictory.events.map((event) => [event.tick, event.type]),
  stage04SecondVictory.events.map((event) => [event.tick, event.type]),
);

function auraProbeBundle(enabled: boolean): BattleBundleV1 {
  const bundle = createStage05Bundle();
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
assertVictory(stage05FirstVictory, 94);
assertVictory(stage05SecondVictory, 94);
const stage05Distribution = stageCombatDistribution(stage05FirstVictory.events, stage05Bundle.waves.length);
assert.equal(
  stage05FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_ECLIPSE_KUN_EMPEROR',
  ).length,
  1,
);
for (const waveIndex of [0, 1, 2, 3, 4]) {
  const towerAttacks = stage05Distribution.attacksByWave[waveIndex] ?? [];
  assert.ok(towerAttacks.every((count) => count >= 12));
  assert.ok(Math.max(...towerAttacks) / Math.max(1, Math.min(...towerAttacks)) <= 1.25);
  assert.ok((stage05Distribution.peakAliveByWave[waveIndex] ?? 0) >= 5);
  assert.ok((stage05Distribution.peakAliveByWave[waveIndex] ?? 0) <= 18);
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
  boss.maxHpMilli = 100_000;
  boss.armorBp = 0;
  boss.phaseShellAboveHpBp = 7_000;
  boss.phaseShellMaxHitDamageBp = 1_000;
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
  const simulation = createBattleSimulation(bundle, 0x506e11);
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
assertVictory(stage06FirstVictory, 103);
assertVictory(stage06SecondVictory, 103);
const stage06Distribution = stageCombatDistribution(stage06FirstVictory.events, stage06Bundle.waves.length);
assert.equal(
  stage06FirstVictory.events.filter(
    (event) => event.type === 'SPAWN' && event.enemyId === 'MON_MIRAGE_MOTHER',
  ).length,
  1,
);
for (const waveIndex of [0, 1, 2, 3, 4]) {
  const towerAttacks = stage06Distribution.attacksByWave[waveIndex] ?? [];
  assert.ok(towerAttacks.every((count) => count >= 10));
  assert.ok(Math.max(...towerAttacks) / Math.max(1, Math.min(...towerAttacks)) <= 1.35);
  assert.ok((stage06Distribution.peakAliveByWave[waveIndex] ?? 0) >= 5);
  assert.ok((stage06Distribution.peakAliveByWave[waveIndex] ?? 0) <= 18);
}
assert.equal(stage06FirstVictory.simulation.getChecksum(), stage06SecondVictory.simulation.getChecksum());
assert.deepEqual(
  stage06FirstVictory.events.map((event) => [event.tick, event.type]),
  stage06SecondVictory.events.map((event) => [event.tick, event.type]),
);

let rejectedCrossStageCheckpoint = false;
try {
  createBattleSimulation(createStage01Bundle(), 0x5a6e0202, stage02FirstVictory.simulation.createCheckpoint());
} catch (error) {
  rejectedCrossStageCheckpoint = error instanceof Error && error.message.includes('release does not match');
}
assert.ok(rejectedCrossStageCheckpoint);

console.log('✓ 30 Hz 与 1/2 倍速逻辑通过');
console.log('✓ 三座箭塔独立优先方向、自动索敌回退、自动转向、弹体旗标与旧存档迁移通过');
console.log('✓ checkpoint 编解码、校验和确定性恢复通过');
console.log('✓ 本地发牌 Authority 快照恢复通过');
console.log('✓ Stage 01 五波、45 名敌人与胜利结算通过');
console.log('✓ Stage 02 独立配置、五波 70 名敌人、确定性与完整通关通过');
console.log(`✓ Stage 02 三塔逐波出手 ${JSON.stringify(stage02Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage02Distribution.peakAliveByWave)}`);
console.log('✓ Stage 03 五波 84 名敌人、疾潮递增、重甲与首领出场顺序通过');
console.log(`✓ Stage 03 三塔逐波出手 ${JSON.stringify(stage03Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage03Distribution.peakAliveByWave)}`);
console.log('✓ Stage 04 五波 93 名敌人、残血狂潮与噬潮魔蛟首领阶段通过');
console.log(`✓ Stage 04 三塔逐波出手 ${JSON.stringify(stage04Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage04Distribution.peakAliveByWave)}`);
console.log('✓ Stage 05 五波 94 名敌人、护阵光环与蚀日鲲皇首领阶段通过');
console.log(`✓ Stage 05 三塔逐波出手 ${JSON.stringify(stage05Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage05Distribution.peakAliveByWave)}`);
console.log('✓ Stage 06 五波 103 名敌人、相壳阈值/限伤/恢复与万相蜃母首领阶段通过');
console.log(`✓ Stage 06 三塔逐波出手 ${JSON.stringify(stage06Distribution.attacksByWave)}，峰值同屏 ${JSON.stringify(stage06Distribution.peakAliveByWave)}`);
console.log(`✓ 六关终点关印锚点统一位于 HUD 上方 ${JSON.stringify(breachSealPlacements.map((point) => [Math.round(point.x), point.y]))}`);
