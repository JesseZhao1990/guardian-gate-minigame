import { createBattleSimulation, type SimulationOutput } from '../src/core/battle-sim';
import { createStage01Bundle } from '../src/core/content';
import type { BattleEvent } from '../src/core/contracts';
import { MiniGameAudio, type MiniGameRuntime } from '../src/platform/wechat';
import { CanvasRenderer, projectBattleWorldPoint } from '../src/render/CanvasRenderer';

interface Assertions {
  equal(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): asserts value;
}

const assert: Assertions = {
  equal(actual: unknown, expected: unknown, message = 'Values differ'): void {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  ok(value: unknown, message = 'Expected a truthy value'): asserts value {
    if (!value) throw new Error(message);
  },
};

function parsedCheckpoint(simulation: ReturnType<typeof createBattleSimulation>): any {
  return JSON.parse(new TextDecoder().decode(simulation.createCheckpoint()));
}

function advanceUntil(
  simulation: ReturnType<typeof createBattleSimulation>,
  predicate: (output: SimulationOutput) => boolean,
  maximumTicks = 180_000,
): { output: SimulationOutput; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  for (let elapsed = 0; elapsed < maximumTicks; elapsed += 1) {
    const output = simulation.advanceTicks(1);
    events.push(...output.events);
    if (predicate(output)) return { output, events };
    if (output.ticksAdvanced === 0) break;
  }
  throw new Error(`Predicate was not reached within ${maximumTicks} ticks.`);
}

const schemaProbe = createBattleSimulation(createStage01Bundle(), 0x51a7e);
assert.equal(parsedCheckpoint(schemaProbe).schemaVersion, 6, 'Current checkpoint schema');

const precisionBundle = createStage01Bundle();
const precisionWave = precisionBundle.waves[0];
const precisionEnemy = precisionBundle.enemies.MON_SWIFT_EEL;
assert.ok(precisionWave && precisionEnemy, 'Precision probe content is missing.');
precisionWave.groups = [{ enemyId: precisionEnemy.id, count: 3, intervalTicks: 1 }];
precisionEnemy.maxHpMilli = 1_000_000;
precisionEnemy.armorBp = 0;
// Keep this mechanic probe anchored to the original 24-damage fixture so
// campaign balance tuning does not change the precision/volley expectations.
precisionBundle.tower.baseDamageMilli = 24_000;
precisionBundle.tower.rangePx = 5_000;
precisionBundle.tower.projectileSpeedPxPerSecond = 100_000;
precisionBundle.tower.critChanceBp = 0;
const precisionSeed = 0x9eec1510;
const precisionSeedSimulation = createBattleSimulation(precisionBundle, precisionSeed);
const precisionCheckpoint = parsedCheckpoint(precisionSeedSimulation);
precisionCheckpoint.state.stats.arrowCountAdd = 1;
const precisionSimulation = createBattleSimulation(
  precisionBundle,
  precisionSeed,
  new TextEncoder().encode(JSON.stringify(precisionCheckpoint)),
);
precisionSimulation.advanceTicks(3);
const precisionTarget = precisionSimulation.getRenderSnapshot().entities.find(
  (entity) => entity.renderKind === 'enemy',
);
assert.ok(precisionTarget, 'Precision probe did not spawn a target.');
const precisionAnchor = precisionBundle.route.towerAnchors[1];
const precisionTurns = Math.atan2(
  precisionTarget.y - precisionAnchor.y,
  precisionTarget.x - precisionAnchor.x,
) / (Math.PI * 2);
const precisionAim = (Math.round(precisionTurns * 65_536) + 65_536) & 0xffff;
assert.equal(precisionSimulation.applyCommand({
  seq: 1,
  type: 'SET_AIM',
  towerId: 1,
  angleU16: precisionAim,
}).commandAcks[0]?.status, 'applied');
const precisionRun = advanceUntil(
  precisionSimulation,
  (output) => output.events.some(
    (event) => event.type === 'HIT' && event.towerId === 1 && event.penetrationIndex === 2,
  ),
  120,
);
const precisionRelease = precisionRun.events.find(
  (event): event is Extract<BattleEvent, { type: 'ATTACK_RELEASE' }> =>
    event.type === 'ATTACK_RELEASE' && event.towerId === 1,
);
assert.ok(precisionRelease, 'Precision probe attack release is missing.');
assert.equal(precisionRelease.arrowCount, 2);
assert.equal(precisionRelease.focused, true);
const precisionHits = precisionRun.events.filter(
  (event): event is Extract<BattleEvent, { type: 'HIT' }> =>
    event.type === 'HIT' && event.towerId === 1,
);
assert.ok(
  precisionHits.some((event) => event.penetrationIndex === 0 && event.damageMilli === 48_600),
  'The lead arrow must retain its precision damage after gaining an extra arrow.',
);
assert.ok(
  precisionHits.some((event) => event.penetrationIndex === 0 && event.damageMilli === 27_000),
  'The additional arrow must retain focused volley damage without duplicating precision damage.',
);
assert.ok(
  precisionHits.some(
    (event) =>
      event.penetrationIndex === 2 &&
      event.damageMilli === 23_814 &&
      event.focused,
  ),
  'The lead arrow must retain both precision penetrations after gaining an extra arrow.',
);

const overdriveBundle = createStage01Bundle();
overdriveBundle.tower.rangePx = 1;
const overdriveSeed = 0x0d51de;
const overdriveSeedSimulation = createBattleSimulation(overdriveBundle, overdriveSeed);
const readyCheckpoint = parsedCheckpoint(overdriveSeedSimulation);
readyCheckpoint.state.overdriveCharge = 100;
const overdriveSimulation = createBattleSimulation(
  overdriveBundle,
  overdriveSeed,
  new TextEncoder().encode(JSON.stringify(readyCheckpoint)),
);
const activation = overdriveSimulation.applyCommand({
  seq: 1,
  type: 'ACTIVATE_OVERDRIVE',
  towerId: 1,
});
assert.equal(activation.commandAcks[0]?.status, 'applied', 'Overdrive activation command');
assert.ok(
  activation.events.some(
    (event) => event.type === 'OVERDRIVE_ACTIVATED' && event.towerId === 1,
  ),
  'Overdrive activation event is missing.',
);
assert.equal(overdriveSimulation.getHudProjection().overdrive.activeTowerId, 1);
assert.equal(overdriveSimulation.getHudProjection().overdrive.charge, 0);
const rejectedActivation = overdriveSimulation.applyCommand({
  seq: 2,
  type: 'ACTIVATE_OVERDRIVE',
  towerId: 2,
});
assert.equal(rejectedActivation.commandAcks[0]?.status, 'rejected');
const duration = overdriveSimulation.getHudProjection().overdrive.durationTicks;
overdriveSimulation.advanceTicks(duration - 1);
assert.equal(overdriveSimulation.getHudProjection().overdrive.remainingTicks, 1);
const overdriveEnd = overdriveSimulation.advanceTicks(1);
assert.ok(overdriveEnd.events.some((event) => event.type === 'OVERDRIVE_ENDED'));
assert.equal(overdriveSimulation.getHudProjection().overdrive.activeTowerId, null);

const legacyGateBundle = createStage01Bundle();
delete legacyGateBundle.rules.gateIntegrity;
legacyGateBundle.rules.maxRevives = 0;
legacyGateBundle.tower.rangePx = 1;
const legacyGateSimulation = createBattleSimulation(legacyGateBundle, 0x1e6ac9);
const legacyBreach = advanceUntil(
  legacyGateSimulation,
  (output) => output.events.some((event) => event.type === 'BREACH'),
);
assert.ok(legacyBreach.events.some((event) => event.type === 'DEFEAT'));
assert.equal(legacyGateSimulation.getHudProjection().gateIntegrityMax, 1);
assert.equal(legacyGateSimulation.getHudProjection().flowState, 'result');
assert.equal(legacyGateSimulation.getHudProjection().outcome, 'defeat');

const gateBundle = createStage01Bundle();
gateBundle.tower.rangePx = 1;
gateBundle.rules.gateIntegrity = 30;
gateBundle.rules.maxRevives = 0;
const gateSimulation = createBattleSimulation(gateBundle, 0x6a7e);
const firstBreachRun = advanceUntil(
  gateSimulation,
  (output) => output.events.some((event) => event.type === 'BREACH'),
);
const firstBreach = firstBreachRun.events.find(
  (event): event is Extract<BattleEvent, { type: 'BREACH' }> => event.type === 'BREACH',
);
assert.ok(firstBreach, 'First breach event is missing.');
assert.ok(firstBreach.gateIntegrityRemaining > 0, 'The first weak leak should not end the run.');
assert.equal(gateSimulation.getHudProjection().flowState, 'running');
const firstBreachSnapshot = gateSimulation.getRenderSnapshot();
const firstBreachHud = structuredClone(gateSimulation.getHudProjection());
const defeatRun = advanceUntil(
  gateSimulation,
  (output) => output.events.some((event) => event.type === 'DEFEAT'),
);
assert.ok(defeatRun.events.some((event) => event.type === 'DEFEAT'));
assert.equal(gateSimulation.getHudProjection().flowState, 'result');
assert.equal(gateSimulation.getHudProjection().outcome, 'defeat');
assert.equal(gateSimulation.getHudProjection().gateIntegrity, 0);
assert.equal(gateSimulation.advanceTicks(1).ticksAdvanced, 0);
const terminalCheckpoint = parsedCheckpoint(gateSimulation);
assert.equal(terminalCheckpoint.state.outcome, 'defeat');

const reviveBundle = createStage01Bundle();
reviveBundle.tower.rangePx = 1;
reviveBundle.rules.gateIntegrity = 18;
reviveBundle.rules.reviveGateRestoreBp = 5_000;
reviveBundle.rules.maxRevives = 1;
const reviveSimulation = createBattleSimulation(reviveBundle, 0x5e71fe);
const reviveRequestRun = advanceUntil(
  reviveSimulation,
  (output) => output.flowRequests.some((request) => request.type === 'REVIVE'),
);
assert.equal(reviveSimulation.getHudProjection().flowState, 'defeat-pending');
assert.equal(reviveSimulation.getHudProjection().gateIntegrity, 0);
assert.ok(reviveRequestRun.output.flowRequests.some((request) => request.type === 'REVIVE'));
const revived = reviveSimulation.applyAuthorityEvent({
  type: 'REVIVE_GRANTED',
  authoritySeq: 1,
  authorizationId: 'combat-rules-smoke-revive',
  reviveOrdinal: 1,
});
const revivedEvent = revived.events.find(
  (event): event is Extract<BattleEvent, { type: 'REVIVED' }> => event.type === 'REVIVED',
);
assert.ok(revivedEvent, 'Revive event is missing.');
assert.equal(revivedEvent.gateIntegrityRemaining, 9);
assert.equal(reviveSimulation.getHudProjection().flowState, 'running');
assert.equal(reviveSimulation.getHudProjection().revivesUsed, 1);
const finalDefeat = advanceUntil(
  reviveSimulation,
  (output) => output.events.some((event) => event.type === 'DEFEAT'),
);
assert.ok(finalDefeat.events.some((event) => event.type === 'DEFEAT'));
assert.equal(reviveSimulation.getHudProjection().flowState, 'result');
assert.equal(reviveSimulation.getHudProjection().outcome, 'defeat');

const gradient = { addColorStop(): void {} };
const renderedTexts: string[] = [];
const drawingContext = new Proxy<Record<string, unknown>>({}, {
  get(_target, property): unknown {
    if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
    if (property === 'fillText' || property === 'strokeText') {
      return (text: string) => { renderedTexts.push(text); };
    }
    if (property === 'createLinearGradient' || property === 'createRadialGradient') {
      return () => gradient;
    }
    return () => undefined;
  },
  set(): boolean {
    return true;
  },
});
const rendererRuntime: MiniGameRuntime = {
  canvas: { createImage: () => ({}) },
  context: drawingContext,
  resize: () => ({
    width: 1_920,
    height: 1_080,
    pixelRatio: 1,
    safeArea: { left: 0, top: 0, right: 1_920, bottom: 1_080, width: 1_920, height: 1_080 },
  }),
  size: () => ({
    width: 1_920,
    height: 1_080,
    pixelRatio: 1,
    safeArea: { left: 0, top: 0, right: 1_920, bottom: 1_080, width: 1_920, height: 1_080 },
  }),
  requestFrame: () => 1,
  cancelFrame: () => undefined,
};
const breachRenderer = new CanvasRenderer(rendererRuntime, gateBundle);
const projectedThirdTower = projectBattleWorldPoint(gateBundle.route.towerAnchors[2]);
assert.equal(
  breachRenderer.hitTestTower(projectedThirdTower),
  2,
  'The visible third tower must remain directly selectable after the world-camera projection.',
);
assert.ok(
  !breachRenderer.isBattleHudPoint(projectedThirdTower),
  'The visible third tower must not sit inside a bottom HUD interaction zone.',
);
breachRenderer.pushEvents(firstBreachRun.output.events, firstBreachSnapshot);
breachRenderer.drawBattle({
  snapshot: firstBreachSnapshot,
  hud: firstBreachHud,
  muted: false,
  selectedTowerId: 0,
  victory: false,
});
assert.ok(
  renderedTexts.some((text) => text.includes(
    `关门受损 -${firstBreach.damage} · ${firstBreach.gateIntegrityRemaining}/${firstBreach.gateIntegrityMax}`,
  )),
  'A breach must show its damage and remaining gate integrity at the visible gate.',
);
renderedTexts.length = 0;
const defeatRenderer = new CanvasRenderer(rendererRuntime, reviveBundle);
defeatRenderer.drawBattle({
  snapshot: reviveSimulation.getRenderSnapshot(),
  hud: reviveSimulation.getHudProjection(),
  muted: false,
  selectedTowerId: 0,
  victory: false,
});
assert.ok(
  renderedTexts.some((text) => text.includes('关门耐久归零')),
  'A fixed defeat must explain that gate integrity reached zero.',
);
assert.ok(
  !renderedTexts.some((text) => text.includes('一名潮军越过了守线')),
  'A fixed defeat must not imply that any single leak always ends the run.',
);
assert.equal(
  defeatRenderer.hitTest({ x: 960, y: 743 }),
  'overlay-retry',
  'Terminal fixed defeat must expose a retry action.',
);
assert.equal(
  defeatRenderer.hitTest({ x: 960, y: 831 }),
  'overlay-exit',
  'Terminal fixed defeat must expose an exit action.',
);

interface MockAudioVoice {
  autoplay: boolean;
  src: string;
  volume: number;
  playbackRate: number;
  play(): void;
  stop(): void;
  destroy(): void;
  onEnded(listener: () => void): void;
  onError(listener: () => void): void;
}
const audioPlays: Array<{ src: string; volume: number; playbackRate: number }> = [];
const audioVoices: MockAudioVoice[] = [];
const haptics: string[] = [];
(globalThis as typeof globalThis & { wx: any }).wx = {
  createInnerAudioContext(): MockAudioVoice {
    const voice: MockAudioVoice = {
      autoplay: false,
      src: '',
      volume: 0,
      playbackRate: 1,
      play(): void {
        audioPlays.push({
          src: voice.src,
          volume: voice.volume,
          playbackRate: voice.playbackRate,
        });
      },
      stop(): void {},
      destroy(): void {},
      onEnded(): void {},
      onError(): void {},
    };
    audioVoices.push(voice);
    return voice;
  },
  vibrateShort(options: { type: string }): void {
    haptics.push(options.type);
  },
};
const feedbackAudio = new MiniGameAudio();
feedbackAudio.start();
feedbackAudio.playEvents([
  precisionRelease,
  { ...precisionRelease, eventId: `${precisionRelease.eventId}:layer-2`, towerId: 0 },
  { ...precisionRelease, eventId: `${precisionRelease.eventId}:layer-3`, towerId: 2 },
]);
assert.equal(audioVoices.length, 2, 'A clustered three-tower release must use two pooled voices.');
assert.equal(audioPlays[0]?.playbackRate, 0.98);
assert.equal(audioPlays[1]?.playbackRate, 1.08);
const defeatEvent = finalDefeat.events.find(
  (event): event is Extract<BattleEvent, { type: 'DEFEAT' }> => event.type === 'DEFEAT',
);
assert.ok(defeatEvent, 'Terminal defeat audio event is missing.');
feedbackAudio.playEvents([defeatEvent]);
assert.equal(audioVoices.length, 3, 'Terminal feedback must acquire its own higher-priority voice.');
assert.ok(audioPlays.at(-1)?.src.endsWith('/STG_DEFEAT.m4a'));
assert.equal(haptics.at(-1), 'heavy');

console.log('✓ smooth precision volley, pooled feedback, gate integrity, terminal defeat UI, one-revive restore, and shared overdrive rules passed');
