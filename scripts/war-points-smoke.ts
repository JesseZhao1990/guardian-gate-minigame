import {
  createBattleSimulation,
  type BattleSimulation,
  type SimulationOutput,
} from '../src/core/battle-sim';
import {
  createStage01Bundle,
  createStage02Bundle,
  createStage08Bundle,
} from '../src/core/content';
import { LEGACY_WARLESS_CONFIG_HASH_BY_STAGE } from '../src/core/content-compat';
import type {
  BattleBundleV1,
  BattleCommand,
  BattleEvent,
  CardEffectId,
  HudProjectionV1,
  OfferGranted,
} from '../src/core/contracts';

interface SmokeAssert {
  equal(actual: unknown, expected: unknown, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): asserts value;
  throws(callback: () => unknown, message?: string): Error;
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
  throws(callback: () => unknown, message?: string): Error {
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

const FAST_SEED = 0x57a7_9001;
const TOWER_CARD_ID = 'CARD_TOWER_REINFORCEMENT';
const MASTERY_CARD_ID = 'CARD_BASIC_CRITICAL_MASTERY_G';
const DAMAGE_CARD_ID = 'CARD_BASIC_DAMAGE_G';
const FREQUENCY_CARD_ID = 'CARD_BASIC_FREQUENCY_G';

function createFastCampaignBundle(): BattleBundleV1 {
  const bundle = createStage01Bundle();
  bundle.route.points = [
    { x: 960, y: 120 },
    { x: 960, y: 1_020 },
  ];
  bundle.route.breachPoint = { x: 960, y: 1_020 };
  bundle.route.towerAnchors = [
    { x: 700, y: 240 },
    { x: 1_220, y: 240 },
    { x: 960, y: 520 },
  ];
  bundle.tower.baseDamageMilli = 1_000_000;
  bundle.tower.attackIntervalTicks = 12;
  bundle.tower.projectileSpeedPxPerSecond = 30_000;
  bundle.tower.rangePx = 5_000;
  bundle.tower.critChanceBp = 0;
  bundle.rules.groupGapTicks = 1;
  bundle.rules.waveGapTicks = 2;

  const fodder = bundle.enemies.MON_TIDE_IMP;
  const blocker = bundle.enemies.MON_DRAGON_TORTOISE;
  if (!fodder || !blocker) throw new Error('Stage 01 smoke fixture enemies are missing.');
  fodder.maxHpMilli = 1;
  fodder.speedPxPerSecond = 30;
  fodder.exp = 120;
  fodder.armorBp = 0;
  blocker.maxHpMilli = 100_000_000_000;
  blocker.speedPxPerSecond = 30;
  blocker.armorBp = 0;

  bundle.waves = [
    {
      id: 'WAR_POINT_SMOKE_WAVE_1',
      index: 1,
      hpMultiplierBp: 10_000,
      expMultiplierBp: 10_000,
      groups: [{ enemyId: fodder.id, count: 1, intervalTicks: 1 }],
    },
    {
      id: 'WAR_POINT_SMOKE_WAVE_2',
      index: 2,
      hpMultiplierBp: 10_000,
      expMultiplierBp: 10_000,
      groups: [{ enemyId: fodder.id, count: 1, intervalTicks: 1 }],
    },
    {
      id: 'WAR_POINT_SMOKE_WAVE_3',
      index: 3,
      hpMultiplierBp: 10_000,
      expMultiplierBp: 10_000,
      groups: [{ enemyId: blocker.id, count: 1, intervalTicks: 1 }],
    },
    {
      id: 'WAR_POINT_SMOKE_WAVE_4',
      index: 4,
      hpMultiplierBp: 10_000,
      expMultiplierBp: 10_000,
      groups: [{ enemyId: blocker.id, count: 1, intervalTicks: 1 }],
    },
    {
      id: 'WAR_POINT_SMOKE_WAVE_5',
      index: 5,
      hpMultiplierBp: 10_000,
      expMultiplierBp: 10_000,
      groups: [{ enemyId: blocker.id, count: 1, intervalTicks: 1 }],
    },
  ];
  return bundle;
}

function applyCommand(
  simulation: BattleSimulation,
  seq: number,
  command: Omit<BattleCommand, 'seq'>,
  expectedStatus: 'applied' | 'duplicate' | 'rejected' = 'applied',
): SimulationOutput {
  const output = simulation.applyCommand({ seq, ...command } as BattleCommand);
  assert.equal(output.commandAcks.length, 1, 'Every command must produce exactly one acknowledgement.');
  assert.equal(output.commandAcks[0]?.status, expectedStatus);
  return output;
}

function offerRequest(output: SimulationOutput): Extract<SimulationOutput['flowRequests'][number], { type: 'OFFER' }> {
  const request = output.flowRequests.find(
    (candidate): candidate is Extract<SimulationOutput['flowRequests'][number], { type: 'OFFER' }> =>
      candidate.type === 'OFFER',
  );
  if (!request) throw new Error('Expected an OFFER flow request.');
  return request;
}

function grantOffer(
  simulation: BattleSimulation,
  ordinal: number,
  authoritySeq = 1,
  cards: [string, string, string] = [DAMAGE_CARD_ID, MASTERY_CARD_ID, FREQUENCY_CARD_ID],
): OfferGranted {
  const offer: OfferGranted = {
    type: 'OFFER_GRANTED',
    authoritySeq,
    authorizationId: `war-points-smoke-grant-${authoritySeq}`,
    offerId: `war-points-smoke-offer-${ordinal}-${authoritySeq}`,
    cards,
  };
  simulation.applyAuthorityEvent(offer);
  return offer;
}

function advanceUntil(
  simulation: BattleSimulation,
  predicate: (hud: HudProjectionV1, events: BattleEvent[]) => boolean,
  maximumTicks = 300,
): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let tick = 0; tick < maximumTicks; tick += 1) {
    const output = simulation.advanceTicks(1);
    events.push(...output.events);
    if (predicate(simulation.getHudProjection(), events)) return events;
    if (output.ticksAdvanced === 0 && simulation.getHudProjection().flowState !== 'running') {
      throw new Error(`War-point fixture stalled in ${simulation.getHudProjection().flowState}.`);
    }
  }
  throw new Error(`War-point fixture did not reach its target within ${maximumTicks} ticks.`);
}

function reachThirdWave(simulation: BattleSimulation): BattleEvent[] {
  return advanceUntil(simulation, (hud) => hud.waveIndex === 3);
}

const initialBundle = createFastCampaignBundle();
const initialSimulation = createBattleSimulation(initialBundle, FAST_SEED);
const initialHud = initialSimulation.getHudProjection();
assert.deepEqual(initialHud.activeTowerIds, [0, 1], 'Fixed campaigns must start with two towers.');
assert.deepEqual(
  initialHud.towerRuntime.map((tower) => [tower.towerId, tower.active]),
  [[0, true], [1, true], [2, false]],
);
assert.equal(initialHud.warPointsBalance, 0);
assert.equal(initialHud.warPointsEarned, 0);
assert.equal(initialHud.shopPurchaseLimitPerWave, 2);
assert.equal(initialHud.shopPurchasesThisWave, 0);

const earlyOpen = applyCommand(initialSimulation, 1, { type: 'OPEN_SHOP' });
const earlyRequest = offerRequest(earlyOpen);
assert.ok(!earlyRequest.eligibleEffectIds.includes('tower-count'), 'Tower card unlocked before two cleared waves.');
assert.equal(initialSimulation.getHudProjection().flowState, 'offer-pending');
const earlyOffer = grantOffer(initialSimulation, earlyRequest.ordinal);
assert.equal(initialSimulation.getHudProjection().activeOffer?.offerId, earlyOffer.offerId);
applyCommand(initialSimulation, 2, { type: 'CLOSE_SHOP' });
assert.equal(initialSimulation.getHudProjection().flowState, 'running');

applyCommand(initialSimulation, 3, { type: 'PAUSE' });
const pausedOpen = applyCommand(initialSimulation, 4, { type: 'OPEN_SHOP' });
assert.equal(pausedOpen.flowRequests.length, 0, 'Reopening a cached offer must not reroll it.');
assert.equal(initialSimulation.getHudProjection().activeOffer?.offerId, earlyOffer.offerId);
applyCommand(initialSimulation, 5, { type: 'CLOSE_SHOP' });
assert.equal(initialSimulation.getHudProjection().flowState, 'paused');

const insufficientBundle = createFastCampaignBundle();
const insufficientSimulation = createBattleSimulation(insufficientBundle, FAST_SEED + 1);
const insufficientRequest = offerRequest(
  applyCommand(insufficientSimulation, 1, { type: 'OPEN_SHOP' }),
);
const insufficientOffer = grantOffer(insufficientSimulation, insufficientRequest.ordinal);
const beforeInsufficient = insufficientSimulation.getChecksum();
assert.throws(
  () => insufficientSimulation.applyAuthorityEvent({
    type: 'CARD_CHOICE_ACCEPTED',
    authoritySeq: 2,
    authorizationId: 'war-points-smoke-insufficient-choice',
    offerId: insufficientOffer.offerId,
    cardId: MASTERY_CARD_ID,
  }),
  'An unaffordable purchase must be rejected.',
);
assert.equal(insufficientSimulation.getChecksum(), beforeInsufficient, 'Rejected purchase mutated simulation state.');
assert.equal(insufficientSimulation.getHudProjection().warPointsBalance, 0);
assert.equal(insufficientSimulation.getHudProjection().flowState, 'offer-pending');

const killBundle = createFastCampaignBundle();
const killSimulation = createBattleSimulation(killBundle, FAST_SEED + 2);
const lethalEvents = advanceUntil(
  killSimulation,
  (_hud, events) => events.some((event) => event.type === 'DEATH'),
);
const firstDeath = lethalEvents.find((event): event is Extract<BattleEvent, { type: 'DEATH' }> =>
  event.type === 'DEATH');
const firstKillAward = lethalEvents.find(
  (event): event is Extract<BattleEvent, { type: 'WAR_POINTS_GAINED' }> =>
    event.type === 'WAR_POINTS_GAINED' && event.source === 'kill',
);
assert.ok(firstDeath, 'The fast fixture must produce a real lethal DEATH event.');
assert.ok(firstKillAward, 'A real lethal kill must grant war points.');
assert.equal(firstKillAward.entityId, firstDeath.entityId);
assert.equal(firstKillAward.amount, 30, 'Kill bounty should use the clamped base enemy EXP formula.');
assert.equal(firstKillAward.balance, 30);
const lethalWarPointTotal = lethalEvents.reduce(
  (sum, event) => sum + (event.type === 'WAR_POINTS_GAINED' ? event.amount : 0),
  0,
);
assert.equal(killSimulation.getHudProjection().warPointsBalance, lethalWarPointTotal);
assert.equal(killSimulation.getHudProjection().warPointsEarned, lethalWarPointTotal);

const skillBundle = createFastCampaignBundle();
const skillSimulation = createBattleSimulation(skillBundle, FAST_SEED + 3);
reachThirdWave(skillSimulation);
const skillBeforeOpen = skillSimulation.getHudProjection();
assert.ok(skillBeforeOpen.warPointsBalance >= (skillBundle.rules.towerBuildCost ?? 0));
const skillRequest = offerRequest(applyCommand(skillSimulation, 1, { type: 'OPEN_SHOP' }));
assert.ok(skillRequest.eligibleEffectIds.includes('tower-count'), 'Tower card must unlock after two waves.');
const skillOffer = grantOffer(
  skillSimulation,
  skillRequest.ordinal,
  1,
  [DAMAGE_CARD_ID, MASTERY_CARD_ID, TOWER_CARD_ID],
);
const masteryCard = skillBundle.cards.find((card) => card.id === MASTERY_CARD_ID);
if (!masteryCard?.warPointCost) throw new Error('Critical mastery smoke card is missing its price.');
const skillBeforePurchase = skillSimulation.getHudProjection();
const skillPurchase = skillSimulation.applyAuthorityEvent({
  type: 'CARD_CHOICE_ACCEPTED',
  authoritySeq: 2,
  authorizationId: 'war-points-smoke-skill-choice',
  offerId: skillOffer.offerId,
  cardId: MASTERY_CARD_ID,
});
const skillAfterPurchase = skillSimulation.getHudProjection();
assert.equal(
  skillAfterPurchase.warPointsBalance,
  skillBeforePurchase.warPointsBalance - masteryCard.warPointCost,
  'Skill purchase must deduct its price exactly once.',
);
assert.equal(skillAfterPurchase.warPointsEarned, skillBeforePurchase.warPointsEarned);
assert.ok(
  skillAfterPurchase.towerStats.current.critChanceBp > skillBeforePurchase.towerStats.current.critChanceBp,
  'Critical mastery must increase critical chance.',
);
assert.ok(
  skillAfterPurchase.towerStats.current.critDamageBp > skillBeforePurchase.towerStats.current.critDamageBp,
  'Critical mastery must increase critical damage.',
);
const purchasedEvent = skillPurchase.events.find(
  (event): event is Extract<BattleEvent, { type: 'CARD_PURCHASED' }> => event.type === 'CARD_PURCHASED',
);
assert.ok(purchasedEvent);
assert.equal(purchasedEvent.cost, masteryCard.warPointCost);
assert.equal(purchasedEvent.balance, skillAfterPurchase.warPointsBalance);
assert.equal(skillAfterPurchase.shopPurchasesThisWave, 1);
assert.equal(skillAfterPurchase.shopPurchasedThisWave, false);
const secondSkillRequest = offerRequest(applyCommand(skillSimulation, 2, { type: 'OPEN_SHOP' }));
const secondSkillOffer = grantOffer(
  skillSimulation,
  secondSkillRequest.ordinal,
  3,
  [DAMAGE_CARD_ID, MASTERY_CARD_ID, FREQUENCY_CARD_ID],
);
skillSimulation.applyAuthorityEvent({
  type: 'CARD_CHOICE_ACCEPTED',
  authoritySeq: 4,
  authorizationId: 'war-points-smoke-second-skill-choice',
  offerId: secondSkillOffer.offerId,
  cardId: DAMAGE_CARD_ID,
});
assert.equal(skillSimulation.getHudProjection().shopPurchasesThisWave, 2);
assert.equal(skillSimulation.getHudProjection().shopPurchasedThisWave, true);
applyCommand(skillSimulation, 3, { type: 'OPEN_SHOP' }, 'rejected');

const towerBundle = createFastCampaignBundle();
const towerSimulation = createBattleSimulation(towerBundle, FAST_SEED + 4);
reachThirdWave(towerSimulation);
const towerRequest = offerRequest(applyCommand(towerSimulation, 1, { type: 'OPEN_SHOP' }));
assert.ok(towerRequest.eligibleEffectIds.includes('tower-count'));
const towerOffer = grantOffer(
  towerSimulation,
  towerRequest.ordinal,
  1,
  [DAMAGE_CARD_ID, MASTERY_CARD_ID, TOWER_CARD_ID],
);
const towerBeforePurchase = towerSimulation.getHudProjection();
const towerPurchase = towerSimulation.applyAuthorityEvent({
  type: 'CARD_CHOICE_ACCEPTED',
  authoritySeq: 2,
  authorizationId: 'war-points-smoke-tower-choice',
  offerId: towerOffer.offerId,
  cardId: TOWER_CARD_ID,
});
const towerAfterPurchase = towerSimulation.getHudProjection();
assert.deepEqual(towerAfterPurchase.activeTowerIds, [0, 1, 2]);
assert.equal(towerAfterPurchase.towerRuntime[2]?.active, true);
assert.equal(
  towerAfterPurchase.warPointsBalance,
  towerBeforePurchase.warPointsBalance - (towerBundle.rules.towerBuildCost ?? 0),
);
const towerUnlocked = towerPurchase.events.find(
  (event): event is Extract<BattleEvent, { type: 'TOWER_UNLOCKED' }> => event.type === 'TOWER_UNLOCKED',
);
assert.ok(towerUnlocked);
assert.equal(towerUnlocked.towerId, 2);
assert.equal(towerUnlocked.activeTowerCount, 3);
const reinforcedAttackEvents = advanceUntil(
  towerSimulation,
  (_hud, events) => events.some(
    (event) => event.type === 'ATTACK_RELEASE' && event.towerId === 2,
  ),
  60,
);
assert.ok(
  reinforcedAttackEvents.some(
    (event) => event.type === 'ATTACK_RELEASE' && event.towerId === 2,
  ),
  'The reinforced third tower must enter the firing loop immediately.',
);

const checkpoint = towerSimulation.createCheckpoint();
const checkpointEnvelope = JSON.parse(new TextDecoder().decode(checkpoint)) as {
  schemaVersion: number;
  state: Record<string, unknown>;
};
assert.equal(checkpointEnvelope.schemaVersion, 6);
const checkpointRestored = createBattleSimulation(towerBundle, FAST_SEED + 4, checkpoint);
assert.equal(checkpointRestored.getChecksum(), towerSimulation.getChecksum());
assert.deepEqual(checkpointRestored.createCheckpoint(), checkpoint);

const legacySource = createBattleSimulation(createStage01Bundle(), FAST_SEED + 5);
const legacyEnvelope = JSON.parse(new TextDecoder().decode(legacySource.createCheckpoint())) as {
  schemaVersion: number;
  configHash: string;
  state: Record<string, unknown>;
};
legacyEnvelope.schemaVersion = 5;
const warPointStateFields = [
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
] as const;
for (const field of warPointStateFields) delete legacyEnvelope.state[field];
const migratedV5 = createBattleSimulation(
  createStage01Bundle(),
  FAST_SEED + 5,
  new TextEncoder().encode(JSON.stringify(legacyEnvelope)),
);
assert.equal(migratedV5.getHudProjection().warPointsBalance, 0);
assert.equal(migratedV5.getHudProjection().warPointsEarned, 0);
assert.deepEqual(
  migratedV5.getHudProjection().activeTowerIds,
  [0, 1, 2],
  'Legacy V5 runs must preserve their previously active third tower.',
);
const shippedV5Envelope = structuredClone(legacyEnvelope);
const shippedStage01Hash = LEGACY_WARLESS_CONFIG_HASH_BY_STAGE.STAGE_01;
if (!shippedStage01Hash) throw new Error('Stage 01 must declare its shipped V5 compatibility hash.');
shippedV5Envelope.configHash = shippedStage01Hash;
const migratedShippedV5 = createBattleSimulation(
  createStage01Bundle(),
  FAST_SEED + 5,
  new TextEncoder().encode(JSON.stringify(shippedV5Envelope)),
);
assert.deepEqual(migratedShippedV5.getHudProjection().activeTowerIds, [0, 1, 2]);

const liveLegacyBundle = createStage02Bundle();
const liveLegacyHash = LEGACY_WARLESS_CONFIG_HASH_BY_STAGE.STAGE_02;
if (!liveLegacyHash) throw new Error('Stage 02 must declare its shipped V5 compatibility hash.');
liveLegacyBundle.configHash = liveLegacyHash;
liveLegacyBundle.tower.baseDamageMilli = 100_000_000;
liveLegacyBundle.tower.projectileSpeedPxPerSecond = 100_000;
const liveLegacyFinalWave = liveLegacyBundle.waves[4];
if (!liveLegacyFinalWave) throw new Error('Stage 02 final wave fixture is missing.');
liveLegacyFinalWave.hpMultiplierBp = 46_000;
liveLegacyFinalWave.speedMultiplierBp = 14_000;
const liveLegacySimulation = createBattleSimulation(liveLegacyBundle, FAST_SEED + 6);
for (let tick = 0; tick < 10_000; tick += 1) {
  liveLegacySimulation.advanceTicks(1);
  if (liveLegacySimulation.getHudProjection().waveIndex === 5) break;
}
assert.equal(liveLegacySimulation.getHudProjection().waveIndex, 5);
liveLegacyBundle.tower.rangePx = 1;
let liveLegacyEnvelope: any;
for (let tick = 0; tick < 1_000; tick += 1) {
  liveLegacySimulation.advanceTicks(1);
  const candidate = JSON.parse(
    new TextDecoder().decode(liveLegacySimulation.createCheckpoint()),
  ) as any;
  if (candidate.state.enemies.length > 0) {
    liveLegacyEnvelope = candidate;
    break;
  }
}
assert.ok(liveLegacyEnvelope, 'Stage 02 V5 fixture must contain an active final-wave enemy.');
liveLegacyEnvelope.schemaVersion = 5;
liveLegacyEnvelope.configHash = liveLegacyHash;
for (const field of warPointStateFields) delete liveLegacyEnvelope.state[field];
const liveLegacyEnemy = liveLegacyEnvelope.state.enemies[0];
liveLegacyEnemy.hpMilli = Math.max(1, Math.floor(liveLegacyEnemy.maxHpMilli * 0.37));
const oldLiveHp = liveLegacyEnemy.hpMilli;
const oldLiveMaxHp = liveLegacyEnemy.maxHpMilli;
assert.equal(liveLegacyEnemy.speedMultiplierBp, 14_000);
const migratedLiveV5 = createBattleSimulation(
  createStage02Bundle(),
  FAST_SEED + 6,
  new TextEncoder().encode(JSON.stringify(liveLegacyEnvelope)),
);
const migratedLiveEnvelope = JSON.parse(
  new TextDecoder().decode(migratedLiveV5.createCheckpoint()),
) as any;
const migratedLiveEnemy = migratedLiveEnvelope.state.enemies[0];
const currentStage02 = createStage02Bundle();
const currentFinalWave = currentStage02.waves[4];
const currentDefinition = currentStage02.enemies[liveLegacyEnemy.definitionId];
if (!currentFinalWave || !currentDefinition) {
  throw new Error('Current Stage 02 final-wave migration content is missing.');
}
const expectedMigratedMaxHp = Math.floor(
  (currentDefinition.maxHpMilli * currentFinalWave.hpMultiplierBp + 5_000) / 10_000,
);
const expectedMigratedHp = Math.max(
  1,
  Number(
    (BigInt(oldLiveHp) * BigInt(expectedMigratedMaxHp) +
      BigInt(Math.floor(oldLiveMaxHp / 2))) /
      BigInt(oldLiveMaxHp),
  ),
);
assert.equal(migratedLiveEnemy.maxHpMilli, expectedMigratedMaxHp);
assert.equal(migratedLiveEnemy.hpMilli, expectedMigratedHp);
assert.equal(
  migratedLiveEnemy.expAward,
  Math.max(1, Math.floor((currentDefinition.exp * currentFinalWave.expMultiplierBp) / 10_000)),
);
assert.equal(migratedLiveEnemy.speedMultiplierBp, 13_000);

assert.ok(
  liveLegacyEnemy.ageTicks > 0 && liveLegacyEnemy.distanceMilli > 0,
  'Stage 02 active-enemy fixture must have moved before legacy validation checks.',
);
const assertLegacyEnemyMutationRejected = (
  mutate: (enemy: Record<string, any>) => void,
  message: string,
): void => {
  const tamperedEnvelope = structuredClone(liveLegacyEnvelope);
  const tamperedEnemy = tamperedEnvelope.state.enemies[0] as Record<string, any> | undefined;
  if (!tamperedEnemy) throw new Error('Tampered Stage 02 legacy fixture enemy is missing.');
  mutate(tamperedEnemy);
  assert.throws(
    () => createBattleSimulation(
      createStage02Bundle(),
      FAST_SEED + 6,
      new TextEncoder().encode(JSON.stringify(tamperedEnvelope)),
    ),
    message,
  );
};
assertLegacyEnemyMutationRejected(
  (enemy) => { enemy.maxHpMilli += 1; },
  'Legacy V5 migration must reject a forged enemy max HP.',
);
assertLegacyEnemyMutationRejected(
  (enemy) => { enemy.expAward += 1; },
  'Legacy V5 migration must reject a forged enemy EXP award.',
);
assertLegacyEnemyMutationRejected(
  (enemy) => { enemy.speedMultiplierBp += 1; },
  'Legacy V5 migration must reject a forged enemy speed multiplier.',
);
assertLegacyEnemyMutationRejected(
  (enemy) => { enemy.distanceMilli = 0; },
  'Legacy V5 migration must reject an enemy behind its old-speed travel bound.',
);

const endlessSimulation = createBattleSimulation(createStage08Bundle(), FAST_SEED + 7);
const endlessHud = endlessSimulation.getHudProjection();
assert.deepEqual(endlessHud.activeTowerIds, [0, 1, 2]);
assert.equal(endlessHud.shopAvailable, false);
applyCommand(endlessSimulation, 1, { type: 'OPEN_SHOP' }, 'rejected');
assert.equal(endlessSimulation.getHudProjection().flowState, 'running');

const fixedSkillEffects: CardEffectId[] = skillRequest.eligibleEffectIds.filter(
  (effectId) => effectId !== 'tower-count',
);
assert.ok(fixedSkillEffects.length >= 3, 'Fixed campaign shop must retain at least three skill effects.');

console.log('✓ 战功击杀、商店暂停恢复、原子购买、第三塔解锁、V6/V5 checkpoint 与无尽隔离通过');
