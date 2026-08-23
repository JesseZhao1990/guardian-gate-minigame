import { createBattleSimulation } from '../src/core/battle-sim';
import { createStage01Bundle, createStage08Bundle } from '../src/core/content';
import {
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  type BattleBundleV1,
  type BattleCommand,
  type Point,
} from '../src/core/contracts';

interface SmokeAssert {
  equal(actual: unknown, expected: unknown, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): asserts value;
  throws(callback: () => unknown, message?: string): Error;
}

const assert: SmokeAssert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  deepEqual(actual, expected, message) {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new Error(message ?? `Expected ${expectedJson}, received ${actualJson}`);
    }
  },
  ok(value, message) {
    if (!value) throw new Error(message ?? `Expected truthy value, received ${String(value)}`);
  },
  throws(callback, message) {
    let thrown: unknown;
    try {
      callback();
    } catch (error) {
      thrown = error;
    }
    if (!(thrown instanceof Error)) {
      throw new Error(message ?? 'Expected callback to throw an Error.');
    }
    return thrown;
  },
};

const SEED = 0x4a17_2026;
const THIRD_POSITION = { x: 320, y: 800 } as const;
const MOVED_THIRD_POSITION = { x: 640, y: 800 } as const;
const FOURTH_POSITION = { x: 1_600, y: 800 } as const;

function fixtureBundle(): BattleBundleV1 {
  const bundle = createStage01Bundle();
  bundle.route.points = [
    { x: 960, y: 96 },
    { x: 960, y: 1_104 },
  ];
  // This fixture owns tower lifecycle and projectile identity, not the
  // Stage 01 authored gate ingress contract.
  bundle.route.combatStartDistancePx = 1;
  bundle.route.breachPoint = { x: 960, y: 1_104 };
  bundle.route.towerAnchors = [
    { x: 320, y: 320 },
    { x: 1_600, y: 320 },
    THIRD_POSITION,
    FOURTH_POSITION,
  ];
  bundle.tower.rangePx = 5_000;
  bundle.tower.attackIntervalTicks = 1;
  bundle.tower.projectileSpeedPxPerSecond = 600;
  bundle.tower.baseDamageMilli = 1;
  return bundle;
}

function checkpointAtCompletedWaves(
  bundle: BattleBundleV1,
  completedWaves: 0 | 1 | 2 | 3 | 4,
): Uint8Array {
  const initial = createBattleSimulation(bundle, SEED);
  const envelope = JSON.parse(new TextDecoder().decode(initial.createCheckpoint())) as {
    schemaVersion: number;
    state: {
      warPointsBalance: number;
      warPointsEarned: number;
      scheduler: {
        waveIndex: number;
        groupIndex: number;
        unitIndex: number;
        nextSpawnTick: number;
        allGroupsSpawned: boolean;
        completedWaves: number;
        currentWaveSpawned: number;
        currentWaveKilled: number;
        victoryPending: boolean;
      };
    };
  };
  assert.equal(envelope.schemaVersion, 7);
  envelope.state.warPointsBalance = 1_000;
  envelope.state.warPointsEarned = 1_000;
  envelope.state.scheduler = {
    waveIndex: completedWaves,
    groupIndex: 0,
    unitIndex: 0,
    nextSpawnTick: 180,
    allGroupsSpawned: false,
    completedWaves,
    currentWaveSpawned: 0,
    currentWaveKilled: 0,
    victoryPending: false,
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
}

function command(
  seq: number,
  value: BattleCommand extends infer Candidate
    ? Candidate extends { seq: number }
      ? Omit<Candidate, 'seq'>
      : never
    : never,
): BattleCommand {
  return { seq, ...value } as BattleCommand;
}

const bundle = fixtureBundle();

// A build is atomic and remains locked until two complete waves.
const locked = createBattleSimulation(bundle, SEED, checkpointAtCompletedWaves(bundle, 1));
const lockedBefore = locked.getHudProjection();
assert.deepEqual(lockedBefore.towerBuild, {
  nextTowerId: 2,
  cost: bundle.rules.towerBuildCost,
  requiredCompletedWaves: 2,
  completedWaves: 1,
  unlocked: false,
  affordable: true,
  canBuild: false,
});
const lockedOutput = locked.applyCommand(command(1, {
  type: 'BUILD_TOWER',
  point: THIRD_POSITION,
}));
assert.equal(lockedOutput.commandAcks[0]?.status, 'rejected');
assert.equal(locked.getHudProjection().warPointsBalance, lockedBefore.warPointsBalance);
assert.deepEqual(locked.getHudProjection().activeTowerIds, lockedBefore.activeTowerIds);
assert.deepEqual(locked.getHudProjection().towerPositions, lockedBefore.towerPositions);

const waveTwo = createBattleSimulation(bundle, SEED, checkpointAtCompletedWaves(bundle, 2));
const beforeInvalid = waveTwo.getHudProjection();
const invalidBuild = waveTwo.applyCommand(command(1, {
  type: 'BUILD_TOWER',
  point: { x: 960, y: 512 },
}));
assert.equal(invalidBuild.commandAcks[0]?.status, 'rejected');
const afterInvalid = waveTwo.getHudProjection();
assert.equal(afterInvalid.warPointsBalance, beforeInvalid.warPointsBalance);
assert.deepEqual(afterInvalid.activeTowerIds, beforeInvalid.activeTowerIds);
assert.deepEqual(afterInvalid.towerPositions, beforeInvalid.towerPositions);

const builtThird = waveTwo.applyCommand(command(2, {
  type: 'BUILD_TOWER',
  point: { x: 319, y: 801 },
}));
assert.equal(builtThird.commandAcks[0]?.status, 'applied');
const builtThirdEvent = builtThird.events.find((event) => event.type === 'TOWER_BUILT');
assert.ok(builtThirdEvent && builtThirdEvent.type === 'TOWER_BUILT');
assert.deepEqual(builtThirdEvent.point, THIRD_POSITION, 'Successful builds must store the snapped point.');
assert.equal(builtThirdEvent.towerId, 2);
assert.equal(builtThirdEvent.cost, bundle.rules.towerBuildCost);
assert.deepEqual(waveTwo.getHudProjection().activeTowerIds, [0, 1, 2]);
assert.deepEqual(waveTwo.getHudProjection().towerBuild, {
  nextTowerId: 3,
  cost: bundle.rules.towerBuildCost,
  requiredCompletedWaves: 4,
  completedWaves: 2,
  unlocked: false,
  affordable: true,
  canBuild: false,
});

const moved = waveTwo.applyCommand(command(3, {
  type: 'MOVE_TOWER',
  towerId: 2,
  point: MOVED_THIRD_POSITION,
}));
assert.equal(moved.commandAcks[0]?.status, 'applied');
const movedEvent = moved.events.find((event) => event.type === 'TOWER_MOVED');
assert.ok(movedEvent && movedEvent.type === 'TOWER_MOVED');
assert.deepEqual(movedEvent.point, MOVED_THIRD_POSITION);
assert.deepEqual(waveTwo.getHudProjection().towerPositions[2], MOVED_THIRD_POSITION);

const movedCheckpoint = waveTwo.createCheckpoint();
assert.equal(
  createBattleSimulation(bundle, SEED, movedCheckpoint).getChecksum(),
  waveTwo.getChecksum(),
  'A legal custom active-tower position must survive checkpoint restore.',
);
const invalidCustomCheckpoint = JSON.parse(new TextDecoder().decode(movedCheckpoint)) as {
  state: { towerPositions: Point[] };
};
invalidCustomCheckpoint.state.towerPositions[2] = { x: 960, y: 512 };
assert.throws(
  () => createBattleSimulation(
    bundle,
    SEED,
    new TextEncoder().encode(JSON.stringify(invalidCustomCheckpoint)),
  ),
  'A checkpoint must reject an illegal custom active-tower position.',
);
const movedInactiveCheckpoint = JSON.parse(new TextDecoder().decode(movedCheckpoint)) as {
  state: { towerPositions: Point[] };
};
movedInactiveCheckpoint.state.towerPositions[3] = { x: 1_568, y: 800 };
assert.throws(
  () => createBattleSimulation(
    bundle,
    SEED,
    new TextEncoder().encode(JSON.stringify(movedInactiveCheckpoint)),
  ),
  'An inactive tower slot must remain on its authored anchor.',
);

assert.equal(waveTwo.applyCommand(command(4, { type: 'START_WAVE' })).commandAcks[0]?.status, 'applied');
const runningPosition = waveTwo.getHudProjection().towerPositions[2];
const runningMove = waveTwo.applyCommand(command(5, {
  type: 'MOVE_TOWER',
  towerId: 2,
  point: THIRD_POSITION,
}));
assert.equal(runningMove.commandAcks[0]?.status, 'rejected');
assert.deepEqual(waveTwo.getHudProjection().towerPositions[2], runningPosition);

// At wave four both additional towers may be built without spending a skill purchase.
const waveFour = createBattleSimulation(bundle, SEED, checkpointAtCompletedWaves(bundle, 4));
const skillPurchasesBefore = waveFour.getHudProjection().shopPurchasesThisWave;
assert.equal(waveFour.applyCommand(command(1, {
  type: 'BUILD_TOWER',
  point: THIRD_POSITION,
})).commandAcks[0]?.status, 'applied');
const fourthBuildOutput = waveFour.applyCommand(command(2, {
  type: 'BUILD_TOWER',
  point: FOURTH_POSITION,
}));
assert.equal(fourthBuildOutput.commandAcks[0]?.status, 'applied');
assert.equal(fourthBuildOutput.events.some((event) =>
  event.type === 'TOWER_BUILT' && event.towerId === 3), true);
const fourTowerHud = waveFour.getHudProjection();
assert.deepEqual(fourTowerHud.activeTowerIds, [0, 1, 2, 3]);
assert.equal(fourTowerHud.shopPurchasesThisWave, skillPurchasesBefore);
assert.deepEqual(fourTowerHud.towerBuild, {
  nextTowerId: null,
  cost: bundle.rules.towerBuildCost,
  requiredCompletedWaves: 0,
  completedWaves: 4,
  unlocked: false,
  affordable: false,
  canBuild: false,
});

// Fixed shop eligibility contains only skills; tower-count is a legacy definition.
const shop = createBattleSimulation(bundle, SEED);
const shopOutput = shop.applyCommand(command(1, { type: 'OPEN_SHOP' }));
assert.equal(shopOutput.commandAcks[0]?.status, 'applied');
assert.equal(
  shopOutput.flowRequests[0]?.type === 'OFFER' &&
    shopOutput.flowRequests[0].eligibleEffectIds.includes('tower-count'),
  false,
);

// Tower 3 participates in combat and retains its two-bit projectile identity.
assert.equal(waveFour.applyCommand(command(3, { type: 'START_WAVE' })).commandAcks[0]?.status, 'applied');
waveFour.advanceTicks(1);
const towerThreeProjectile = waveFour.getRenderSnapshot().entities.find((entity) =>
  entity.renderKind === 'projectile' &&
  ((entity.flags & PROJECTILE_FLAG_TOWER_ID_MASK) >>> PROJECTILE_FLAG_TOWER_ID_SHIFT) === 3);
assert.ok(towerThreeProjectile, 'Tower 3 must emit a projectile with the ID3 render flag.');

// Schema V6 pads fixed tower arrays and authored positions while preserving flow.
const currentEnvelope = JSON.parse(new TextDecoder().decode(
  createBattleSimulation(bundle, SEED).createCheckpoint(),
)) as {
  schemaVersion: number;
  state: {
    flowState: string;
    preparationTicksRemaining?: number;
    aimAnglesU16: number[];
    towerCooldowns: number[];
    towerPositions?: Point[];
    scheduler: { nextSpawnTick: number };
  };
};
currentEnvelope.schemaVersion = 6;
currentEnvelope.state.aimAnglesU16.pop();
currentEnvelope.state.towerCooldowns.pop();
delete currentEnvelope.state.towerPositions;
const migrated = createBattleSimulation(
  bundle,
  SEED,
  new TextEncoder().encode(JSON.stringify(currentEnvelope)),
);
assert.equal(migrated.getHudProjection().aimAnglesU16.length, 4);
assert.equal(migrated.getHudProjection().towerPositions.length, 4);
assert.deepEqual(migrated.getHudProjection().towerPositions, bundle.route.towerAnchors);
const migratedEnvelope = JSON.parse(new TextDecoder().decode(migrated.createCheckpoint())) as {
  schemaVersion: number;
};
assert.equal(migratedEnvelope.schemaVersion, 7);

const legacyRunningEnvelope = JSON.parse(new TextDecoder().decode(
  createBattleSimulation(bundle, SEED).createCheckpoint(),
)) as typeof currentEnvelope;
legacyRunningEnvelope.schemaVersion = 6;
legacyRunningEnvelope.state.flowState = 'running';
delete legacyRunningEnvelope.state.preparationTicksRemaining;
legacyRunningEnvelope.state.scheduler.nextSpawnTick = 0;
legacyRunningEnvelope.state.aimAnglesU16.pop();
legacyRunningEnvelope.state.towerCooldowns.pop();
delete legacyRunningEnvelope.state.towerPositions;
const migratedRunning = createBattleSimulation(
  bundle,
  SEED,
  new TextEncoder().encode(JSON.stringify(legacyRunningEnvelope)),
);
assert.equal(migratedRunning.getHudProjection().flowState, 'running');
assert.equal(migratedRunning.getHudProjection().preparationTicksRemaining, 0);

function createSyntheticLegacyCheckpoint(schemaVersion: 2 | 3 | 4 | 5): Uint8Array {
  const envelope = JSON.parse(new TextDecoder().decode(
    createBattleSimulation(bundle, SEED).createCheckpoint(),
  )) as { schemaVersion: number; state: Record<string, any> };
  envelope.schemaVersion = schemaVersion;
  const state = envelope.state;
  state.flowState = 'running';
  state.scheduler.nextSpawnTick = 0;
  state.aimAnglesU16.pop();
  state.towerCooldowns.pop();
  delete state.towerPositions;
  delete state.preparationTicksRemaining;
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
  ]) delete state[field];
  if (schemaVersion <= 4) {
    delete state.gateIntegrity;
    delete state.overdriveCharge;
    delete state.overdriveTowerId;
    delete state.overdriveRemainingTicks;
  }
  if (schemaVersion <= 3) {
    delete state.outcome;
    delete state.endless;
    delete state.nextEnemyId;
  }
  if (schemaVersion === 2) {
    state.aimAngleU16 = 54_321;
    delete state.aimAnglesU16;
  }
  return new TextEncoder().encode(JSON.stringify(envelope));
}

for (const schemaVersion of [2, 3, 4, 5] as const) {
  const legacy = createBattleSimulation(
    bundle,
    SEED,
    createSyntheticLegacyCheckpoint(schemaVersion),
  );
  assert.equal(legacy.getHudProjection().aimAnglesU16.length, 4);
  assert.equal(legacy.getHudProjection().towerPositions.length, 4);
  assert.deepEqual(legacy.getHudProjection().towerPositions, bundle.route.towerAnchors);
  assert.deepEqual(legacy.getHudProjection().activeTowerIds, [0, 1, 2]);
  assert.equal(
    (JSON.parse(new TextDecoder().decode(legacy.createCheckpoint())) as { schemaVersion: number })
      .schemaVersion,
    7,
  );
}

// Stage 08 and endless mode are a bidirectional content boundary.
const invalidFixedStage08 = createStage08Bundle();
invalidFixedStage08.mode = 'fixed';
assert.ok(
  assert.throws(() => createBattleSimulation(invalidFixedStage08, SEED)).message.includes(
    'Stage 08 is reserved for endless mode',
  ),
);
const invalidEndlessStage01 = createStage01Bundle();
invalidEndlessStage01.mode = 'endless';
assert.ok(
  assert.throws(() => createBattleSimulation(invalidEndlessStage01, SEED)).message.includes(
    'Stage 08 is reserved for endless mode',
  ),
);

// Stage 08 stays exact: no build/move commands and no mutable tower positions.
const endlessBundle = createStage08Bundle();
const endless = createBattleSimulation(endlessBundle, SEED);
const endlessBefore = endless.getHudProjection();
assert.deepEqual(endlessBefore.activeTowerIds, [0, 1, 2]);
assert.deepEqual(endlessBefore.towerPositions, endlessBundle.route.towerAnchors);
assert.equal(endless.applyCommand(command(1, {
  type: 'BUILD_TOWER',
  point: THIRD_POSITION,
})).commandAcks[0]?.status, 'rejected');
assert.equal(endless.applyCommand(command(2, {
  type: 'MOVE_TOWER',
  towerId: 0,
  point: { x: 320, y: 320 },
})).commandAcks[0]?.status, 'rejected');
assert.deepEqual(endless.getHudProjection().towerPositions, endlessBefore.towerPositions);

const tamperedEndless = JSON.parse(new TextDecoder().decode(endless.createCheckpoint())) as {
  state: { towerPositions: Point[] };
};
tamperedEndless.state.towerPositions[0]!.x += 32;
assert.throws(
  () => createBattleSimulation(
    endlessBundle,
    SEED,
    new TextEncoder().encode(JSON.stringify(tamperedEndless)),
  ),
  'Stage 08 must reject any checkpoint that changes its exact authored tower positions.',
);

console.log('✓ 四塔动态布阵、波次解锁、V7 迁移与 Stage 08 隔离校验通过');
