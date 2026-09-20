import { createHash } from 'node:crypto';
import {
  createBattleSimulation,
  type BattleSimulation,
  type SimulationOutput,
} from '../src/core/battle-sim';
import {
  createStage01Bundle,
  createStage08Bundle,
  resolveStageBundleForSeed,
} from '../src/core/content';
import type { BattleEvent, BattleBundleV1 } from '../src/core/contracts';
import { LocalPracticeAuthority } from '../src/core/local-authority';

interface SmokeAssert {
  equal(actual: unknown, expected: unknown, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): asserts value;
}

const assert: SmokeAssert = {
  equal(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, message?: string): void {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new Error(message ?? `Expected ${expectedJson}, received ${actualJson}`);
    }
  },
  ok(value: unknown, message?: string): asserts value {
    if (!value) throw new Error(message ?? `Expected a truthy value, received ${String(value)}`);
  },
};

interface Harness {
  simulation: BattleSimulation;
  authority: LocalPracticeAuthority;
  events: BattleEvent[];
}

function createHarness(bundle: BattleBundleV1, seed: number): Harness {
  return {
    simulation: createBattleSimulation(bundle, seed),
    authority: new LocalPracticeAuthority(bundle, seed),
    events: [],
  };
}

function consumeOutput(harness: Harness, initial: SimulationOutput): void {
  const pending = [initial];
  while (pending.length > 0) {
    const output = pending.shift();
    if (!output) continue;
    harness.events.push(...output.events);
    for (const request of output.flowRequests) {
      if (request.type === 'OFFER') {
        const offer = harness.authority.requestOffer(
          request.ordinal,
          undefined,
          request.eligibleEffectIds,
        );
        pending.push(harness.simulation.applyAuthorityEvent(offer));
        const selectedCard = offer.cards[0];
        pending.push(
          harness.simulation.applyAuthorityEvent(
            harness.authority.acceptChoice(offer.offerId, selectedCard),
          ),
        );
      } else {
        pending.push(
          harness.simulation.applyAuthorityEvent(
            harness.authority.grantRevive(request.ordinal),
          ),
        );
      }
    }
  }
}

function runToTick(harness: Harness, targetTick: number): void {
  while (
    harness.simulation.getHudProjection().tick < targetTick &&
    harness.simulation.getHudProjection().flowState !== 'result'
  ) {
    const before = harness.simulation.getHudProjection().tick;
    consumeOutput(harness, harness.simulation.advanceTicks(targetTick - before));
    const after = harness.simulation.getHudProjection().tick;
    if (after === before && harness.simulation.getHudProjection().flowState !== 'running') {
      throw new Error(`Harness stalled at tick ${after}.`);
    }
  }
}

function eventSignature(event: BattleEvent): unknown {
  return JSON.parse(JSON.stringify(event)) as unknown;
}

function expectThrow(run: () => void, messagePart: string): void {
  let matched = false;
  try {
    run();
  } catch (error) {
    matched = error instanceof Error && error.message.includes(messagePart);
  }
  assert.ok(matched, `Expected an error containing "${messagePart}".`);
}

const routeIds = new Set<string>();
for (let seed = 1; seed <= 128; seed += 1) {
  const first = resolveStageBundleForSeed('STAGE_08', seed);
  const second = resolveStageBundleForSeed('STAGE_08', seed);
  assert.equal(first.route.id, second.route.id);
  assert.ok(/_([ABC])$/.test(first.route.id));
  routeIds.add(first.route.id);
}
assert.equal(routeIds.size, 3, 'Seed routing must reach all three Stage 08 routes.');

const seed = 0x8e_2026;
const baseBundle = resolveStageBundleForSeed('STAGE_08', seed);
const stage08HashInput = createStage08Bundle();
const stage08ConfigHash = stage08HashInput.configHash;
stage08HashInput.configHash = '';
assert.equal(
  stage08ConfigHash,
  `sha256:${createHash('sha256').update(JSON.stringify(stage08HashInput)).digest('hex')}`,
);
assert.equal(baseBundle.releaseId, 'GG_S08_ENDLESS_V3');
assert.equal(baseBundle.stage.name, '无尽潮渊');
assert.equal(baseBundle.stage.backgroundAssetId, 'STAGE_08_BACKGROUND');
assert.equal(baseBundle.mode, 'endless');
assert.equal(baseBundle.rules.maxRevives, 1);
assert.equal(baseBundle.rules.reviveGroundRollbackBp, 2_500);
assert.equal(baseBundle.waves.length, 0);
assert.equal(baseBundle.endless?.routes.length, 3);
assert.equal(baseBundle.endless?.threatLutBp.length, 1_201);
assert.deepEqual(
  baseBundle.endless?.threatEntries.map((entry) => entry.threatCost),
  [3, 3, 6, 9, 9, 9, 12, 12],
);
assert.deepEqual(
  baseBundle.endless?.threatEntries.map(
    (entry) => baseBundle.enemies[entry.enemyId]?.exp,
  ),
  [20, 20, 33, 50, 45, 50, 55, 58],
);
assert.equal(baseBundle.enemies.BOSS_ABYSS_DRAGON?.maxHpMilli, 96_000_000);
assert.deepEqual(
  [0, 240, 480, 720, 960, 1_200].map(
    (index) => baseBundle.endless?.threatLutBp[index],
  ),
  [10_000, 15_570, 21_782, 28_354, 246_400, 1_310_432],
);
assert.equal(
  createHash('sha256')
    .update(JSON.stringify(baseBundle.endless?.threatLutBp))
    .digest('hex'),
  '12719fe234302d958d12d83a0f49728ed2466369103ea572b9069f8cef726e50',
  'Threat LUT must remain byte-for-byte stable across builds.',
);

const eligibilityAuthority = new LocalPracticeAuthority(baseBundle, seed);
const singleEffectOffer = eligibilityAuthority.requestOffer(
  1,
  undefined,
  ['crit-rate'],
);
assert.equal(new Set(singleEffectOffer.cards).size, 3);
assert.ok(
  singleEffectOffer.cards.every(
    (cardId) => baseBundle.cards.find((card) => card.id === cardId)?.effectId === 'crit-rate',
  ),
);
const rememberedReroll = eligibilityAuthority.requestOffer(1, singleEffectOffer.offerId);
assert.ok(
  rememberedReroll.cards.every(
    (cardId) => baseBundle.cards.find((card) => card.id === cardId)?.effectId === 'crit-rate',
  ),
);
const snapshotAuthority = new LocalPracticeAuthority(baseBundle, seed + 1);
const snapshotRootOffer = snapshotAuthority.requestOffer(1, undefined, ['crit-rate']);
const restoredAuthority = new LocalPracticeAuthority(
  baseBundle,
  seed + 1,
  snapshotAuthority.snapshot(),
);
const restoredReroll = restoredAuthority.requestOffer(1, snapshotRootOffer.offerId);
assert.ok(
  restoredReroll.cards.every(
    (cardId) => baseBundle.cards.find((card) => card.id === cardId)?.effectId === 'crit-rate',
  ),
);
const changedPoolAuthority = new LocalPracticeAuthority(baseBundle, seed + 2);
const changedPoolRoot = changedPoolAuthority.requestOffer(1, undefined, ['crit-rate']);
expectThrow(
  () => changedPoolAuthority.requestOffer(
    1,
    changedPoolRoot.offerId,
    ['tower-damage'],
  ),
  'eligibility changed',
);

const cadenceBundle = resolveStageBundleForSeed('STAGE_08', seed);
cadenceBundle.tower.rangePx = 1;
for (const enemy of Object.values(cadenceBundle.enemies)) enemy.speedPxPerSecond = 1;
const cadenceSimulation = createBattleSimulation(cadenceBundle, seed);
const firstPackEvents = cadenceSimulation.advanceTicks(450).events.filter(
  (event): event is Extract<BattleEvent, { type: 'SPAWN' }> => event.type === 'SPAWN',
);
assert.ok(firstPackEvents.length > 0 && firstPackEvents.length <= 32);
assert.equal(firstPackEvents[0]?.tick, 0);
for (let index = 1; index < firstPackEvents.length; index += 1) {
  assert.equal(
    (firstPackEvents[index]?.tick ?? 0) - (firstPackEvents[index - 1]?.tick ?? 0),
    24,
    'Units in one threat pack must be spaced by exactly 24 ticks.',
  );
}

const capBundle = resolveStageBundleForSeed('STAGE_08', seed);
capBundle.tower.rangePx = 1;
for (const enemy of Object.values(capBundle.enemies)) enemy.speedPxPerSecond = 1;
const capSimulation = createBattleSimulation(capBundle, seed);
let observedQueuedOverflow = false;
let capSpawnCount = 0;
while (capSimulation.getHudProjection().tick < 20_000) {
  const output = capSimulation.advanceTicks(100);
  capSpawnCount += output.events.filter((event) => event.type === 'SPAWN').length;
  const endless = capSimulation.getHudProjection().endless;
  assert.ok(endless);
  assert.ok(endless.activeEnemyCount <= 120);
  if (endless.activeEnemyCount === 120 && endless.queuedEnemyCount > 0) {
    observedQueuedOverflow = true;
  }
}
assert.ok(observedQueuedOverflow, 'Slow enemies must exercise the 120-active overflow queue.');
const fastQueueBundle = resolveStageBundleForSeed('STAGE_08', seed);
fastQueueBundle.tower.baseDamageMilli = 3_000_000_000;
fastQueueBundle.tower.attackIntervalTicks = 6;
fastQueueBundle.tower.rangePx = 5_000;
fastQueueBundle.tower.projectileSpeedPxPerSecond = 100_000;
fastQueueBundle.tower.critChanceBp = 0;
const fastQueueHarness = createHarness(fastQueueBundle, seed);
runToTick(fastQueueHarness, 20_000);
const slowQueuedAt20m = capSimulation.getHudProjection().endless?.queuedEnemyCount ?? 0;
const fastQueuedAt20m = fastQueueHarness.simulation.getHudProjection().endless?.queuedEnemyCount ?? 0;
const fastSpawnCount = fastQueueHarness.events.filter((event) => event.type === 'SPAWN').length;
assert.equal(
  capSpawnCount + slowQueuedAt20m,
  fastSpawnCount + fastQueuedAt20m,
  'Spawned plus queued units must be conserved regardless of combat throughput.',
);
const capRenderIds = capSimulation.getRenderSnapshot().entities.map((entity) => entity.entityId);
assert.equal(new Set(capRenderIds).size, capRenderIds.length, 'Render entity ids must be unique.');
const capCheckpoint = JSON.parse(new TextDecoder().decode(capSimulation.createCheckpoint())) as {
  schemaVersion: number;
  state: {
    towerCooldowns: number[];
    reviveGuardRemainingTicks: number;
    endless: {
      pendingPacks: Array<{
        units: Array<{
          enemyId: string;
          hpMultiplierBp: number;
          speedMultiplierBp: number;
          expMultiplierBp: number;
        }>;
      }>;
    };
  };
};
assert.equal(capCheckpoint.schemaVersion, 7);
assert.ok(capCheckpoint.state.endless.pendingPacks.every((pack) => pack.units.length <= 32));
assert.equal(
  createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(capCheckpoint)),
  ).getHudProjection().flowState,
  'running',
  'A valid running checkpoint must remain restorable.',
);
const exhaustedCooldownCheckpoint = JSON.parse(
  JSON.stringify(capCheckpoint),
) as typeof capCheckpoint;
exhaustedCooldownCheckpoint.state.towerCooldowns = [
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER,
];
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(exhaustedCooldownCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const exhaustedReviveGuardCheckpoint = JSON.parse(
  JSON.stringify(capCheckpoint),
) as typeof capCheckpoint;
exhaustedReviveGuardCheckpoint.state.reviveGuardRemainingTicks = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(exhaustedReviveGuardCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);

const pausedBundle = resolveStageBundleForSeed('STAGE_08', seed + 30);
const pausedSimulation = createBattleSimulation(pausedBundle, seed + 30);
pausedSimulation.applyCommand({ seq: 1, type: 'PAUSE' });
const restoredPaused = createBattleSimulation(
  pausedBundle,
  seed + 30,
  pausedSimulation.createCheckpoint(),
);
assert.equal(restoredPaused.getHudProjection().flowState, 'paused');
restoredPaused.applyCommand({ seq: 2, type: 'RESUME' });
assert.equal(restoredPaused.getHudProjection().flowState, 'running');

const oneXBundle = resolveStageBundleForSeed('STAGE_08', seed + 3);
const twoXBundle = resolveStageBundleForSeed('STAGE_08', seed + 3);
for (const bundle of [oneXBundle, twoXBundle]) {
  bundle.tower.rangePx = 1;
  for (const enemy of Object.values(bundle.enemies)) enemy.speedPxPerSecond = 1;
}
const oneXSimulation = createBattleSimulation(oneXBundle, seed + 3);
const twoXSimulation = createBattleSimulation(twoXBundle, seed + 3);
oneXSimulation.applyCommand({ seq: 1, type: 'SET_SPEED', value: 1 });
twoXSimulation.applyCommand({ seq: 1, type: 'SET_SPEED', value: 2 });
const oneXOutput = oneXSimulation.advanceWallTime(600_000);
const twoXOutput = twoXSimulation.advanceWallTime(300_000);
oneXSimulation.applyCommand({ seq: 2, type: 'SET_SPEED', value: 1 });
twoXSimulation.applyCommand({ seq: 2, type: 'SET_SPEED', value: 1 });
assert.equal(oneXOutput.ticksAdvanced, 18_000);
assert.equal(twoXOutput.ticksAdvanced, 18_000);
assert.deepEqual(oneXOutput.events.map(eventSignature), twoXOutput.events.map(eventSignature));
assert.deepEqual(oneXSimulation.getHudProjection(), twoXSimulation.getHudProjection());
assert.equal(oneXSimulation.getChecksum(), twoXSimulation.getChecksum());
assert.equal(
  new TextDecoder().decode(oneXSimulation.createCheckpoint()),
  new TextDecoder().decode(twoXSimulation.createCheckpoint()),
);

const wallTimeBoundaryBundle = resolveStageBundleForSeed('STAGE_08', seed + 31);
const wallTimeBoundarySimulation = createBattleSimulation(wallTimeBoundaryBundle, seed + 31);
const wallTimeBoundaryCheckpoint = new TextDecoder().decode(
  wallTimeBoundarySimulation.createCheckpoint(),
);
expectThrow(
  () => wallTimeBoundarySimulation.advanceWallTime(Number.MAX_VALUE),
  'safe fixed-point input range',
);
assert.equal(
  new TextDecoder().decode(wallTimeBoundarySimulation.createCheckpoint()),
  wallTimeBoundaryCheckpoint,
  'Rejected wall time must not mutate the simulation.',
);
const invalidSpeedOutput = wallTimeBoundarySimulation.applyCommand({
  seq: 1,
  type: 'SET_SPEED',
  value: 3,
} as never);
assert.equal(invalidSpeedOutput.commandAcks[0]?.status, 'rejected');
assert.equal(
  new TextDecoder().decode(wallTimeBoundarySimulation.createCheckpoint()),
  wallTimeBoundaryCheckpoint,
  'Rejected speed input must not mutate the simulation.',
);

const projectileProbeBundle = resolveStageBundleForSeed('STAGE_08', seed + 4);
projectileProbeBundle.tower.rangePx = 5_000;
projectileProbeBundle.tower.projectileSpeedPxPerSecond = 60;
projectileProbeBundle.tower.baseDamageMilli = 1;
projectileProbeBundle.tower.critChanceBp = 0;
for (const enemy of Object.values(projectileProbeBundle.enemies)) enemy.speedPxPerSecond = 100;
const projectileProbeSimulation = createBattleSimulation(projectileProbeBundle, seed + 4);
for (let tick = 0; tick < 120; tick += 1) {
  projectileProbeSimulation.advanceTicks(1);
  if (projectileProbeSimulation.getRenderSnapshot().entities.some(
    (entity) => entity.renderKind === 'projectile',
  )) break;
}
const projectileCheckpoint = JSON.parse(
  new TextDecoder().decode(projectileProbeSimulation.createCheckpoint()),
) as {
  state: {
    enemies: Array<{
      entityId: number;
      hpMilli: number;
      distanceMilli: number;
      ageTicks: number;
      expAward: number;
      speedMultiplierBp: number;
      invulnerableUntilTick?: number;
    }>;
    projectiles: Array<{
      entityId: number;
      targetEntityId: number;
      xMilli: number;
      yMilli: number;
      damageMilli: number;
    }>;
    towerCooldowns: number[];
    exp: number;
    damageDealtMilli: number;
    nextEnemyId: number;
    nextProjectileId: number;
  };
};
assert.ok(projectileCheckpoint.state.projectiles.length > 0);
const projectileFixture = projectileCheckpoint.state.projectiles[0];
const projectileTargetFixture = projectileCheckpoint.state.enemies.find(
  (enemy) => enemy.entityId === projectileFixture?.targetEntityId,
);
const projectileTargetRender = projectileProbeSimulation.getRenderSnapshot().entities.find(
  (entity) => entity.renderKind === 'enemy' && entity.entityId === projectileFixture?.targetEntityId,
);
assert.ok(projectileFixture && projectileTargetFixture && projectileTargetRender);
// Keep the serialized boundary fixture independent from the authored tower pads.
// The real shot is still used, but it starts at the target so the following
// overflow and experience probes exercise their intended hit on the next tick.
projectileFixture.xMilli = Math.round(projectileTargetRender.x * 1_000);
projectileFixture.yMilli = Math.round(projectileTargetRender.y * 1_000);
projectileCheckpoint.state.projectiles = [projectileFixture];
projectileCheckpoint.state.enemies = [projectileTargetFixture];
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(projectileCheckpoint)),
);
const fractionalProjectileCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const fractionalProjectile = fractionalProjectileCheckpoint.state.projectiles[0];
assert.ok(fractionalProjectile);
fractionalProjectile.damageMilli = 0.5;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(fractionalProjectileCheckpoint)),
  ),
  'malformed render entities',
);
const fractionalEnemyCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const fractionalEnemy = fractionalEnemyCheckpoint.state.enemies[0];
assert.ok(fractionalEnemy);
fractionalEnemy.distanceMilli = 0.5;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(fractionalEnemyCheckpoint)),
  ),
  'malformed render entities',
);
const exhaustedEnemyAgeCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const exhaustedAgeEnemy = exhaustedEnemyAgeCheckpoint.state.enemies[0];
assert.ok(exhaustedAgeEnemy);
exhaustedAgeEnemy.ageTicks = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedEnemyAgeCheckpoint)),
  ),
  'malformed render entities',
);
const unreachableInvulnerabilityCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const unreachableInvulnerabilityEnemy = unreachableInvulnerabilityCheckpoint.state.enemies[0];
assert.ok(unreachableInvulnerabilityEnemy);
unreachableInvulnerabilityEnemy.invulnerableUntilTick = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(unreachableInvulnerabilityCheckpoint)),
  ),
  'enemy invulnerability is inconsistent',
);
const unsafeEnemyExpCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const unsafeExpEnemy = unsafeEnemyExpCheckpoint.state.enemies[0];
assert.ok(unsafeExpEnemy);
unsafeExpEnemy.expAward = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(unsafeEnemyExpCheckpoint)),
  ),
  'unsafe derived values',
);
const unsafeExperienceCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
unsafeExperienceCheckpoint.state.exp = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(unsafeExperienceCheckpoint)),
  ),
  'level and experience are inconsistent',
);
const unsafeActiveEnemySpeedCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const unsafeActiveEnemy = unsafeActiveEnemySpeedCheckpoint.state.enemies[0];
assert.ok(unsafeActiveEnemy);
unsafeActiveEnemy.speedMultiplierBp = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(unsafeActiveEnemySpeedCheckpoint)),
  ),
  'unsafe derived values',
);
const exhaustedDamageCounterCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
exhaustedDamageCounterCheckpoint.state.damageDealtMilli = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedDamageCounterCheckpoint)),
  ),
  'insufficient overflow reserve',
);
const maximumEnemyHpMilli = Math.floor(Number.MAX_SAFE_INTEGER / 10_000);
const maximumDamageCounterMilli = Number.MAX_SAFE_INTEGER - maximumEnemyHpMilli;
const damageCounterBoundaryCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const boundaryEnemy = damageCounterBoundaryCheckpoint.state.enemies[0];
const boundaryProjectile = damageCounterBoundaryCheckpoint.state.projectiles[0];
assert.ok(boundaryEnemy && boundaryProjectile);
boundaryEnemy.hpMilli = 1;
boundaryProjectile.damageMilli = 1;
damageCounterBoundaryCheckpoint.state.projectiles = [boundaryProjectile];
damageCounterBoundaryCheckpoint.state.towerCooldowns = [
  projectileProbeBundle.tower.attackIntervalTicks,
  projectileProbeBundle.tower.attackIntervalTicks,
  projectileProbeBundle.tower.attackIntervalTicks,
];
damageCounterBoundaryCheckpoint.state.damageDealtMilli = maximumDamageCounterMilli;
const damageCounterBoundarySimulation = createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(damageCounterBoundaryCheckpoint)),
);
let boundaryHitObserved = false;
for (let tick = 0; tick < 2_000 && !boundaryHitObserved; tick += 1) {
  boundaryHitObserved = damageCounterBoundarySimulation
    .advanceTicks(1)
    .events.some((event) => event.type === 'HIT');
}
assert.ok(boundaryHitObserved, 'The damage-counter boundary probe must land its pending hit.');
assert.equal(
  damageCounterBoundarySimulation.getHudProjection().damageDealtMilli,
  maximumDamageCounterMilli,
  'An exhausted-but-valid damage counter must saturate deterministically.',
);
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  damageCounterBoundarySimulation.createCheckpoint(),
);
const experienceBoundaryCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const experienceBoundaryEnemy = experienceBoundaryCheckpoint.state.enemies[0];
const experienceBoundaryProjectile = experienceBoundaryCheckpoint.state.projectiles[0];
assert.ok(experienceBoundaryEnemy && experienceBoundaryProjectile);
experienceBoundaryEnemy.hpMilli = 1;
experienceBoundaryProjectile.damageMilli = 1;
experienceBoundaryCheckpoint.state.projectiles = [experienceBoundaryProjectile];
experienceBoundaryCheckpoint.state.towerCooldowns = [
  projectileProbeBundle.tower.attackIntervalTicks,
  projectileProbeBundle.tower.attackIntervalTicks,
  projectileProbeBundle.tower.attackIntervalTicks,
];
experienceBoundaryCheckpoint.state.exp = 39;
const experienceBoundarySimulation = createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(experienceBoundaryCheckpoint)),
);
let experienceLevelOutput: SimulationOutput | undefined;
for (let tick = 0; tick < 2_000 && experienceLevelOutput === undefined; tick += 1) {
  const output = experienceBoundarySimulation.advanceTicks(1);
  if (output.events.some((event) => event.type === 'HIT')) experienceLevelOutput = output;
}
assert.ok(experienceLevelOutput, 'The experience boundary probe must land its pending hit.');
const experienceOfferRequest = experienceLevelOutput.flowRequests.find(
  (request): request is Extract<SimulationOutput['flowRequests'][number], { type: 'OFFER' }> =>
    request.type === 'OFFER',
);
assert.ok(experienceOfferRequest, 'The experience boundary kill must request its level offer.');
const experienceAuthority = new LocalPracticeAuthority(projectileProbeBundle, seed + 4);
const experienceOffer = experienceAuthority.requestOffer(
  experienceOfferRequest.ordinal,
  undefined,
  experienceOfferRequest.eligibleEffectIds,
);
experienceBoundarySimulation.applyAuthorityEvent(experienceOffer);
experienceBoundarySimulation.applyAuthorityEvent(
  experienceAuthority.acceptChoice(experienceOffer.offerId, experienceOffer.cards[0]),
);
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  experienceBoundarySimulation.createCheckpoint(),
);
const multiKillExperienceCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
const multiKillBaseEnemy = multiKillExperienceCheckpoint.state.enemies[0];
const multiKillBaseProjectile = multiKillExperienceCheckpoint.state.projectiles[0];
assert.ok(multiKillBaseEnemy && multiKillBaseProjectile);
const multiKillProjectileIdStart = multiKillExperienceCheckpoint.state.nextProjectileId;
multiKillExperienceCheckpoint.state.enemies = Array.from({ length: 4 }, (_, index) => ({
  ...multiKillBaseEnemy,
  entityId: multiKillBaseEnemy.entityId + index,
  hpMilli: 1,
  expAward: 14,
}));
multiKillExperienceCheckpoint.state.projectiles = Array.from({ length: 4 }, (_, index) => ({
  ...multiKillBaseProjectile,
  entityId: multiKillProjectileIdStart + index,
  targetEntityId: multiKillBaseEnemy.entityId + index,
  damageMilli: 1,
}));
multiKillExperienceCheckpoint.state.nextEnemyId = multiKillBaseEnemy.entityId + 4;
multiKillExperienceCheckpoint.state.nextProjectileId = multiKillProjectileIdStart + 4;
multiKillExperienceCheckpoint.state.exp = 39;
multiKillExperienceCheckpoint.state.towerCooldowns = [
  projectileProbeBundle.tower.attackIntervalTicks,
  projectileProbeBundle.tower.attackIntervalTicks,
  projectileProbeBundle.tower.attackIntervalTicks,
];
const multiKillBundle = resolveStageBundleForSeed('STAGE_08', seed + 4);
multiKillBundle.tower.projectileSpeedPxPerSecond = 100_000;
const multiKillSimulation = createBattleSimulation(
  multiKillBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(multiKillExperienceCheckpoint)),
);
const multiKillOutput = multiKillSimulation.advanceTicks(1);
assert.equal(
  multiKillOutput.events.filter((event) => event.type === 'HIT').length,
  4,
  'The same-tick experience probe must resolve all four kills.',
);
assert.equal(multiKillSimulation.getHudProjection().level, 1);
assert.equal(multiKillSimulation.getHudProjection().exp, 55);
const multiKillOfferRequest = multiKillOutput.flowRequests.find(
  (request): request is Extract<SimulationOutput['flowRequests'][number], { type: 'OFFER' }> =>
    request.type === 'OFFER',
);
assert.ok(multiKillOfferRequest);
const multiKillAuthority = new LocalPracticeAuthority(multiKillBundle, seed + 4);
const multiKillOffer = multiKillAuthority.requestOffer(
  multiKillOfferRequest.ordinal,
  undefined,
  multiKillOfferRequest.eligibleEffectIds,
);
multiKillSimulation.applyAuthorityEvent(multiKillOffer);
createBattleSimulation(multiKillBundle, seed + 4, multiKillSimulation.createCheckpoint());
const chainedLevelOutput = multiKillSimulation.applyAuthorityEvent(
  multiKillAuthority.acceptChoice(multiKillOffer.offerId, multiKillOffer.cards[0]),
);
const chainedOfferRequest = chainedLevelOutput.flowRequests.find(
  (request): request is Extract<SimulationOutput['flowRequests'][number], { type: 'OFFER' }> =>
    request.type === 'OFFER',
);
assert.ok(chainedOfferRequest, 'Stored same-tick EXP must trigger the next level after the choice.');
const chainedOffer = multiKillAuthority.requestOffer(
  chainedOfferRequest.ordinal,
  undefined,
  chainedOfferRequest.eligibleEffectIds,
);
multiKillSimulation.applyAuthorityEvent(chainedOffer);
createBattleSimulation(multiKillBundle, seed + 4, multiKillSimulation.createCheckpoint());
const staleProjectileSequenceCheckpoint = JSON.parse(
  JSON.stringify(projectileCheckpoint),
) as typeof projectileCheckpoint;
staleProjectileSequenceCheckpoint.state.nextProjectileId =
  staleProjectileSequenceCheckpoint.state.projectiles[0]?.entityId ?? 0;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(staleProjectileSequenceCheckpoint)),
  ),
  'projectile sequence is not monotonic',
);

const sequenceBoundaryEntry = projectileProbeBundle.route.points[0];
const sequenceBoundarySecondPoint = projectileProbeBundle.route.points[1];
assert.ok(sequenceBoundaryEntry && sequenceBoundarySecondPoint);
sequenceBoundaryEntry.y = 64;
sequenceBoundarySecondPoint.y = 64;
const sequenceBoundarySimulation = createBattleSimulation(projectileProbeBundle, seed + 4);
const sequenceBoundaryCheckpoint = JSON.parse(
  new TextDecoder().decode(sequenceBoundarySimulation.createCheckpoint()),
) as {
  state: {
    tick: number;
    nextEnemyId: number;
    nextProjectileId: number;
    eventSeq: number;
    lastAuthoritySeq: number;
    lastCommandSeq: number;
  };
};
const projectileBoundaryCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
const sequenceRemainingTicks = projectileProbeBundle.endless!.settlementTick -
  projectileBoundaryCheckpoint.state.tick;
projectileBoundaryCheckpoint.state.nextProjectileId =
  0x7fff_ffff - sequenceRemainingTicks * 36;
const projectileBoundarySimulation = createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(projectileBoundaryCheckpoint)),
);
assert.ok(
  projectileBoundarySimulation
    .advanceTicks(2)
    .events.some((event) => event.type === 'ATTACK_RELEASE'),
  'The exact four-tower projectile reserve boundary must execute one firing step.',
);
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  projectileBoundarySimulation.createCheckpoint(),
);
const exhaustedProjectileCheckpoint = JSON.parse(
  JSON.stringify(projectileBoundaryCheckpoint),
) as typeof projectileBoundaryCheckpoint;
exhaustedProjectileCheckpoint.state.nextProjectileId += 1;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedProjectileCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const unsafeProjectileCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
unsafeProjectileCheckpoint.state.nextProjectileId = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(unsafeProjectileCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);

const enemyBoundaryCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
enemyBoundaryCheckpoint.state.nextEnemyId =
  1_500_000_000 - sequenceRemainingTicks * 121;
const enemyBoundarySimulation = createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(enemyBoundaryCheckpoint)),
);
assert.ok(
  enemyBoundarySimulation.advanceTicks(1).events.some((event) => event.type === 'SPAWN'),
  'The exact 121-enemy reserve boundary must execute one spawn step.',
);
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  enemyBoundarySimulation.createCheckpoint(),
);
const exhaustedEnemyCheckpoint = JSON.parse(
  JSON.stringify(enemyBoundaryCheckpoint),
) as typeof enemyBoundaryCheckpoint;
exhaustedEnemyCheckpoint.state.nextEnemyId += 1;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedEnemyCheckpoint)),
  ),
  'endless enemy sequence is not monotonic',
);

const eventReserve = sequenceRemainingTicks * 1_024 +
  projectileProbeBundle.rules.maxLevel +
  projectileProbeBundle.rules.maxRevives +
  2;
const eventBoundaryCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
eventBoundaryCheckpoint.state.eventSeq = Number.MAX_SAFE_INTEGER - eventReserve;
const eventBoundarySimulation = createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(eventBoundaryCheckpoint)),
);
assert.equal(
  eventBoundarySimulation.applyCommand({ seq: 1, type: 'FORFEIT' }).events.length,
  2,
  'The exact lifetime event reserve boundary must support a two-event settlement.',
);
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  eventBoundarySimulation.createCheckpoint(),
);
const exhaustedEventCheckpoint = JSON.parse(
  JSON.stringify(eventBoundaryCheckpoint),
) as typeof eventBoundaryCheckpoint;
exhaustedEventCheckpoint.state.eventSeq += 1;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedEventCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const exhaustedAuthorityCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
exhaustedAuthorityCheckpoint.state.lastAuthoritySeq = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedAuthorityCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const exhaustedCommandCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
exhaustedCommandCheckpoint.state.lastCommandSeq = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    projectileProbeBundle,
    seed + 4,
    new TextEncoder().encode(JSON.stringify(exhaustedCommandCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const commandBoundaryCheckpoint = JSON.parse(
  JSON.stringify(sequenceBoundaryCheckpoint),
) as typeof sequenceBoundaryCheckpoint;
commandBoundaryCheckpoint.state.lastCommandSeq = Number.MAX_SAFE_INTEGER - 1;
const commandBoundarySimulation = createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  new TextEncoder().encode(JSON.stringify(commandBoundaryCheckpoint)),
);
const commandBoundaryChecksum = commandBoundarySimulation.getChecksum();
const exhaustedCommandOutput = commandBoundarySimulation.applyCommand({
  seq: Number.MAX_SAFE_INTEGER,
  type: 'FORFEIT',
});
assert.equal(exhaustedCommandOutput.commandAcks[0]?.status, 'rejected');
assert.equal(commandBoundarySimulation.getChecksum(), commandBoundaryChecksum);
createBattleSimulation(
  projectileProbeBundle,
  seed + 4,
  commandBoundarySimulation.createCheckpoint(),
);

const offerProbeBundle = resolveStageBundleForSeed('STAGE_08', seed + 5);
offerProbeBundle.tower.baseDamageMilli = 3_000_000_000;
offerProbeBundle.tower.attackIntervalTicks = 6;
offerProbeBundle.tower.rangePx = 5_000;
offerProbeBundle.tower.projectileSpeedPxPerSecond = 100_000;
offerProbeBundle.tower.critChanceBp = 0;
const offerProbeSimulation = createBattleSimulation(offerProbeBundle, seed + 5);
const offerProbeAuthority = new LocalPracticeAuthority(offerProbeBundle, seed + 5);
let offerRequest: Extract<SimulationOutput['flowRequests'][number], { type: 'OFFER' }> | undefined;
while (offerRequest === undefined) {
  const output = offerProbeSimulation.advanceTicks(2_000);
  offerRequest = output.flowRequests.find(
    (request): request is Extract<typeof request, { type: 'OFFER' }> => request.type === 'OFFER',
  );
  if (output.ticksAdvanced === 0 && offerRequest === undefined) {
    throw new Error('Offer checkpoint probe stalled.');
  }
}
const activeOffer = offerProbeAuthority.requestOffer(
  offerRequest.ordinal,
  undefined,
  offerRequest.eligibleEffectIds,
);
offerProbeSimulation.applyAuthorityEvent(activeOffer);
const activeOfferCheckpoint = JSON.parse(
  new TextDecoder().decode(offerProbeSimulation.createCheckpoint()),
) as {
  state: {
    flowState: string;
    lastAuthoritySeq: number;
    activeOffer: { offerId: string; cards: [string, string, string] } | null;
  };
};
const restoredActiveOffer = createBattleSimulation(
  offerProbeBundle,
  seed + 5,
  new TextEncoder().encode(JSON.stringify(activeOfferCheckpoint)),
);
assert.equal(restoredActiveOffer.getHudProjection().flowState, 'offer-pending');
const authorityBoundaryCheckpoint = JSON.parse(
  JSON.stringify(activeOfferCheckpoint),
) as typeof activeOfferCheckpoint;
authorityBoundaryCheckpoint.state.lastAuthoritySeq = Number.MAX_SAFE_INTEGER - 1;
const authorityBoundarySimulation = createBattleSimulation(
  offerProbeBundle,
  seed + 5,
  new TextEncoder().encode(JSON.stringify(authorityBoundaryCheckpoint)),
);
const boundaryChoice = {
  ...offerProbeAuthority.acceptChoice(activeOffer.offerId, activeOffer.cards[0]),
  authoritySeq: Number.MAX_SAFE_INTEGER,
};
const authorityBoundaryChecksum = authorityBoundarySimulation.getChecksum();
expectThrow(
  () => authorityBoundarySimulation.applyAuthorityEvent(boundaryChoice),
  'malformed or exhausted',
);
assert.equal(authorityBoundarySimulation.getChecksum(), authorityBoundaryChecksum);
createBattleSimulation(
  offerProbeBundle,
  seed + 5,
  authorityBoundarySimulation.createCheckpoint(),
);
const missingOfferCheckpoint = JSON.parse(JSON.stringify(activeOfferCheckpoint)) as typeof activeOfferCheckpoint;
missingOfferCheckpoint.state.activeOffer = null;
expectThrow(
  () => createBattleSimulation(
    offerProbeBundle,
    seed + 5,
    new TextEncoder().encode(JSON.stringify(missingOfferCheckpoint)),
  ),
  'offer flow and active offer are inconsistent',
);
const leakedOfferCheckpoint = JSON.parse(JSON.stringify(activeOfferCheckpoint)) as typeof activeOfferCheckpoint;
leakedOfferCheckpoint.state.flowState = 'running';
expectThrow(
  () => createBattleSimulation(
    offerProbeBundle,
    seed + 5,
    new TextEncoder().encode(JSON.stringify(leakedOfferCheckpoint)),
  ),
  'offer flow and active offer are inconsistent',
);
const duplicateOfferCardCheckpoint = JSON.parse(
  JSON.stringify(activeOfferCheckpoint),
) as typeof activeOfferCheckpoint;
assert.ok(duplicateOfferCardCheckpoint.state.activeOffer);
duplicateOfferCardCheckpoint.state.activeOffer.cards[1] =
  duplicateOfferCardCheckpoint.state.activeOffer.cards[0];
expectThrow(
  () => createBattleSimulation(
    offerProbeBundle,
    seed + 5,
    new TextEncoder().encode(JSON.stringify(duplicateOfferCardCheckpoint)),
  ),
  'active offer is malformed',
);
const wrongOfferOrdinalCheckpoint = JSON.parse(
  JSON.stringify(activeOfferCheckpoint),
) as typeof activeOfferCheckpoint;
assert.ok(wrongOfferOrdinalCheckpoint.state.activeOffer);
wrongOfferOrdinalCheckpoint.state.activeOffer.offerId = 'practice-offer-999-1';
expectThrow(
  () => createBattleSimulation(
    offerProbeBundle,
    seed + 5,
    new TextEncoder().encode(JSON.stringify(wrongOfferOrdinalCheckpoint)),
  ),
  'active offer is malformed',
);

const malformedQueueCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint;
const firstPendingUnit = malformedQueueCheckpoint.state.endless.pendingPacks[0]?.units[0];
assert.ok(firstPendingUnit);
firstPendingUnit.enemyId = 'MISSING_ENEMY';
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(malformedQueueCheckpoint)),
  ),
  'invalid endless threat queue',
);
for (const multiplierField of [
  'hpMultiplierBp',
  'speedMultiplierBp',
  'expMultiplierBp',
] as const) {
  const unsafeMultiplierCheckpoint = JSON.parse(
    JSON.stringify(capCheckpoint),
  ) as typeof capCheckpoint;
  const unsafeUnit = unsafeMultiplierCheckpoint.state.endless.pendingPacks[0]?.units[0];
  assert.ok(unsafeUnit);
  unsafeUnit[multiplierField] = Number.MAX_SAFE_INTEGER;
  expectThrow(
    () => createBattleSimulation(
      capBundle,
      seed,
      new TextEncoder().encode(JSON.stringify(unsafeMultiplierCheckpoint)),
    ),
    'invalid endless threat queue',
  );
}
const malformedPhaseCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint & {
  state: { endless: { bossLayer: number } };
};
malformedPhaseCheckpoint.state.endless.bossLayer = 1;
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(malformedPhaseCheckpoint)),
  ),
  'phase and score fields are inconsistent',
);
const fakeVictoryCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint & {
  state: { flowState: string; outcome: string; endless: { phase: string } };
};
fakeVictoryCheckpoint.state.flowState = 'result';
fakeVictoryCheckpoint.state.outcome = 'victory';
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(fakeVictoryCheckpoint)),
  ),
  'phase and score fields are inconsistent',
);
const unknownFlowCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint & {
  state: { flowState: string };
};
unknownFlowCheckpoint.state.flowState = 'garbage';
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(unknownFlowCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
for (const unreachableFlowState of ['suspended', 'performance-paused'] as const) {
  const unreachableFlowCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint & {
    state: { flowState: string };
  };
  unreachableFlowCheckpoint.state.flowState = unreachableFlowState;
  expectThrow(
    () => createBattleSimulation(
      capBundle,
      seed,
      new TextEncoder().encode(JSON.stringify(unreachableFlowCheckpoint)),
    ),
    'collections or entity sequences are malformed',
  );
}
const fakeBossScoreCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint & {
  state: { endless: { bossDamageMilli: number } };
};
fakeBossScoreCheckpoint.state.endless.bossDamageMilli = 1;
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(fakeBossScoreCheckpoint)),
  ),
  'phase and score fields are inconsistent',
);
const collidingNamespaceCheckpoint = JSON.parse(JSON.stringify(capCheckpoint)) as typeof capCheckpoint & {
  state: { nextEnemyId: number; nextProjectileId: number };
};
collidingNamespaceCheckpoint.state.nextEnemyId =
  collidingNamespaceCheckpoint.state.nextProjectileId;
expectThrow(
  () => createBattleSimulation(
    capBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(collidingNamespaceCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);

const breachBundle = resolveStageBundleForSeed('STAGE_08', seed + 9);
breachBundle.rules.maxRevives = 0;
breachBundle.tower.rangePx = 1;
breachBundle.route.points = [{ x: 0, y: 100 }, { x: 1, y: 100 }];
breachBundle.route.breachPoint = { x: 1, y: 100 };
for (const enemy of Object.values(breachBundle.enemies)) enemy.speedPxPerSecond = 100_000;
const breachSimulation = createBattleSimulation(breachBundle, seed + 9);
const breachOutput = breachSimulation.advanceTicks(1);
const breachSettled = breachOutput.events.find(
  (event): event is Extract<BattleEvent, { type: 'ENDLESS_SETTLED' }> =>
    event.type === 'ENDLESS_SETTLED',
);
assert.ok(breachSettled);
assert.equal(breachSettled.reason, 'breach');
assert.equal(breachSettled.survivalTick, 1);
assert.equal(breachSimulation.getHudProjection().tick, 1);
assert.equal(breachSimulation.getHudProjection().endless?.survivalTick, 1);
assert.equal(breachSimulation.getHudProjection().outcome, 'defeat');

const revivePendingBundle = resolveStageBundleForSeed('STAGE_08', seed + 10);
revivePendingBundle.rules.maxRevives = 1;
revivePendingBundle.tower.rangePx = 1;
revivePendingBundle.route.points = [{ x: 0, y: 100 }, { x: 1, y: 100 }];
revivePendingBundle.route.breachPoint = { x: 1, y: 100 };
for (const enemy of Object.values(revivePendingBundle.enemies)) enemy.speedPxPerSecond = 100_000;
const revivePendingSimulation = createBattleSimulation(revivePendingBundle, seed + 10);
const revivePendingOutput = revivePendingSimulation.advanceTicks(1);
assert.ok(revivePendingOutput.flowRequests.some((request) => request.type === 'REVIVE'));
assert.equal(revivePendingSimulation.getHudProjection().flowState, 'defeat-pending');
assert.equal(
  createBattleSimulation(
    revivePendingBundle,
    seed + 10,
    revivePendingSimulation.createCheckpoint(),
  ).getHudProjection().flowState,
  'defeat-pending',
  'A valid defeat-pending checkpoint must remain restorable.',
);
const exhaustedReviveCheckpoint = JSON.parse(
  new TextDecoder().decode(revivePendingSimulation.createCheckpoint()),
) as {
  state: { revivesUsed: number };
};
exhaustedReviveCheckpoint.state.revivesUsed = revivePendingBundle.rules.maxRevives;
expectThrow(
  () => createBattleSimulation(
    revivePendingBundle,
    seed + 10,
    new TextEncoder().encode(JSON.stringify(exhaustedReviveCheckpoint)),
  ),
  'no valid pending revive',
);

const combatBundle = resolveStageBundleForSeed('STAGE_08', seed);
combatBundle.tower.baseDamageMilli = 3_000_000_000;
combatBundle.tower.attackIntervalTicks = 6;
combatBundle.tower.rangePx = 5_000;
combatBundle.tower.projectileSpeedPxPerSecond = 100_000;
combatBundle.tower.critChanceBp = 0;
const combat = createHarness(combatBundle, seed);
runToTick(combat, 36_000);
const bossPhase = combat.events.find(
  (event): event is Extract<BattleEvent, { type: 'ENDLESS_PHASE_CHANGED' }> =>
    event.type === 'ENDLESS_PHASE_CHANGED' && event.phase === 'boss',
);
assert.ok(bossPhase);
assert.equal(bossPhase.tick, 36_000);
assert.equal(combat.simulation.getHudProjection().endless?.phase, 'boss');
assert.ok(
  combat.simulation.getHudProjection().level >= 35 &&
  combat.simulation.getHudProjection().level <= 42,
  `20-minute target level drifted to ${combat.simulation.getHudProjection().level}.`,
);
const miniBossIds = combatBundle.endless?.miniBossEnemyIds ?? [];
for (const [index, miniBossTick] of [14_400, 25_200, 34_200].entries()) {
  assert.equal(
    combat.events.filter(
      (event) =>
        event.type === 'SPAWN' &&
        event.tick === miniBossTick &&
        event.enemyId === miniBossIds[index],
    ).length,
    1,
    `Mini boss ${index + 1} must be inserted once at tick ${miniBossTick}.`,
  );
}
assert.equal(combat.events.some((event) => event.type === 'VICTORY'), false);

const bossCheckpoint = combat.simulation.createCheckpoint();
const restoredBoss = createBattleSimulation(combatBundle, seed, bossCheckpoint);
assert.equal(restoredBoss.getChecksum(), combat.simulation.getChecksum());
const originalContinuation = combat.simulation.advanceTicks(300);
const restoredContinuation = restoredBoss.advanceTicks(300);
assert.deepEqual(
  originalContinuation.events.map(eventSignature),
  restoredContinuation.events.map(eventSignature),
  'Checkpoint continuation events must remain deterministic.',
);
assert.equal(restoredBoss.getChecksum(), combat.simulation.getChecksum());
consumeOutput(combat, originalContinuation);

const exhaustedBossDamageCheckpoint = JSON.parse(
  new TextDecoder().decode(bossCheckpoint),
) as { state: { endless: { bossDamageMilli: number } } };
exhaustedBossDamageCheckpoint.state.endless.bossDamageMilli = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    combatBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(exhaustedBossDamageCheckpoint)),
  ),
  'Endless checkpoint state is malformed',
);
const unreachableBossLayerCheckpoint = JSON.parse(
  new TextDecoder().decode(bossCheckpoint),
) as { state: { endless: { bossLayer: number } } };
unreachableBossLayerCheckpoint.state.endless.bossLayer = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    combatBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(unreachableBossLayerCheckpoint)),
  ),
  'phase and score fields are inconsistent',
);
const unreachableBossGuardCheckpoint = JSON.parse(
  new TextDecoder().decode(bossCheckpoint),
) as {
  state: {
    enemies: Array<{ entityId: number; invulnerableUntilTick?: number }>;
    endless: { bossEntityId: number | null };
  };
};
const guardedBoss = unreachableBossGuardCheckpoint.state.enemies.find(
  (enemy) => enemy.entityId === unreachableBossGuardCheckpoint.state.endless.bossEntityId,
);
assert.ok(guardedBoss);
guardedBoss.invulnerableUntilTick = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    combatBundle,
    seed,
    new TextEncoder().encode(JSON.stringify(unreachableBossGuardCheckpoint)),
  ),
  'enemy invulnerability is inconsistent',
);
const bossDamageBoundaryCheckpoint = JSON.parse(
  new TextDecoder().decode(bossCheckpoint),
) as { state: { endless: { bossDamageMilli: number } } };
bossDamageBoundaryCheckpoint.state.endless.bossDamageMilli = maximumDamageCounterMilli;
const bossDamageBoundarySimulation = createBattleSimulation(
  combatBundle,
  seed,
  new TextEncoder().encode(JSON.stringify(bossDamageBoundaryCheckpoint)),
);
const bossDamageBoundaryOutput = bossDamageBoundarySimulation.advanceTicks(300);
assert.ok(
  bossDamageBoundaryOutput.events.some((event) => event.type === 'HIT'),
  'The boss damage-counter boundary probe must land a hit.',
);
assert.equal(
  bossDamageBoundarySimulation.getHudProjection().endless?.bossDamageMilli,
  maximumDamageCounterMilli,
  'An exhausted-but-valid boss counter must saturate deterministically.',
);
createBattleSimulation(
  combatBundle,
  seed,
  bossDamageBoundarySimulation.createCheckpoint(),
);

const firstLayer = combat.events.find(
  (event): event is Extract<BattleEvent, { type: 'BOSS_LAYER_ADVANCED' }> =>
    event.type === 'BOSS_LAYER_ADVANCED',
);
assert.ok(firstLayer);
assert.equal(firstLayer.bossLayer, 2);
assert.equal(firstLayer.bossDamageMilli, 96_000_000, 'Boss overkill must not inflate score.');
const thirdLayer = combat.events.find(
  (event): event is Extract<BattleEvent, { type: 'BOSS_LAYER_ADVANCED' }> =>
    event.type === 'BOSS_LAYER_ADVANCED' && event.bossLayer === 3,
);
assert.ok(thirdLayer);
assert.equal(
  thirdLayer.bossDamageMilli - firstLayer.bossDamageMilli,
  115_200_000,
  'The second boss layer must have exactly 1.2x the first layer HP.',
);
const secondLayerSpawn = combat.events.find(
  (event): event is Extract<BattleEvent, { type: 'SPAWN' }> =>
    event.type === 'SPAWN' &&
    event.tick === firstLayer.tick &&
    event.enemyId === combatBundle.endless?.bossEnemyId,
);
assert.ok(secondLayerSpawn);
const firstSecondLayerHit = combat.events.find(
  (event) => event.type === 'HIT' && event.entityId === secondLayerSpawn.entityId,
);
assert.ok(firstSecondLayerHit && firstSecondLayerHit.tick >= firstLayer.tick + 30);

runToTick(combat, 36_451);
assert.ok(
  combat.events.some(
    (event) =>
      event.type === 'SPAWN' &&
      event.tick === 36_450 &&
      event.enemyId === combatBundle.endless?.bossSummonEnemyId,
  ),
  'Abyss Dragon must summon a flying threat at tick 36450.',
);

runToTick(combat, 45_000);
const settled = combat.events.find(
  (event): event is Extract<BattleEvent, { type: 'ENDLESS_SETTLED' }> =>
    event.type === 'ENDLESS_SETTLED',
);
assert.ok(settled);
assert.equal(settled.tick, 45_000);
assert.equal(settled.reason, 'time-limit');
assert.equal(combat.simulation.getHudProjection().outcome, 'settled');
assert.equal(combat.simulation.getHudProjection().endless?.settlementReason, 'time-limit');
assert.equal(combat.events.some((event) => event.type === 'VICTORY'), false);

const expectedSummonTicks = Array.from({ length: 19 }, (_, index) => 36_450 + index * 450);
for (const summonTick of expectedSummonTicks) {
  assert.ok(
    combat.events.some(
      (event) =>
        event.type === 'SPAWN' &&
        event.tick === summonTick &&
        event.enemyId === combatBundle.endless?.bossSummonEnemyId,
    ),
    `Boss summon is missing at tick ${summonTick}.`,
  );
}
const bossEntityIds = new Set(
  combat.events
    .filter(
      (event): event is Extract<BattleEvent, { type: 'SPAWN' }> =>
        event.type === 'SPAWN' && event.enemyId === combatBundle.endless?.bossEnemyId,
    )
    .map((event) => event.entityId),
);
const bossHitTotal = combat.events.reduce(
  (sum, event) =>
    event.type === 'HIT' && bossEntityIds.has(event.entityId)
      ? sum + event.damageMilli
      : sum,
  0,
);
assert.equal(bossHitTotal, settled.bossDamageMilli);
assert.ok(
  combat.events.some(
    (event) =>
      event.type === 'HIT' &&
      !bossEntityIds.has(event.entityId) &&
      event.tick >= 36_450,
  ),
  'Boss summons must receive damage without entering the boss score.',
);

const manualBundle = resolveStageBundleForSeed('STAGE_08', 99);
const manualSimulation = createBattleSimulation(manualBundle, 99);
const manualOutput = manualSimulation.applyCommand({ seq: 1, type: 'FORFEIT' });
const manualSettled = manualOutput.events.find(
  (event): event is Extract<BattleEvent, { type: 'ENDLESS_SETTLED' }> =>
    event.type === 'ENDLESS_SETTLED',
);
assert.ok(manualSettled);
assert.equal(manualSettled.reason, 'manual');
assert.equal(manualSimulation.getHudProjection().outcome, 'settled');
assert.equal(manualSimulation.getHudProjection().endless?.settlementReason, 'manual');
assert.equal(
  createBattleSimulation(
    manualBundle,
    99,
    manualSimulation.createCheckpoint(),
  ).getHudProjection().flowState,
  'result',
  'A valid settled result checkpoint must remain restorable.',
);

const finiteBundle = createStage01Bundle();
const finiteSeed = 0x1020_3040;
const finiteSimulation = createBattleSimulation(finiteBundle, finiteSeed);
assert.equal(
  finiteSimulation.applyCommand({ seq: 1, type: 'START_WAVE' }).commandAcks[0]?.status,
  'applied',
);
finiteSimulation.advanceTicks(20);
const finiteV5 = JSON.parse(new TextDecoder().decode(finiteSimulation.createCheckpoint())) as {
  schemaVersion: number;
  state: Record<string, unknown> & {
    tick: number;
    enemies: Array<{ invulnerableUntilTick?: number }>;
    projectiles: Array<{ focused?: boolean }>;
    gateIntegrity?: number;
    overdriveCharge?: number;
    overdriveTowerId?: number | null;
    overdriveRemainingTicks?: number;
    scheduler: {
      waveIndex: number;
      groupIndex: number;
      unitIndex: number;
      nextSpawnTick: number;
      currentWaveSpawned: number;
    };
  };
};
assert.equal(finiteV5.schemaVersion, 7);
const exhaustedFixedTickCheckpoint = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
exhaustedFixedTickCheckpoint.state.tick = Number.MAX_SAFE_INTEGER;
exhaustedFixedTickCheckpoint.state.scheduler.nextSpawnTick = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    finiteBundle,
    finiteSeed,
    new TextEncoder().encode(JSON.stringify(exhaustedFixedTickCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const unreachableFixedInvulnerability = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
const unreachableFixedEnemy = unreachableFixedInvulnerability.state.enemies[0];
assert.ok(unreachableFixedEnemy);
unreachableFixedEnemy.invulnerableUntilTick = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    finiteBundle,
    finiteSeed,
    new TextEncoder().encode(JSON.stringify(unreachableFixedInvulnerability)),
  ),
  'cannot be invulnerable',
);
const unreachableFixedSpawnCheckpoint = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
unreachableFixedSpawnCheckpoint.state.scheduler.nextSpawnTick = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    finiteBundle,
    finiteSeed,
    new TextEncoder().encode(JSON.stringify(unreachableFixedSpawnCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);
const pausedFixedSimulation = createBattleSimulation(
  finiteBundle,
  finiteSeed,
  new TextEncoder().encode(JSON.stringify(finiteV5)),
);
pausedFixedSimulation.applyCommand({ seq: 2, type: 'PAUSE' });
assert.equal(
  createBattleSimulation(
    finiteBundle,
    finiteSeed,
    pausedFixedSimulation.createCheckpoint(),
  ).getHudProjection().flowState,
  'paused',
  'A paused fixed checkpoint may retain its reachable future spawn tick.',
);
const malformedFixedCursor = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
malformedFixedCursor.state.scheduler.currentWaveSpawned += 1;
expectThrow(
  () => createBattleSimulation(
    finiteBundle,
    finiteSeed,
    new TextEncoder().encode(JSON.stringify(malformedFixedCursor)),
  ),
  'fixed scheduler is inconsistent with battle content',
);
const malformedFixedGroup = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
const finiteCurrentWave = finiteBundle.waves[finiteV5.state.scheduler.waveIndex];
assert.ok(finiteCurrentWave);
malformedFixedGroup.state.scheduler.groupIndex = finiteCurrentWave.groups.length + 1;
expectThrow(
  () => createBattleSimulation(
    finiteBundle,
    finiteSeed,
    new TextEncoder().encode(JSON.stringify(malformedFixedGroup)),
  ),
  'fixed scheduler is inconsistent with battle content',
);
const malformedFixedUnit = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
const finiteCurrentGroup = finiteCurrentWave.groups[finiteV5.state.scheduler.groupIndex];
assert.ok(finiteCurrentGroup);
malformedFixedUnit.state.scheduler.unitIndex = finiteCurrentGroup.count;
expectThrow(
  () => createBattleSimulation(
    finiteBundle,
    finiteSeed,
    new TextEncoder().encode(JSON.stringify(malformedFixedUnit)),
  ),
  'fixed scheduler is inconsistent with battle content',
);
const finiteV4 = JSON.parse(JSON.stringify(finiteV5)) as typeof finiteV5;
finiteV4.schemaVersion = 4;
(finiteV4.state.aimAnglesU16 as number[]).pop();
(finiteV4.state.towerCooldowns as number[]).pop();
delete finiteV4.state.towerPositions;
delete finiteV4.state.preparationTicksRemaining;
for (const field of [
  'warPointsBalance',
  'warPointsEarned',
  'activeTowerIds',
  'shopOfferOrdinal',
  'shopOfferWaveIndex',
  'shopPurchasedWaveIndex',
  'shopPurchasesInWave',
  'shopReturnFlowState',
  'waveBaseWarPoints',
  'waveFocusedKills',
  'waveFocusBonusAwarded',
  'waveBreached',
]) delete finiteV4.state[field];
delete finiteV4.state.gateIntegrity;
delete finiteV4.state.overdriveCharge;
delete finiteV4.state.overdriveTowerId;
delete finiteV4.state.overdriveRemainingTicks;
for (const projectile of finiteV4.state.projectiles) delete projectile.focused;
const restoredV4 = createBattleSimulation(
  finiteBundle,
  finiteSeed,
  new TextEncoder().encode(JSON.stringify(finiteV4)),
);
assert.equal(restoredV4.getHudProjection().tick, 20);
assert.equal(restoredV4.getHudProjection().gateIntegrity, finiteBundle.rules.gateIntegrity);

const finiteV3 = JSON.parse(JSON.stringify(finiteV4)) as typeof finiteV4;
finiteV3.schemaVersion = 3;
delete finiteV3.state.outcome;
delete finiteV3.state.endless;
delete finiteV3.state.nextEnemyId;
const restoredV3 = createBattleSimulation(
  finiteBundle,
  finiteSeed,
  new TextEncoder().encode(JSON.stringify(finiteV3)),
);
assert.equal(restoredV3.getHudProjection().tick, 20);
assert.equal(restoredV3.getHudProjection().mode, 'fixed');

const finiteV2 = JSON.parse(JSON.stringify(finiteV3)) as typeof finiteV3;
finiteV2.schemaVersion = 2;
finiteV2.state.aimAngleU16 = 54_321;
delete finiteV2.state.aimAnglesU16;
const restoredV2 = createBattleSimulation(
  finiteBundle,
  finiteSeed,
  new TextEncoder().encode(JSON.stringify(finiteV2)),
);
assert.deepEqual(
  restoredV2.getHudProjection().aimAnglesU16,
  [54_321, 54_321, 54_321, 32_768],
);
for (const finiteCheckpoint of [finiteV5, finiteV4, finiteV3, finiteV2]) {
  const missingWaveCheckpoint = JSON.parse(
    JSON.stringify(finiteCheckpoint),
  ) as typeof finiteV5;
  missingWaveCheckpoint.state.scheduler.waveIndex = 999;
  expectThrow(
    () => createBattleSimulation(
      finiteBundle,
      finiteSeed,
      new TextEncoder().encode(JSON.stringify(missingWaveCheckpoint)),
    ),
    'fixed scheduler references a missing wave',
  );
}

const finiteResultBundle = createStage01Bundle();
finiteResultBundle.tower.baseDamageMilli = 3_000_000_000;
finiteResultBundle.tower.attackIntervalTicks = 6;
finiteResultBundle.tower.rangePx = 5_000;
finiteResultBundle.tower.projectileSpeedPxPerSecond = 100_000;
finiteResultBundle.tower.critChanceBp = 0;
const finiteResultHarness = createHarness(finiteResultBundle, finiteSeed + 1);
runToTick(finiteResultHarness, 180_000);
assert.equal(finiteResultHarness.simulation.getHudProjection().flowState, 'result');
const unreachableResultSpawnCheckpoint = JSON.parse(
  new TextDecoder().decode(finiteResultHarness.simulation.createCheckpoint()),
) as typeof finiteV4;
unreachableResultSpawnCheckpoint.state.scheduler.nextSpawnTick = Number.MAX_SAFE_INTEGER;
expectThrow(
  () => createBattleSimulation(
    finiteResultBundle,
    finiteSeed + 1,
    new TextEncoder().encode(JSON.stringify(unreachableResultSpawnCheckpoint)),
  ),
  'collections or entity sequences are malformed',
);

const levelMatrix: number[] = [];
for (let index = 0; index < 30; index += 1) {
  const matrixSeed = 0x8000_0000 + index;
  const matrixBundle = resolveStageBundleForSeed('STAGE_08', matrixSeed);
  matrixBundle.tower.baseDamageMilli = 3_000_000_000;
  matrixBundle.tower.attackIntervalTicks = 6;
  matrixBundle.tower.rangePx = 5_000;
  matrixBundle.tower.projectileSpeedPxPerSecond = 100_000;
  matrixBundle.tower.critChanceBp = 0;
  const matrixHarness = createHarness(matrixBundle, matrixSeed);
  runToTick(matrixHarness, 36_000);
  const level = matrixHarness.simulation.getHudProjection().level;
  levelMatrix.push(level);
  assert.ok(level >= 35 && level <= 42, `Seed ${matrixSeed} reached level ${level}.`);
}

console.log('✓ Stage 08 三路线与 1201 项威胁 LUT 固化通过');
console.log('✓ 450/24 tick 威胁包、三次小首领、120 active 上限与排队通过');
console.log('✓ 36000 Boss 切换、450 tick 飞行召唤、分层与实际伤害计分通过');
console.log('✓ 45000/manual 结算、无 VICTORY、checkpoint V7 与 finite V2–V6 兼容通过');
console.log(`✓ 30 seeds 满清怪 20 分钟等级区间 ${Math.min(...levelMatrix)}–${Math.max(...levelMatrix)} 通过`);
