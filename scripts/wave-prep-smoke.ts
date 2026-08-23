import { createBattleSimulation, type BattleSimulation } from '../src/core/battle-sim';
import { STAGE_BUNDLES } from '../src/core/content';
import {
  BATTLE_STAGE_ORDER,
  FIXED_WAVE_PREPARATION_TICKS,
  type BattleBundleV1,
  type BattleCommand,
} from '../src/core/contracts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

type CommandPayload = BattleCommand extends infer Command
  ? Command extends { seq: number }
    ? Omit<Command, 'seq'>
    : never
  : never;

function command(
  simulation: BattleSimulation,
  seq: number,
  payload: CommandPayload,
  expected: 'applied' | 'rejected' = 'applied',
): void {
  const output = simulation.applyCommand({ seq, ...payload } as BattleCommand);
  equal(output.commandAcks[0]?.status, expected, `${payload.type} command status.`);
}

function fastFiveWaveBundle(): BattleBundleV1 {
  const bundle = JSON.parse(JSON.stringify(STAGE_BUNDLES.STAGE_01)) as BattleBundleV1;
  const enemyId = bundle.waves[0]?.groups[0]?.enemyId;
  if (!enemyId) throw new Error('Stage 01 must expose an opening enemy fixture.');
  bundle.releaseId = 'GG_WAVE_PREP_SMOKE_V1';
  bundle.configHash = 'sha256:wave-prep-smoke';
  bundle.tower = {
    ...bundle.tower,
    baseDamageMilli: 1_000_000_000,
    attackIntervalTicks: 6,
    rangePx: 5_000,
    projectileSpeedPxPerSecond: 10_000,
  };
  bundle.waves = Array.from({ length: 5 }, (_, index) => ({
    id: `WAVE_PREP_SMOKE_${index + 1}`,
    index: index + 1,
    hpMultiplierBp: 10_000,
    expMultiplierBp: 10_000,
    groups: [{ enemyId, count: 1, intervalTicks: 1 }],
  }));
  return bundle;
}

const fixed = createBattleSimulation(STAGE_BUNDLES.STAGE_01, 0x5100_0001);
const initial = fixed.getHudProjection();
equal(initial.flowState, 'preparing', 'Fixed campaign must begin in preparation.');
equal(initial.preparationTicksRemaining, FIXED_WAVE_PREPARATION_TICKS, 'Initial countdown.');
equal(initial.preparationTicksTotal, FIXED_WAVE_PREPARATION_TICKS, 'Preparation total.');
equal(initial.wavePreviewIndex, 1, 'Initial preview wave.');
equal(fixed.getRenderSnapshot().entities.length, 0, 'Preparation starts with no render entities.');

command(fixed, 1, { type: 'SET_SPEED', value: 2 });
const halfSecond = fixed.advanceWallTime(500);
equal(halfSecond.ticksAdvanced, 30, '2x wall-time preparation advancement.');
equal(
  fixed.getHudProjection().preparationTicksRemaining,
  FIXED_WAVE_PREPARATION_TICKS - 30,
  'Wall time must deterministically consume preparation ticks at current speed.',
);
assert(
  halfSecond.events.every((event) => event.type !== 'SPAWN' && event.type !== 'HIT'),
  'Preparation must not spawn enemies or fire towers.',
);

const remainingBeforeShop = fixed.getHudProjection().preparationTicksRemaining;
command(fixed, 2, { type: 'OPEN_SHOP' });
equal(fixed.getHudProjection().flowState, 'offer-pending', 'Shop opens from preparation.');
command(fixed, 3, { type: 'CLOSE_SHOP' });
equal(fixed.getHudProjection().flowState, 'preparing', 'Closing shop returns to preparation.');
equal(
  fixed.getHudProjection().preparationTicksRemaining,
  remainingBeforeShop,
  'Shop overlay must not consume preparation time.',
);

const prepCheckpoint = fixed.createCheckpoint();
const restoredPrep = createBattleSimulation(STAGE_BUNDLES.STAGE_01, 0x5100_0001, prepCheckpoint);
equal(restoredPrep.getChecksum(), fixed.getChecksum(), 'Preparation checkpoint round trip.');
equal(restoredPrep.getHudProjection().flowState, 'preparing', 'Restored preparation flow.');
equal(
  restoredPrep.getHudProjection().preparationTicksRemaining,
  remainingBeforeShop,
  'Restored preparation countdown.',
);

command(fixed, 4, { type: 'START_WAVE' });
equal(fixed.getHudProjection().flowState, 'running', 'START_WAVE skips the countdown.');
equal(fixed.getHudProjection().preparationTicksRemaining, 0, 'Skipped countdown is cleared.');
equal(fixed.getRenderSnapshot().entities.length, 0, 'Skipping does not spawn outside a simulation tick.');
assert(
  fixed.advanceTicks(1).events.some((event) => event.type === 'SPAWN'),
  'The first running tick after skip must start the authored wave.',
);
command(fixed, 5, { type: 'START_WAVE' }, 'rejected');

const natural = createBattleSimulation(STAGE_BUNDLES.STAGE_01, 0x5100_0002);
const almostReady = natural.advanceTicks(FIXED_WAVE_PREPARATION_TICKS - 1);
equal(almostReady.ticksAdvanced, FIXED_WAVE_PREPARATION_TICKS - 1, 'Countdown advancement.');
equal(natural.getHudProjection().flowState, 'preparing', 'Countdown remains active at one tick.');
equal(natural.getHudProjection().preparationTicksRemaining, 1, 'One preparation tick remains.');
assert(almostReady.events.every((event) => event.type !== 'SPAWN'), 'No spawn before countdown ends.');
const countdownEnd = natural.advanceTicks(1);
equal(natural.getHudProjection().flowState, 'running', 'Countdown naturally enters running flow.');
equal(countdownEnd.events.length, 0, 'Countdown completion itself has no combat side effects.');
assert(
  natural.advanceTicks(1).events.some((event) => event.type === 'SPAWN'),
  'Natural countdown starts combat on the next simulation tick.',
);

for (const [index, stageId] of BATTLE_STAGE_ORDER.slice(0, 7).entries()) {
  const automatic = createBattleSimulation(STAGE_BUNDLES[stageId], 0x5100_0100 + index);
  automatic.advanceTicks(FIXED_WAVE_PREPARATION_TICKS);
  equal(
    automatic.getHudProjection().flowState,
    'running',
    `${stageId} must enter combat without a player start command.`,
  );
  assert(
    automatic.advanceTicks(1).events.some((event) => event.type === 'SPAWN'),
    `${stageId} must spawn its first group on the tick after automatic preparation.`,
  );
}

const legacyRunningSource = createBattleSimulation(STAGE_BUNDLES.STAGE_01, 0x5100_0003);
command(legacyRunningSource, 1, { type: 'START_WAVE' });
const legacyEnvelope = JSON.parse(
  new TextDecoder().decode(legacyRunningSource.createCheckpoint()),
) as { schemaVersion: number; state: Record<string, unknown> };
equal(legacyEnvelope.schemaVersion, 7, 'Dynamic tower positions use the current V7 checkpoint schema.');
legacyEnvelope.schemaVersion = 6;
delete legacyEnvelope.state.preparationTicksRemaining;
(legacyEnvelope.state.aimAnglesU16 as number[]).pop();
(legacyEnvelope.state.towerCooldowns as number[]).pop();
delete legacyEnvelope.state.towerPositions;
const restoredLegacyRunning = createBattleSimulation(
  STAGE_BUNDLES.STAGE_01,
  0x5100_0003,
  new TextEncoder().encode(JSON.stringify(legacyEnvelope)),
);
equal(
  restoredLegacyRunning.getHudProjection().flowState,
  'running',
  'Older V6 running checkpoints must not be forced back into preparation.',
);
equal(
  restoredLegacyRunning.getHudProjection().preparationTicksRemaining,
  0,
  'Older V6 running checkpoints receive the compatible zero countdown.',
);

const betweenWaves = createBattleSimulation(fastFiveWaveBundle(), 0x5100_0004);
command(betweenWaves, 1, { type: 'START_WAVE' });
let reachedSecondPreparation = false;
for (let tick = 0; tick < 4_000; tick += 1) {
  const output = betweenWaves.advanceTicks(1);
  const hud = betweenWaves.getHudProjection();
  if (hud.flowState === 'preparing' && hud.wavePreviewIndex === 2) {
    reachedSecondPreparation = true;
    equal(hud.preparationTicksRemaining, FIXED_WAVE_PREPARATION_TICKS, 'Inter-wave countdown reset.');
    equal(betweenWaves.getRenderSnapshot().entities.length, 0, 'Inter-wave preparation is combat-empty.');
    const quiet = betweenWaves.advanceTicks(10);
    assert(
      quiet.events.every((event) => event.type !== 'SPAWN' && event.type !== 'HIT'),
      'Inter-wave preparation must remain free of spawn and fire events.',
    );
    break;
  }
  if (output.ticksAdvanced === 0) break;
}
assert(reachedSecondPreparation, 'Clearing a non-final wave must enter the next preparation phase.');

const endless = createBattleSimulation(STAGE_BUNDLES.STAGE_08, 0x5100_0005);
const endlessHud = endless.getHudProjection();
equal(endlessHud.flowState, 'running', 'Stage 08 must still start immediately.');
equal(endlessHud.preparationTicksRemaining, 0, 'Stage 08 has no preparation countdown.');
equal(endlessHud.preparationTicksTotal, 0, 'Stage 08 has no preparation duration contract.');
equal(endlessHud.wavePreviewIndex, 0, 'Stage 08 has no fixed-wave preview index.');
command(endless, 1, { type: 'START_WAVE' }, 'rejected');
equal(endless.advanceTicks(1).ticksAdvanced, 1, 'Stage 08 deterministic scheduler remains active.');

console.log('✓ 七关自动开波、波前布阵、商店返回、存档兼容与无尽隔离通过');
