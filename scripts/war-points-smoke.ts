import {
  createBattleSimulation,
  type BattleSimulation,
  type SimulationOutput,
} from '../src/core/battle-sim';
import {
  createStage01Bundle,
  createStage08Bundle,
} from '../src/core/content';
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

type BattleCommandWithoutSeq = BattleCommand extends infer Candidate
  ? Candidate extends { seq: number }
    ? Omit<Candidate, 'seq'>
    : never
  : never;

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
    { x: 700, y: 800 },
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
  command: BattleCommandWithoutSeq,
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
  maximumTicks = 2_000,
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

function startPreparedWave(simulation: BattleSimulation, seq: number): number {
  if (simulation.getHudProjection().flowState !== 'preparing') return seq;
  applyCommand(simulation, seq, { type: 'START_WAVE' });
  return seq + 1;
}

function reachThirdWave(simulation: BattleSimulation, firstSeq = 1): number {
  let nextSeq = firstSeq;
  for (let tick = 0; tick < 2_000; tick += 1) {
    const hud = simulation.getHudProjection();
    if (hud.waveIndex === 3) return nextSeq;
    if (hud.flowState === 'preparing') {
      nextSeq = startPreparedWave(simulation, nextSeq);
      continue;
    }
    if (hud.flowState !== 'running') {
      throw new Error(`War-point fixture stalled in ${hud.flowState}.`);
    }
    simulation.advanceTicks(1);
  }
  throw new Error('War-point fixture did not reach wave three.');
}

const initialBundle = createFastCampaignBundle();
const initialSimulation = createBattleSimulation(initialBundle, FAST_SEED);
const initialHud = initialSimulation.getHudProjection();
assert.deepEqual(initialHud.activeTowerIds, [0, 1], 'Fixed campaigns must start with two towers.');
assert.equal(initialHud.aimAnglesU16.length, 4);
assert.equal(initialHud.towerPositions.length, 4);
assert.deepEqual(
  initialHud.towerRuntime.map((tower) => [tower.towerId, tower.active]),
  [[0, true], [1, true], [2, false], [3, false]],
);
assert.equal(initialHud.warPointsBalance, 0);
assert.equal(initialHud.warPointsEarned, 0);
assert.equal(initialHud.shopPurchaseLimitPerWave, 2);
assert.equal(initialHud.shopPurchasesThisWave, 0);
assert.equal(initialHud.shopOfferOrdinal, 0);
assert.equal(initialHud.shopOffer, undefined);
assert.equal(initialHud.shopOfferPreviews, undefined);

const earlyOpen = applyCommand(initialSimulation, 1, { type: 'OPEN_SHOP' });
assert.equal(
  initialSimulation.getHudProjection().warPointsBalance,
  initialHud.warPointsBalance,
  'Opening shortcuts must never charge war points directly.',
);
const earlyRequest = offerRequest(earlyOpen);
assert.ok(!earlyRequest.eligibleEffectIds.includes('tower-count'));
assert.equal(initialSimulation.getHudProjection().flowState, 'offer-pending');
const earlyOffer = grantOffer(initialSimulation, earlyRequest.ordinal);
const earlyPendingHud = initialSimulation.getHudProjection();
assert.equal(earlyPendingHud.activeOffer?.offerId, earlyOffer.offerId);
assert.equal(earlyPendingHud.shopOffer?.offerId, earlyOffer.offerId);
assert.equal(earlyPendingHud.shopOfferOrdinal, earlyRequest.ordinal);
assert.equal(earlyPendingHud.shopOfferPreviews?.length, 3);
assert.ok(
  earlyPendingHud.shopOfferPreviews?.every((preview) => preview.warPointCost > 0),
  'All three fixed shortcut slots must be priced skills.',
);
assert.ok(
  earlyPendingHud.shopOffer?.cards.every((cardId) =>
    initialBundle.cards.find((card) => card.id === cardId)?.effectId !== 'tower-count'),
  'The shortcut quote must not contain the legacy tower-count card.',
);
assert.deepEqual(
  earlyPendingHud.shopOfferPreviews?.map((preview) => preview.warPointCost),
  earlyPendingHud.offerPreviews?.map((preview) => preview.warPointCost),
  'Shortcut prices must use the same authoritative projection as the purchase overlay.',
);
applyCommand(initialSimulation, 2, { type: 'CLOSE_SHOP' });
const earlyClosedHud = initialSimulation.getHudProjection();
assert.equal(earlyClosedHud.flowState, 'preparing');
assert.equal(
  earlyClosedHud.warPointsBalance,
  initialHud.warPointsBalance,
  'Closing an unpurchased shortcut quote must not charge war points.',
);
assert.equal(earlyClosedHud.activeOffer, undefined, 'Closed shop must not expose an active modal offer.');
assert.equal(earlyClosedHud.offerPreviews, undefined, 'Closed shop must not expose modal-only previews.');
assert.equal(earlyClosedHud.shopOffer?.offerId, earlyOffer.offerId);
assert.equal(earlyClosedHud.shopOfferPreviews?.length, 3);
const earlyClosedCheckpoint = initialSimulation.createCheckpoint();
const earlyClosedRestored = createBattleSimulation(initialBundle, FAST_SEED, earlyClosedCheckpoint);
assert.deepEqual(
  earlyClosedRestored.getHudProjection().shopOffer,
  earlyClosedHud.shopOffer,
  'Restoring a closed shop must preserve its fixed quote without generating a new one.',
);
assert.deepEqual(
  earlyClosedRestored.getHudProjection().shopOfferPreviews,
  earlyClosedHud.shopOfferPreviews,
  'Restoring a closed shop must preserve authoritative shortcut prices and previews.',
);

applyCommand(initialSimulation, 3, { type: 'START_WAVE' });
applyCommand(initialSimulation, 4, { type: 'PAUSE' });
const pausedOpen = applyCommand(initialSimulation, 5, { type: 'OPEN_SHOP' });
assert.equal(pausedOpen.flowRequests.length, 0, 'Reopening a cached offer must not reroll it.');
assert.equal(initialSimulation.getHudProjection().activeOffer?.offerId, earlyOffer.offerId);
applyCommand(initialSimulation, 6, { type: 'CLOSE_SHOP' });
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
applyCommand(killSimulation, 1, { type: 'START_WAVE' });
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
assert.equal(
  lethalEvents.filter((event) => event.type === 'WAR_POINTS_GAINED' && event.source === 'kill').length,
  lethalEvents.filter((event) => event.type === 'DEATH').length,
  'Kill war points must originate one-for-one from real lethal deaths.',
);

const bonusBundle = createFastCampaignBundle();
bonusBundle.route.towerAnchors[0] = { x: 700, y: 120 };
bonusBundle.route.towerAnchors[1] = { x: 1_220, y: 120 };
bonusBundle.waves[0]!.groups = [{
  enemyId: 'MON_TIDE_IMP',
  count: 3,
  intervalTicks: 15,
}];
const bonusSimulation = createBattleSimulation(bonusBundle, FAST_SEED + 20);
applyCommand(bonusSimulation, 1, { type: 'SET_AIM', towerId: 0, angleU16: 0 });
applyCommand(bonusSimulation, 2, { type: 'SET_AIM', towerId: 1, angleU16: 32_768 });
applyCommand(bonusSimulation, 3, { type: 'START_WAVE' });
const bonusEvents = advanceUntil(
  bonusSimulation,
  (hud) => hud.waveIndex === 2 && hud.flowState === 'preparing',
);
const focusedBonus = bonusEvents.find(
  (event): event is Extract<BattleEvent, { type: 'WAR_POINTS_GAINED' }> =>
    event.type === 'WAR_POINTS_GAINED' && event.source === 'focused-kills',
);
const waveClearBonus = bonusEvents.find(
  (event): event is Extract<BattleEvent, { type: 'WAR_POINTS_GAINED' }> =>
    event.type === 'WAR_POINTS_GAINED' && event.source === 'wave-clear',
);
assert.ok(focusedBonus, 'Three focused kills must grant the focused-kill bonus.');
assert.equal(focusedBonus.amount, 1);
assert.ok(waveClearBonus, 'A no-breach wave clear must grant its completion bonus.');
assert.equal(waveClearBonus.amount, 4);

const skillBundle = createFastCampaignBundle();
const skillSimulation = createBattleSimulation(skillBundle, FAST_SEED + 3);
const nextSkillCommandSeq = reachThirdWave(skillSimulation);
const skillBeforeOpen = skillSimulation.getHudProjection();
assert.equal(skillBeforeOpen.flowState, 'preparing');
assert.ok(skillBeforeOpen.warPointsBalance >= 32, 'Two cleared waves must fund two basic skill purchases.');
const skillRequest = offerRequest(
  applyCommand(skillSimulation, nextSkillCommandSeq, { type: 'OPEN_SHOP' }),
);
assert.ok(
  !skillRequest.eligibleEffectIds.includes('tower-count'),
  'Tower construction must remain outside all three skill shortcuts after wave two.',
);
const skillOffer = grantOffer(
  skillSimulation,
  skillRequest.ordinal,
  1,
  [DAMAGE_CARD_ID, MASTERY_CARD_ID, FREQUENCY_CARD_ID],
);
assert.deepEqual(
  skillSimulation.getHudProjection().shopOffer?.cards,
  [DAMAGE_CARD_ID, MASTERY_CARD_ID, FREQUENCY_CARD_ID],
  'All three shortcut slots must remain priced skills.',
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
assert.equal(skillAfterPurchase.shopOffer, undefined, 'A purchased quote must leave the shortcut cache.');
const secondSkillRequest = offerRequest(
  applyCommand(skillSimulation, nextSkillCommandSeq + 1, { type: 'OPEN_SHOP' }),
);
assert.ok(!secondSkillRequest.eligibleEffectIds.includes('tower-count'));
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
assert.equal(skillSimulation.getHudProjection().shopOffer, undefined);
assert.equal(skillSimulation.getHudProjection().shopOfferPreviews, undefined);
applyCommand(skillSimulation, nextSkillCommandSeq + 2, { type: 'OPEN_SHOP' }, 'rejected');

const checkpoint = skillSimulation.createCheckpoint();
const checkpointEnvelope = JSON.parse(new TextDecoder().decode(checkpoint)) as {
  schemaVersion: number;
  state: Record<string, unknown>;
};
assert.equal(checkpointEnvelope.schemaVersion, 7);
const checkpointRestored = createBattleSimulation(skillBundle, FAST_SEED + 3, checkpoint);
assert.equal(checkpointRestored.getChecksum(), skillSimulation.getChecksum());
assert.deepEqual(checkpointRestored.createCheckpoint(), checkpoint);

const legacySource = createBattleSimulation(createStage01Bundle(), FAST_SEED + 5);
const legacyEnvelope = JSON.parse(new TextDecoder().decode(legacySource.createCheckpoint())) as {
  schemaVersion: number;
  state: Record<string, any>;
};
legacyEnvelope.schemaVersion = 5;
legacyEnvelope.state.flowState = 'running';
legacyEnvelope.state.scheduler.nextSpawnTick = 0;
legacyEnvelope.state.aimAnglesU16.pop();
legacyEnvelope.state.towerCooldowns.pop();
delete legacyEnvelope.state.towerPositions;
const warPointStateFields = [
  'preparationTicksRemaining',
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
assert.equal(migratedV5.getHudProjection().aimAnglesU16.length, 4);
assert.equal(migratedV5.getHudProjection().towerPositions.length, 4);
assert.equal(
  (JSON.parse(new TextDecoder().decode(migratedV5.createCheckpoint())) as { schemaVersion: number })
    .schemaVersion,
  7,
);

const endlessSimulation = createBattleSimulation(createStage08Bundle(), FAST_SEED + 7);
const endlessHud = endlessSimulation.getHudProjection();
assert.deepEqual(endlessHud.activeTowerIds, [0, 1, 2]);
assert.equal(endlessHud.aimAnglesU16.length, 3);
assert.equal(endlessHud.towerPositions.length, 3);
assert.equal(endlessHud.towerBuild.nextTowerId, null);
assert.equal(endlessHud.warPointsBalance, 0);
assert.equal(endlessHud.warPointsEarned, 0);
assert.equal(endlessHud.shopAvailable, false);
assert.equal(endlessHud.shopOfferOrdinal, 0);
assert.equal(endlessHud.shopOffer, undefined, 'Stage 08 must not project fixed-shop shortcuts.');
assert.equal(endlessHud.shopOfferPreviews, undefined, 'Stage 08 must not project shortcut prices.');
applyCommand(endlessSimulation, 1, { type: 'OPEN_SHOP' }, 'rejected');
assert.equal(endlessSimulation.getHudProjection().flowState, 'running');

const fixedSkillEffects: CardEffectId[] = skillRequest.eligibleEffectIds.filter(
  (effectId) => effectId !== 'tower-count',
);
assert.ok(fixedSkillEffects.length >= 3, 'Fixed campaign shop must retain at least three skill effects.');

console.log('✓ 战功来源、三技能快捷位、每波两次购买、V7/V5 checkpoint 与无尽隔离通过');
