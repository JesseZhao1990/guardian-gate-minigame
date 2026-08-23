import { createHash } from 'node:crypto';
import {
  createBattleSimulation,
  type BattleSimulation,
  type SimulationOutput,
} from '../src/core/battle-sim';
import { resolveStageBundleForSeed } from '../src/core/content';
import {
  TICKS_PER_SECOND,
  type BattleBundleV1,
  type BattleCommand,
  type BattleStageId,
  type CardDefinition,
  type CardEffectId,
  type EffectiveTowerStatsV1,
  type HudProjectionV1,
  type OfferGranted,
  type RenderEntityV1,
  type TowerId,
} from '../src/core/contracts';
import { LocalPracticeAuthority } from '../src/core/local-authority';
import {
  createDefaultTowerBuildZones,
  findNearestValidTowerPlacement,
} from '../src/core/tower-placement';

interface SmokeAssert {
  equal(actual: unknown, expected: unknown, message?: string): void;
  ok(value: unknown, message?: string): asserts value;
}

const assert: SmokeAssert = {
  equal(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${String(expected)}, received ${String(actual)}`);
    }
  },
  ok(value: unknown, message?: string): asserts value {
    if (!value) throw new Error(message ?? `Expected a truthy value, received ${String(value)}`);
  },
};

const CAMPAIGN_STAGE_IDS = [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
] as const satisfies readonly BattleStageId[];

const CARD_EFFECT_IDS = [
  'tower-damage',
  'tower-frequency',
  'arrow-count',
  'penetration',
  'crit-rate',
  'crit-damage',
  'critical-mastery',
  'tower-count',
] as const satisfies readonly CardEffectId[];

const CARD_QUALITIES = ['G', 'B', 'P'] as const satisfies readonly CardDefinition['quality'][];
const SEED_COUNT = 64;
const SEED_MULTIPLIER = 0x9e37_79b1;
const SEED_CORPUS_HASH = '4d3f95bc53db958f05825f2829d0247425ea8a98b24bcff4594e0c46920f7dda';
const SIMULATION_CHUNK_TICKS = 900;
const SIMULATION_TICK_BUDGET = 180_000;
const KILL_BURST_WINDOW_TICKS = 3 * TICKS_PER_SECOND;
const SKILLED_TACTIC_INTERVAL_TICKS = 3 * TICKS_PER_SECOND;
const MEDIUM_TACTIC_INTERVAL_TICKS = 6 * TICKS_PER_SECOND;
const U16_TURN = 65_536;
const TOWER_IDS = [0, 1, 2, 3] as const satisfies readonly TowerId[];
const MAX_ADJACENT_CLEAR_RATE_REVERSAL_BP = 500;
const MAX_WAVE_TWO_FAILURE_RATE_BP = 500;
const MIN_LATE_FAILURE_SHARE_BP = 7_000;
const MAX_ACTIVE_STRATEGY_CLEAR_RATE_SPREAD_BP = 1_500;
const MIN_BUILD_TRAJECTORY_DISTANCE_BP = 500;
const MIN_REVIVE_RESCUE_HEADROOM = 8;
const MIN_REVIVE_UPLIFT_BP = 1_000;
const MAX_REVIVE_UPLIFT_BP = 2_000;
const HOLDOUT_SEED_COUNT = 64;
const HOLDOUT_SEED_MULTIPLIER = 0x85eb_ca6b;
const HOLDOUT_SEED_SALT = 0xc2b2_ae35;
const HOLDOUT_SEED_CORPUS_HASH =
  '1c3e3ba8a9b36c1e089100413dcc345630ad44be962942b97c221e1582797566';

type StrategyId =
  | 'first-card'
  | 'medium-human'
  | 'single-target'
  | 'volley-penetration'
  | 'greedy-throughput';
type RevivePolicyId = 'never' | 'once';
type OperationSkill = 'none' | 'medium' | 'skilled';

interface Strategy {
  id: StrategyId;
  tiers?: readonly (readonly CardEffectId[])[];
  operationSkill: OperationSkill;
  tacticIntervalTicks?: number;
  useOverdrive?: boolean;
}

const STRATEGIES: readonly Strategy[] = [
  { id: 'first-card', operationSkill: 'none' },
  {
    id: 'medium-human',
    operationSkill: 'medium',
    tacticIntervalTicks: MEDIUM_TACTIC_INTERVAL_TICKS,
    useOverdrive: true,
  },
  {
    id: 'single-target',
    operationSkill: 'skilled',
    tacticIntervalTicks: SKILLED_TACTIC_INTERVAL_TICKS,
    useOverdrive: true,
    tiers: [
      ['tower-damage'],
      ['tower-frequency'],
      ['critical-mastery'],
      ['arrow-count'],
      ['penetration'],
    ],
  },
  {
    id: 'volley-penetration',
    operationSkill: 'skilled',
    tacticIntervalTicks: SKILLED_TACTIC_INTERVAL_TICKS,
    useOverdrive: true,
    tiers: [
      ['arrow-count'],
      ['penetration'],
      ['tower-frequency'],
      ['tower-damage'],
      ['critical-mastery'],
    ],
  },
  {
    id: 'greedy-throughput',
    operationSkill: 'skilled',
    tacticIntervalTicks: SKILLED_TACTIC_INTERVAL_TICKS,
    useOverdrive: true,
  },
];

const REVIVE_POLICIES = [
  { id: 'never', limit: 0 },
  { id: 'once', limit: 1 },
] as const satisfies ReadonlyArray<{ id: RevivePolicyId; limit: number }>;

interface RunEventMetrics {
  aliveEntityIds: Set<number>;
  peakAlive: number;
  firstSpawnTick?: number;
  firstAttackTick?: number;
  minimumStatCardWarPointCost: number;
  firstAffordableTick?: number;
  firstPurchaseTick?: number;
  hitTicks: number[];
  killTicks: number[];
  attackReleases: number;
  focusedAttackReleases: number;
  arrowsReleased: number;
  hits: number;
  focusedHits: number;
  lethalHits: number;
  mitigatedHits: number;
  kills: number;
  criticalHits: number;
  penetrationHits: number;
  damageMilli: number;
  breaches: number;
  breachDamage: number;
  aimCommandsApplied: number;
  overdriveCommandsApplied: number;
  overdriveReadyEvents: number;
  overdriveActivatedEvents: number;
  overdriveEndedEvents: number;
  overdriveActivationsByTower: [number, number, number, number];
  warPointsGained: number;
  warPointsSpent: number;
  cardPurchases: number;
  towerUnlocks: number;
  shopOpenCommandsApplied: number;
  shopCloseCommandsApplied: number;
}

interface Harness {
  bundle: BattleBundleV1;
  simulation: BattleSimulation;
  authority: LocalPracticeAuthority;
  metrics: RunEventMetrics;
  rerollsUsed: number;
  revivesGranted: number;
  choicesByEffect: Record<CardEffectId, number>;
  choicesByQuality: Record<CardDefinition['quality'], number>;
  shopOffersByWave: Map<number, OfferGranted[]>;
  shopPurchasesByWave: Map<number, number>;
  shopClosedWithoutPurchase: number;
  closedShopOfferIds: Set<string>;
  cachedShopReopens: number;
  towerUnlockWave: number | null;
  towerBuildWaves: number[];
  nextCommandSeq: number;
  nextTacticTick: number;
}

interface RunResult {
  seed: number;
  clear: boolean;
  noReviveClear: boolean;
  terminalTick: number;
  failureWave: number | null;
  progressBp: number;
  revivesUsed: number;
  rerollsUsed: number;
  finalLevel: number;
  choicesByEffect: Record<CardEffectId, number>;
  choicesByQuality: Record<CardDefinition['quality'], number>;
  warPointsEarned: number;
  warPointsSpent: number;
  warPointsBalance: number;
  minimumStatCardWarPointCost: number;
  firstAffordableTick: number | null;
  firstPurchaseTick: number | null;
  shopOffers: number;
  shopPurchases: number;
  shopClosuresWithoutPurchase: number;
  cachedShopReopens: number;
  towerPurchases: number;
  towerUnlockWave: number | null;
  towerBuildWaves: number[];
  activeTowerCount: number;
  attackReleases: number;
  focusedAttackReleases: number;
  arrowsReleased: number;
  hits: number;
  focusedHits: number;
  lethalHits: number;
  mitigatedHits: number;
  kills: number;
  criticalHits: number;
  penetrationHits: number;
  damageMilli: number;
  breaches: number;
  breachDamage: number;
  gateIntegrityRemaining: number;
  gateIntegrityMax: number;
  aimCommandsApplied: number;
  overdriveCommandsApplied: number;
  overdriveReadyEvents: number;
  overdriveActivatedEvents: number;
  overdriveEndedEvents: number;
  overdriveActivationsByTower: [number, number, number, number];
  peakAlive: number;
  killBurst3s: number;
  quietGapP95Ticks: number;
  maxQuietGapTicks: number;
  activeDurationTicks: number;
}

interface Distribution {
  count: number;
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
}

function emptyEffectCounts(): Record<CardEffectId, number> {
  return {
    'tower-damage': 0,
    'tower-frequency': 0,
    'arrow-count': 0,
    penetration: 0,
    'crit-rate': 0,
    'crit-damage': 0,
    'critical-mastery': 0,
    'tower-count': 0,
  };
}

function emptyQualityCounts(): Record<CardDefinition['quality'], number> {
  return { G: 0, B: 0, P: 0 };
}

function buildSeedCorpus(): number[] {
  return Array.from(
    { length: SEED_COUNT },
    (_, index) => Math.imul(index + 1, SEED_MULTIPLIER) >>> 0,
  );
}

function buildHoldoutSeedCorpus(): number[] {
  return Array.from(
    { length: HOLDOUT_SEED_COUNT },
    (_, index) => (
      Math.imul(index + 1, HOLDOUT_SEED_MULTIPLIER) + HOLDOUT_SEED_SALT
    ) >>> 0,
  );
}

function cardDefinition(bundle: BattleBundleV1, cardId: string): CardDefinition {
  const card = bundle.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}.`);
  return card;
}

function throughputScore(stats: EffectiveTowerStatsV1): number {
  const expectedArrowDamage =
    (stats.damagePerArrowMilli * (10_000 - stats.critChanceBp) +
      stats.criticalDamagePerArrowMilli * stats.critChanceBp) /
    10_000;
  let penetrationFactor = 1;
  let retainedDamage = 1;
  for (let index = 0; index < stats.penetrationCount; index += 1) {
    retainedDamage *= stats.penetrationRetentionBp / 10_000;
    penetrationFactor += retainedDamage;
  }
  return (expectedArrowDamage * stats.arrowCount * penetrationFactor) /
    Math.max(1, stats.attackIntervalTicks);
}

function chooseAffordableShopCard(
  bundle: BattleBundleV1,
  hud: HudProjectionV1,
  offer: OfferGranted,
  strategy: Strategy,
): string | undefined {
  const previews = new Map(
    (hud.offerPreviews ?? hud.shopOfferPreviews ?? []).map(
      (preview) => [preview.cardId, preview],
    ),
  );
  assert.equal(previews.size, offer.cards.length, `Offer ${offer.offerId} lacks projections.`);

  const activeTowerCount = hud.activeTowerIds.length;
  const ranked = offer.cards
    .map((cardId) => {
      const card = cardDefinition(bundle, cardId);
      const preview = previews.get(cardId);
      if (
        card.effectId === 'tower-count' ||
        preview === undefined ||
        preview.warPointCost > hud.warPointsBalance
      ) {
        return undefined;
      }
      const projectedGain = Math.max(
        0,
        (throughputScore(preview.after) - throughputScore(preview.before)) * activeTowerCount,
      );
      return {
        cardId,
        cost: preview.warPointCost,
        projectedGain,
        gainPerWarPoint: projectedGain / preview.warPointCost,
        tierIndex: strategy.tiers === undefined
          ? 0
          : (() => {
            const index = strategy.tiers.findIndex((tier) => tier.includes(card.effectId));
            return index < 0 ? strategy.tiers.length : index;
          })(),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== undefined && candidate.projectedGain > 0
    )
    .sort((left, right) =>
      left.tierIndex - right.tierIndex ||
      right.gainPerWarPoint - left.gainPerWarPoint ||
      right.projectedGain - left.projectedGain ||
      left.cost - right.cost ||
      left.cardId.localeCompare(right.cardId)
    );
  return ranked[0]?.cardId;
}

function createHarness(bundle: BattleBundleV1, seed: number): Harness {
  assert.equal(bundle.mode ?? 'fixed', 'fixed', 'Campaign balance smoke only accepts fixed stages.');
  return {
    bundle,
    simulation: createBattleSimulation(bundle, seed),
    authority: new LocalPracticeAuthority(bundle, seed),
    metrics: {
      aliveEntityIds: new Set<number>(),
      peakAlive: 0,
      minimumStatCardWarPointCost: minimumPotentialShopCost(bundle),
      hitTicks: [],
      killTicks: [],
      attackReleases: 0,
      focusedAttackReleases: 0,
      arrowsReleased: 0,
      hits: 0,
      focusedHits: 0,
      lethalHits: 0,
      mitigatedHits: 0,
      kills: 0,
      criticalHits: 0,
      penetrationHits: 0,
      damageMilli: 0,
      breaches: 0,
      breachDamage: 0,
      aimCommandsApplied: 0,
      overdriveCommandsApplied: 0,
      overdriveReadyEvents: 0,
      overdriveActivatedEvents: 0,
      overdriveEndedEvents: 0,
      overdriveActivationsByTower: [0, 0, 0, 0],
      warPointsGained: 0,
      warPointsSpent: 0,
      cardPurchases: 0,
      towerUnlocks: 0,
      shopOpenCommandsApplied: 0,
      shopCloseCommandsApplied: 0,
    },
    rerollsUsed: 0,
    revivesGranted: 0,
    choicesByEffect: emptyEffectCounts(),
    choicesByQuality: emptyQualityCounts(),
    shopOffersByWave: new Map<number, OfferGranted[]>(),
    shopPurchasesByWave: new Map<number, number>(),
    shopClosedWithoutPurchase: 0,
    closedShopOfferIds: new Set<string>(),
    cachedShopReopens: 0,
    towerUnlockWave: null,
    towerBuildWaves: [],
    nextCommandSeq: 1,
    nextTacticTick: 0,
  };
}

function recordOutput(metrics: RunEventMetrics, output: SimulationOutput): void {
  const reviveOutput = output.events.some((event) => event.type === 'REVIVED');
  for (const event of output.events) {
    switch (event.type) {
      case 'SPAWN':
        metrics.firstSpawnTick ??= event.tick;
        metrics.aliveEntityIds.add(event.entityId);
        metrics.peakAlive = Math.max(metrics.peakAlive, metrics.aliveEntityIds.size);
        break;
      case 'ATTACK_RELEASE':
        metrics.firstAttackTick ??= event.tick;
        metrics.attackReleases += 1;
        metrics.arrowsReleased += event.arrowCount;
        if (event.focused) metrics.focusedAttackReleases += 1;
        break;
      case 'HIT':
        metrics.hits += 1;
        metrics.hitTicks.push(event.tick);
        metrics.damageMilli += event.damageMilli;
        if (event.focused) metrics.focusedHits += 1;
        if (event.lethal) metrics.lethalHits += 1;
        if (event.mitigation !== 'none') metrics.mitigatedHits += 1;
        if (event.critical) metrics.criticalHits += 1;
        if (event.penetrationIndex > 0) metrics.penetrationHits += 1;
        break;
      case 'DEATH':
        metrics.aliveEntityIds.delete(event.entityId);
        if (!reviveOutput) {
          metrics.kills += 1;
          metrics.killTicks.push(event.tick);
        }
        break;
      case 'BREACH':
        metrics.aliveEntityIds.delete(event.entityId);
        metrics.breaches += 1;
        metrics.breachDamage += event.damage;
        break;
      case 'WAR_POINTS_GAINED':
        metrics.warPointsGained += event.amount;
        if (
          metrics.firstAffordableTick === undefined &&
          event.balance >= metrics.minimumStatCardWarPointCost
        ) {
          metrics.firstAffordableTick = event.tick;
        }
        break;
      case 'CARD_PURCHASED':
        metrics.cardPurchases += 1;
        metrics.warPointsSpent += event.cost;
        metrics.firstPurchaseTick ??= event.tick;
        break;
      case 'TOWER_UNLOCKED':
        metrics.towerUnlocks += 1;
        break;
      case 'TOWER_BUILT':
        metrics.towerUnlocks += 1;
        metrics.warPointsSpent += event.cost;
        break;
      case 'OVERDRIVE_READY':
        metrics.overdriveReadyEvents += 1;
        break;
      case 'OVERDRIVE_ACTIVATED':
        metrics.overdriveActivatedEvents += 1;
        metrics.overdriveActivationsByTower[event.towerId] += 1;
        break;
      case 'OVERDRIVE_ENDED':
        metrics.overdriveEndedEvents += 1;
        break;
      default:
        break;
    }
  }
}

function drainFlowQueue(
  harness: Harness,
  reviveLimit: number,
  initialOutput: SimulationOutput,
): void {
  const queue = [initialOutput];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const output = queue[cursor];
    if (!output) continue;
    recordOutput(harness.metrics, output);

    for (const request of output.flowRequests) {
      if (request.type === 'REVIVE') {
        if (harness.revivesGranted >= reviveLimit) continue;
        harness.revivesGranted += 1;
        queue.push(
          harness.simulation.applyAuthorityEvent(
            harness.authority.grantRevive(request.ordinal),
          ),
        );
        continue;
      }

      throw new Error(
        `Fixed-stage offer ${request.ordinal} bypassed the explicit OPEN_SHOP command path.`,
      );
    }
  }
}

function cardWarPointCost(bundle: BattleBundleV1, card: CardDefinition): number {
  const cost = card.effectId === 'tower-count'
    ? bundle.rules.towerBuildCost
    : card.warPointCost;
  assert.ok(
    cost !== undefined && Number.isSafeInteger(cost) && cost > 0,
    `${card.id} has no valid campaign war-point cost.`,
  );
  return cost;
}

function minimumPotentialShopCost(bundle: BattleBundleV1): number {
  const costs = bundle.cards
    .filter((card) => card.effectId !== 'tower-count')
    .map((card) => cardWarPointCost(bundle, card));
  assert.ok(costs.length > 0, `${bundle.stage.id} has no purchasable stat cards.`);
  return Math.min(...costs);
}

function applyShopCommand(
  harness: Harness,
  command: Extract<BattleCommand, { type: 'OPEN_SHOP' | 'CLOSE_SHOP' }>,
): SimulationOutput {
  const output = harness.simulation.applyCommand(command);
  assert.equal(output.commandAcks.length, 1, `${command.type} did not produce exactly one ack.`);
  const ack = output.commandAcks[0];
  assert.equal(ack?.seq, command.seq, `${command.type} ack sequence diverged.`);
  assert.equal(ack?.status, 'applied', `${command.type} command ${command.seq} was rejected.`);
  if (command.type === 'OPEN_SHOP') harness.metrics.shopOpenCommandsApplied += 1;
  if (command.type === 'CLOSE_SHOP') harness.metrics.shopCloseCommandsApplied += 1;
  recordOutput(harness.metrics, output);
  return output;
}

function attemptCampaignShop(harness: Harness, strategy: Strategy): void {
  const before = harness.simulation.getHudProjection();
  const waveOffers = harness.shopOffersByWave.get(before.waveIndex) ?? [];
  const wavePurchases = harness.shopPurchasesByWave.get(before.waveIndex) ?? 0;
  if (
    (before.flowState !== 'running' && before.flowState !== 'preparing') ||
    !before.shopAvailable ||
    wavePurchases >= before.shopPurchaseLimitPerWave
  ) {
    return;
  }

  let offer = before.shopOffer;
  const reusingCachedOffer = offer !== undefined;
  if (offer === undefined) {
    assert.equal(
      waveOffers.length,
      wavePurchases,
      `${harness.bundle.stage.id} has an untracked uncached fixed quote.`,
    );
  } else {
    assert.equal(
      waveOffers.length,
      wavePurchases + 1,
      `${harness.bundle.stage.id} cached quote accounting diverged.`,
    );
    assert.equal(
      waveOffers.at(-1)?.offerId,
      offer.offerId,
      `${harness.bundle.stage.id} HUD cached quote diverged from the harness.`,
    );
    if (chooseAffordableShopCard(harness.bundle, before, offer, strategy) === undefined) {
      return;
    }
  }

  const openOutput = applyShopCommand(harness, {
    seq: harness.nextCommandSeq,
    type: 'OPEN_SHOP',
  });
  harness.nextCommandSeq += 1;
  const offerRequests = openOutput.flowRequests.filter((request) => request.type === 'OFFER');
  assert.equal(
    openOutput.flowRequests.length,
    offerRequests.length,
    `${harness.bundle.stage.id} mixed shop and non-shop flow requests.`,
  );
  if (reusingCachedOffer) {
    assert.equal(
      offerRequests.length,
      0,
      `${harness.bundle.stage.id} reopening cached quote ${offer?.offerId ?? 'unknown'} requested a reroll.`,
    );
    harness.cachedShopReopens += 1;
  } else {
    assert.equal(
      offerRequests.length,
      1,
      `${harness.bundle.stage.id} wave ${before.waveIndex} did not request exactly one new shop offer.`,
    );
    const request = offerRequests[0];
    assert.ok(request, `${harness.bundle.stage.id} emitted no shop offer request.`);
    offer = harness.authority.requestOffer(
      request.ordinal,
      undefined,
      request.eligibleEffectIds,
    );
    assert.equal(
      offer.replacesOfferId,
      undefined,
      `${harness.bundle.stage.id} fixed shop unexpectedly rerolled an offer.`,
    );
    const grantOutput = harness.simulation.applyAuthorityEvent(offer);
    recordOutput(harness.metrics, grantOutput);
    assert.equal(grantOutput.flowRequests.length, 0, 'OFFER_GRANTED recursively requested flow.');
    waveOffers.push(offer);
    harness.shopOffersByWave.set(before.waveIndex, waveOffers);
  }

  assert.ok(offer, `${harness.bundle.stage.id} opened shop without a fixed quote.`);

  const offeredHud = harness.simulation.getHudProjection();
  assert.equal(offeredHud.flowState, 'offer-pending', 'Granted shop offer is not pending.');
  assert.equal(offeredHud.activeOffer?.offerId, offer.offerId, 'HUD shop offer diverged.');
  const selectedCardId = chooseAffordableShopCard(
    harness.bundle,
    offeredHud,
    offer,
    strategy,
  );
  if (selectedCardId === undefined) {
    assert.equal(
      reusingCachedOffer,
      false,
      `${harness.bundle.stage.id} reopened cached quote ${offer.offerId} before it was affordable.`,
    );
    applyShopCommand(harness, {
      seq: harness.nextCommandSeq,
      type: 'CLOSE_SHOP',
    });
    harness.nextCommandSeq += 1;
    harness.shopClosedWithoutPurchase += 1;
    assert.equal(
      harness.closedShopOfferIds.has(offer.offerId),
      false,
      `${harness.bundle.stage.id} repeatedly closed unaffordable quote ${offer.offerId}.`,
    );
    harness.closedShopOfferIds.add(offer.offerId);
    const closedHud = harness.simulation.getHudProjection();
    assert.equal(
      closedHud.flowState,
      before.flowState,
      `${harness.bundle.stage.id} closing quote ${offer.offerId} did not restore battle flow.`,
    );
    assert.equal(
      closedHud.shopOffer?.offerId,
      offer.offerId,
      `${harness.bundle.stage.id} closing quote ${offer.offerId} discarded its cached projection.`,
    );
    assert.equal(
      closedHud.activeOffer,
      undefined,
      `${harness.bundle.stage.id} closed quote ${offer.offerId} remained modal-active.`,
    );
    return;
  }

  const selectedCard = cardDefinition(harness.bundle, selectedCardId);
  harness.choicesByEffect[selectedCard.effectId] += 1;
  harness.choicesByQuality[selectedCard.quality] += 1;
  const purchaseOutput = harness.simulation.applyAuthorityEvent(
    harness.authority.acceptChoice(offer.offerId, selectedCardId),
  );
  recordOutput(harness.metrics, purchaseOutput);
  assert.equal(purchaseOutput.flowRequests.length, 0, 'CARD_CHOICE_ACCEPTED recursively requested flow.');
  assert.ok(
    purchaseOutput.events.some((event) =>
      event.type === 'CARD_PURCHASED' && event.cardId === selectedCardId
    ),
    `${selectedCardId} purchase emitted no CARD_PURCHASED event.`,
  );
  harness.shopPurchasesByWave.set(before.waveIndex, wavePurchases + 1);
  if (selectedCard.effectId === 'tower-count') {
    assert.equal(harness.towerUnlockWave, null, 'A campaign run unlocked the tower twice.');
    harness.towerUnlockWave = before.waveIndex;
  }
}

function attemptCampaignTowerBuild(harness: Harness): void {
  const hud = harness.simulation.getHudProjection();
  const towerId = hud.towerBuild.nextTowerId;
  if (hud.flowState !== 'preparing' || towerId === null || !hud.towerBuild.canBuild) return;
  const preferred = harness.bundle.route.towerAnchors[towerId];
  assert.ok(preferred, `${harness.bundle.stage.id} has no authored slot for tower ${towerId}.`);
  const placement = findNearestValidTowerPlacement({
    point: preferred,
    buildZones: createDefaultTowerBuildZones(),
    routePoints: harness.bundle.route.points,
    breachPoint: harness.bundle.route.breachPoint,
    existingTowerPoints: hud.activeTowerIds.flatMap((activeTowerId) => {
      const point = hud.towerPositions[activeTowerId];
      return point ? [point] : [];
    }),
  });
  assert.ok(placement?.valid, `${harness.bundle.stage.id} has no legal deterministic tower placement.`);
  const output = harness.simulation.applyCommand({
    seq: harness.nextCommandSeq,
    type: 'BUILD_TOWER',
    point: placement.point,
  });
  harness.nextCommandSeq += 1;
  assert.equal(output.commandAcks[0]?.status, 'applied', `${harness.bundle.stage.id} build rejected.`);
  recordOutput(harness.metrics, output);
  assert.ok(
    output.events.some((event) => event.type === 'TOWER_BUILT' && event.towerId === towerId),
    `${harness.bundle.stage.id} tower ${towerId} build emitted no event.`,
  );
  harness.towerBuildWaves.push(hud.waveIndex);
  harness.towerUnlockWave ??= hud.waveIndex;
}

interface TacticalEnemy {
  entity: RenderEntityV1;
  routeProgressPx: number;
}

interface TowerPressure {
  towerId: TowerId;
  target?: TacticalEnemy;
  enemiesInRange: number;
  cumulativeRouteProgressPx: number;
}

function routeProgressPx(bundle: BattleBundleV1, x: number, y: number): number {
  let cumulativeProgress = 0;
  let bestProgress = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < bundle.route.points.length - 1; index += 1) {
    const start = bundle.route.points[index];
    const end = bundle.route.points[index + 1];
    if (!start || !end) continue;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    if (lengthSquared <= 0) continue;
    const length = Math.sqrt(lengthSquared);
    const segmentFraction = Math.min(
      1,
      Math.max(0, ((x - start.x) * deltaX + (y - start.y) * deltaY) / lengthSquared),
    );
    const projectedX = start.x + deltaX * segmentFraction;
    const projectedY = start.y + deltaY * segmentFraction;
    const distanceSquared = (x - projectedX) ** 2 + (y - projectedY) ** 2;
    const progress = cumulativeProgress + length * segmentFraction;
    if (
      distanceSquared < bestDistanceSquared ||
      (distanceSquared === bestDistanceSquared && progress > bestProgress)
    ) {
      bestDistanceSquared = distanceSquared;
      bestProgress = progress;
    }
    cumulativeProgress += length;
  }
  return bestProgress;
}

function aimAngleU16(fromX: number, fromY: number, toX: number, toY: number): number {
  const turns = Math.atan2(toY - fromY, toX - fromX) / (Math.PI * 2);
  return (Math.round(turns * U16_TURN) + U16_TURN) & 0xffff;
}

function towerPressures(harness: Harness, hud: HudProjectionV1): TowerPressure[] {
  const enemies = harness.simulation.getRenderSnapshot().entities
    .filter((entity) => entity.renderKind === 'enemy')
    .map((entity) => ({
      entity,
      routeProgressPx: routeProgressPx(harness.bundle, entity.x, entity.y),
    }));
  const rangeSquared = hud.towerStats.current.rangePx ** 2;
  return hud.activeTowerIds.map((towerId) => {
    const anchor = hud.towerPositions[towerId];
    assert.ok(anchor, `Active tower ${towerId} has no projected runtime position.`);
    const inRange = enemies
      .filter(({ entity }) =>
        (entity.x - anchor.x) ** 2 + (entity.y - anchor.y) ** 2 <= rangeSquared
      )
      .sort((left, right) =>
        right.routeProgressPx - left.routeProgressPx ||
        left.entity.entityId - right.entity.entityId
      );
    return {
      towerId,
      target: inRange[0],
      enemiesInRange: inRange.length,
      cumulativeRouteProgressPx: inRange.reduce(
        (total, candidate) => total + candidate.routeProgressPx,
        0,
      ),
    };
  });
}

function applyTacticCommand(
  harness: Harness,
  strategy: Strategy,
  reviveLimit: number,
  command: BattleCommand,
): void {
  if (command.type === 'SET_AIM' || command.type === 'ACTIVATE_OVERDRIVE') {
    assert.ok(
      harness.simulation.getHudProjection().activeTowerIds.includes(command.towerId),
      `${command.type} targeted inactive tower ${command.towerId}.`,
    );
  }
  const output = harness.simulation.applyCommand(command);
  assert.equal(output.commandAcks.length, 1, `${command.type} did not produce exactly one ack.`);
  const ack = output.commandAcks[0];
  assert.equal(ack?.seq, command.seq, `${command.type} ack sequence diverged.`);
  assert.equal(ack?.status, 'applied', `${command.type} command ${command.seq} was rejected.`);
  if (command.type === 'SET_AIM') harness.metrics.aimCommandsApplied += 1;
  if (command.type === 'ACTIVATE_OVERDRIVE') harness.metrics.overdriveCommandsApplied += 1;
  drainFlowQueue(harness, reviveLimit, output);
}

function performTactics(
  harness: Harness,
  strategy: Strategy,
  reviveLimit: number,
): void {
  if (strategy.tacticIntervalTicks === undefined) return;
  const hud = harness.simulation.getHudProjection();
  if (hud.flowState !== 'running') return;
  const pressures = towerPressures(harness, hud);
  for (const pressure of pressures) {
    const target = pressure.target;
    if (!target) continue;
    const anchor = hud.towerPositions[pressure.towerId];
    if (!anchor) continue;
    applyTacticCommand(harness, strategy, reviveLimit, {
      seq: harness.nextCommandSeq,
      type: 'SET_AIM',
      towerId: pressure.towerId,
      angleU16: aimAngleU16(anchor.x, anchor.y, target.entity.x, target.entity.y),
    });
    harness.nextCommandSeq += 1;
  }

  if (!strategy.useOverdrive || !hud.overdrive.ready) return;
  const highestPressure = [...pressures]
    .filter((pressure) => pressure.enemiesInRange > 0)
    .sort((left, right) =>
      right.enemiesInRange - left.enemiesInRange ||
      (right.target?.routeProgressPx ?? 0) - (left.target?.routeProgressPx ?? 0) ||
      right.cumulativeRouteProgressPx - left.cumulativeRouteProgressPx ||
      left.towerId - right.towerId
    )[0];
  if (!highestPressure) return;
  applyTacticCommand(harness, strategy, reviveLimit, {
    seq: harness.nextCommandSeq,
    type: 'ACTIVATE_OVERDRIVE',
    towerId: highestPressure.towerId,
  });
  harness.nextCommandSeq += 1;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) return null;
  if (lowerIndex === upperIndex) return lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function rounded(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function distribution(values: readonly number[]): Distribution {
  const quantile = (fraction: number): number | null => {
    const value = percentile(values, fraction);
    return value === null ? null : rounded(value);
  };
  return {
    count: values.length,
    min: quantile(0),
    p10: quantile(0.1),
    p25: quantile(0.25),
    median: quantile(0.5),
    p75: quantile(0.75),
    p90: quantile(0.9),
    max: quantile(1),
  };
}

function maximumKillsInWindow(killTicks: readonly number[]): number {
  let left = 0;
  let maximum = 0;
  for (let right = 0; right < killTicks.length; right += 1) {
    const rightTick = killTicks[right];
    if (rightTick === undefined) continue;
    while (
      left <= right &&
      (killTicks[left] ?? rightTick) <= rightTick - KILL_BURST_WINDOW_TICKS
    ) {
      left += 1;
    }
    maximum = Math.max(maximum, right - left + 1);
  }
  return maximum;
}

function quietGaps(
  hitTicks: readonly number[],
  activityStartTick: number,
  terminalTick: number,
): number[] {
  const uniqueHitTicks = hitTicks.filter((tick, index) => index === 0 || tick !== hitTicks[index - 1]);
  if (uniqueHitTicks.length === 0) return [Math.max(0, terminalTick - activityStartTick)];
  const gaps: number[] = [];
  let previous = activityStartTick;
  for (const tick of uniqueHitTicks) {
    gaps.push(Math.max(0, tick - previous));
    previous = tick;
  }
  gaps.push(Math.max(0, terminalTick - previous));
  return gaps;
}

function runCampaignStage(
  stageId: (typeof CAMPAIGN_STAGE_IDS)[number],
  seed: number,
  strategy: Strategy,
  revivePolicy: (typeof REVIVE_POLICIES)[number],
): RunResult {
  const bundle = resolveStageBundleForSeed(stageId, seed);
  const harness = createHarness(bundle, seed);
  let remainingTicks = SIMULATION_TICK_BUDGET;
  const shopCheckChunkTicks = Math.max(1, Math.min(
    SIMULATION_CHUNK_TICKS,
    bundle.rules.waveGapTicks - 1,
  ));

  while (remainingTicks > 0) {
    let before = harness.simulation.getHudProjection();
    if (before.flowState === 'result' || before.flowState === 'defeat-pending') break;
    if (before.flowState === 'preparing') {
      attemptCampaignTowerBuild(harness);
      attemptCampaignShop(harness, strategy);
      before = harness.simulation.getHudProjection();
      assert.equal(
        before.flowState,
        'preparing',
        `${stageId} preparation shop did not restore preparing flow.`,
      );
      applyTacticCommand(harness, strategy, revivePolicy.limit, {
        seq: harness.nextCommandSeq,
        type: 'START_WAVE',
      });
      harness.nextCommandSeq += 1;
      before = harness.simulation.getHudProjection();
    }
    assert.equal(before.flowState, 'running', `${stageId} stalled in ${before.flowState}.`);
    attemptCampaignShop(harness, strategy);
    before = harness.simulation.getHudProjection();
    assert.equal(before.flowState, 'running', `${stageId} shop did not restore running flow.`);
    if (
      strategy.tacticIntervalTicks !== undefined &&
      before.tick >= harness.nextTacticTick
    ) {
      performTactics(harness, strategy, revivePolicy.limit);
      do {
        harness.nextTacticTick += strategy.tacticIntervalTicks;
      } while (harness.nextTacticTick <= before.tick);
      before = harness.simulation.getHudProjection();
    }
    const ticksUntilNextTactic = strategy.tacticIntervalTicks === undefined
      ? shopCheckChunkTicks
      : Math.max(1, harness.nextTacticTick - before.tick);
    const output = harness.simulation.advanceTicks(
      Math.min(shopCheckChunkTicks, remainingTicks, ticksUntilNextTactic),
    );
    remainingTicks -= output.ticksAdvanced;
    drainFlowQueue(harness, revivePolicy.limit, output);
    const after = harness.simulation.getHudProjection();
    if (after.flowState === 'result' || after.flowState === 'defeat-pending') break;
    if (output.ticksAdvanced === 0 && output.flowRequests.length === 0) {
      throw new Error(`${stageId} ${strategy.id}/${revivePolicy.id} made no progress at tick ${after.tick}.`);
    }
  }

  const hud = harness.simulation.getHudProjection();
  const clear = hud.flowState === 'result' && hud.outcome === 'victory';
  const defeat = hud.outcome === 'defeat' &&
    (hud.flowState === 'defeat-pending' || hud.flowState === 'result');
  assert.ok(clear || defeat, `${stageId} did not reach a campaign terminal state: ${JSON.stringify(hud)}.`);
  assert.ok(remainingTicks > 0, `${stageId} exhausted its campaign simulation tick budget.`);
  assert.ok(harness.metrics.hits > 0, `${stageId} produced no HIT events.`);
  assert.ok(harness.metrics.attackReleases > 0, `${stageId} produced no ATTACK_RELEASE events.`);
  assert.equal(
    hud.revivesUsed,
    harness.revivesGranted,
    `${stageId} revive projection diverged from the harness.`,
  );
  assert.ok(
    hud.revivesUsed <= revivePolicy.limit,
    `${stageId} used ${hud.revivesUsed} revives under ${revivePolicy.id}.`,
  );
  if (clear) assert.ok(harness.metrics.kills > 0, `${stageId} cleared without any combat kills.`);
  if (defeat) assert.ok(harness.metrics.breaches > 0, `${stageId} defeated without a BREACH event.`);
  const purchaseChoiceCount = sum(CARD_EFFECT_IDS.map(
    (effectId) => harness.choicesByEffect[effectId],
  ));
  const shopOfferCount = sum(
    [...harness.shopOffersByWave.values()].map((offers) => offers.length),
  );
  const shopPurchaseCount = sum([...harness.shopPurchasesByWave.values()]);
  const offeredIds = new Set(
    [...harness.shopOffersByWave.values()].flatMap((offers) =>
      offers.map((offer) => offer.offerId)
    ),
  );
  const initialTowerCount = bundle.rules.initialActiveTowerIds?.length ?? TOWER_IDS.length;
  assert.equal(harness.rerollsUsed, 0, `${stageId} fixed shop used a reroll.`);
  assert.ok(
    [...harness.shopOffersByWave.values()].every(
      (offers) => offers.length <= hud.shopPurchaseLimitPerWave,
    ),
    `${stageId} opened more offers than the per-wave purchase limit.`,
  );
  assert.equal(
    harness.metrics.shopOpenCommandsApplied,
    shopOfferCount + harness.cachedShopReopens,
    `${stageId} shop open commands diverged from new and cached fixed quotes.`,
  );
  assert.equal(
    harness.metrics.shopCloseCommandsApplied,
    harness.shopClosedWithoutPurchase,
    `${stageId} shop close accounting diverged.`,
  );
  assert.equal(
    harness.closedShopOfferIds.size,
    harness.shopClosedWithoutPurchase,
    `${stageId} repeatedly closed a cached fixed quote.`,
  );
  assert.ok(
    [...harness.closedShopOfferIds].every((offerId) => offeredIds.has(offerId)),
    `${stageId} closed an unknown fixed quote.`,
  );
  assert.ok(
    harness.cachedShopReopens <= shopPurchaseCount,
    `${stageId} reopened an affordable cached quote without purchasing it.`,
  );
  assert.equal(
    harness.metrics.cardPurchases,
    shopPurchaseCount,
    `${stageId} purchase accounting diverged by wave.`,
  );
  assert.ok(
    [...harness.shopPurchasesByWave.values()].every(
      (count) => count <= hud.shopPurchaseLimitPerWave,
    ),
    `${stageId} exceeded the per-wave purchase limit.`,
  );
  assert.equal(
    harness.metrics.cardPurchases,
    purchaseChoiceCount,
    `${stageId} card purchase and choice accounting diverged.`,
  );
  assert.equal(
    harness.choicesByEffect['tower-count'],
    0,
    `${stageId} fixed skill offers must not contain tower-count.`,
  );
  assert.ok(harness.metrics.towerUnlocks <= 2, `${stageId} built more than two reinforcement towers.`);
  assert.equal(
    harness.towerBuildWaves.length,
    harness.metrics.towerUnlocks,
    `${stageId} tower build wave accounting diverged.`,
  );
  assert.equal(
    harness.towerUnlockWave,
    harness.towerBuildWaves[0] ?? null,
    `${stageId} first tower build wave projection diverged.`,
  );
  assert.equal(
    hud.activeTowerIds.length,
    initialTowerCount + harness.metrics.towerUnlocks,
    `${stageId} active tower projection diverged from unlock events.`,
  );
  assert.equal(
    hud.warPointsEarned,
    harness.metrics.warPointsGained,
    `${stageId} earned war-point projection diverged from events.`,
  );
  assert.equal(
    hud.warPointsEarned - hud.warPointsBalance,
    harness.metrics.warPointsSpent,
    `${stageId} spent war-point accounting diverged.`,
  );

  const activityStartTick = harness.metrics.firstAttackTick ?? harness.metrics.firstSpawnTick ?? 0;
  const gaps = quietGaps(harness.metrics.hitTicks, activityStartTick, hud.tick);
  return {
    seed,
    clear,
    noReviveClear: clear && hud.revivesUsed === 0,
    terminalTick: hud.tick,
    failureWave: defeat ? hud.waveIndex : null,
    progressBp: hud.progressBp,
    revivesUsed: hud.revivesUsed,
    rerollsUsed: harness.rerollsUsed,
    finalLevel: hud.level,
    choicesByEffect: { ...harness.choicesByEffect },
    choicesByQuality: { ...harness.choicesByQuality },
    warPointsEarned: hud.warPointsEarned,
    warPointsSpent: harness.metrics.warPointsSpent,
    warPointsBalance: hud.warPointsBalance,
    minimumStatCardWarPointCost: harness.metrics.minimumStatCardWarPointCost,
    firstAffordableTick: harness.metrics.firstAffordableTick ?? null,
    firstPurchaseTick: harness.metrics.firstPurchaseTick ?? null,
    shopOffers: shopOfferCount,
    shopPurchases: harness.metrics.cardPurchases,
    shopClosuresWithoutPurchase: harness.shopClosedWithoutPurchase,
    cachedShopReopens: harness.cachedShopReopens,
    towerPurchases: harness.metrics.towerUnlocks,
    towerUnlockWave: harness.towerUnlockWave,
    towerBuildWaves: [...harness.towerBuildWaves],
    activeTowerCount: hud.activeTowerIds.length,
    attackReleases: harness.metrics.attackReleases,
    focusedAttackReleases: harness.metrics.focusedAttackReleases,
    arrowsReleased: harness.metrics.arrowsReleased,
    hits: harness.metrics.hits,
    focusedHits: harness.metrics.focusedHits,
    lethalHits: harness.metrics.lethalHits,
    mitigatedHits: harness.metrics.mitigatedHits,
    kills: harness.metrics.kills,
    criticalHits: harness.metrics.criticalHits,
    penetrationHits: harness.metrics.penetrationHits,
    damageMilli: harness.metrics.damageMilli,
    breaches: harness.metrics.breaches,
    breachDamage: harness.metrics.breachDamage,
    gateIntegrityRemaining: hud.gateIntegrity,
    gateIntegrityMax: hud.gateIntegrityMax,
    aimCommandsApplied: harness.metrics.aimCommandsApplied,
    overdriveCommandsApplied: harness.metrics.overdriveCommandsApplied,
    overdriveReadyEvents: harness.metrics.overdriveReadyEvents,
    overdriveActivatedEvents: harness.metrics.overdriveActivatedEvents,
    overdriveEndedEvents: harness.metrics.overdriveEndedEvents,
    overdriveActivationsByTower: [...harness.metrics.overdriveActivationsByTower],
    peakAlive: harness.metrics.peakAlive,
    killBurst3s: maximumKillsInWindow(harness.metrics.killTicks),
    quietGapP95Ticks: percentile(gaps, 0.95) ?? 0,
    maxQuietGapTicks: Math.max(...gaps),
    activeDurationTicks: Math.max(1, hud.tick - activityStartTick + 1),
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function aggregateCounts<K extends string>(
  keys: readonly K[],
  results: readonly RunResult[],
  select: (result: RunResult) => Record<K, number>,
): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [
    key,
    results.reduce((total, result) => total + select(result)[key], 0),
  ])) as Record<K, number>;
}

function failureWaveCounts(results: readonly RunResult[]): Record<string, number> {
  const failureWaves: Record<string, number> = {};
  for (const result of results) {
    if (result.clear) continue;
    const key = String(result.failureWave ?? 'unknown');
    failureWaves[key] = (failureWaves[key] ?? 0) + 1;
  }
  return failureWaves;
}

function aggregateCase(
  strategy: Strategy,
  revivePolicy: (typeof REVIVE_POLICIES)[number],
  results: readonly RunResult[],
): object {
  const clears = results.filter((result) => result.clear);
  const failures = results.filter((result) => !result.clear);
  const totalActiveTicks = sum(results.map((result) => result.activeDurationTicks));
  const totalHits = sum(results.map((result) => result.hits));
  const totalKills = sum(results.map((result) => result.kills));
  const totalAttacks = sum(results.map((result) => result.attackReleases));
  const totalArrows = sum(results.map((result) => result.arrowsReleased));
  const totalDamageMilli = sum(results.map((result) => result.damageMilli));
  const totalChoices = sum(results.map((result) =>
    sum(CARD_EFFECT_IDS.map((effectId) => result.choicesByEffect[effectId]))
  ));
  const failureWaves = failureWaveCounts(results);

  return {
    strategy: strategy.id,
    operationSkill: strategy.operationSkill,
    tacticIntervalTicks: strategy.tacticIntervalTicks ?? null,
    revivePolicy: revivePolicy.id,
    count: results.length,
    clearCount: clears.length,
    clearRate: rounded(clears.length / results.length, 6),
    noReviveClearCount: results.filter((result) => result.noReviveClear).length,
    noReviveClearRate: rounded(
      results.filter((result) => result.noReviveClear).length / results.length,
      6,
    ),
    terminalTicks: distribution(results.map((result) => result.terminalTick)),
    clearTicks: distribution(clears.map((result) => result.terminalTick)),
    failureTicks: distribution(failures.map((result) => result.terminalTick)),
    failureProgressBp: distribution(failures.map((result) => result.progressBp)),
    failureWaves,
    sampleFailures: failures.slice(0, 8).map((failure) => ({
      seed: failure.seed,
      wave: failure.failureWave,
      tick: failure.terminalTick,
      progressBp: failure.progressBp,
    })),
    peakAlive: distribution(results.map((result) => result.peakAlive)),
    combat: {
      activeSeconds: rounded(totalActiveTicks / TICKS_PER_SECOND),
      attackReleases: totalAttacks,
      attacksPerActiveSecond: rounded((totalAttacks * TICKS_PER_SECOND) / totalActiveTicks),
      focusedAttackReleases: sum(results.map((result) => result.focusedAttackReleases)),
      focusedAttackReleaseRate: rounded(
        sum(results.map((result) => result.focusedAttackReleases)) / totalAttacks,
        6,
      ),
      arrowsReleased: totalArrows,
      arrowsPerAttackRelease: rounded(totalArrows / totalAttacks),
      hits: totalHits,
      hitsPerRun: rounded(totalHits / results.length),
      hitsPerActiveSecond: rounded((totalHits * TICKS_PER_SECOND) / totalActiveTicks),
      focusedHits: sum(results.map((result) => result.focusedHits)),
      focusedHitRate: rounded(
        sum(results.map((result) => result.focusedHits)) / totalHits,
        6,
      ),
      lethalHits: sum(results.map((result) => result.lethalHits)),
      mitigatedHits: sum(results.map((result) => result.mitigatedHits)),
      kills: totalKills,
      killsPerRun: rounded(totalKills / results.length),
      killsPerActiveSecond: rounded((totalKills * TICKS_PER_SECOND) / totalActiveTicks),
      criticalHits: sum(results.map((result) => result.criticalHits)),
      penetrationHits: sum(results.map((result) => result.penetrationHits)),
      damageMilli: totalDamageMilli,
      killBurst3s: distribution(results.map((result) => result.killBurst3s)),
      quietGapP95Ticks: distribution(results.map((result) => result.quietGapP95Ticks)),
      maxQuietGapTicks: distribution(results.map((result) => result.maxQuietGapTicks)),
    },
    pressure: {
      breaches: sum(results.map((result) => result.breaches)),
      breachDamage: sum(results.map((result) => result.breachDamage)),
      finalGateIntegrity: distribution(
        results.map((result) => result.gateIntegrityRemaining),
      ),
      finalGateIntegrityBp: distribution(results.map((result) =>
        Math.round((result.gateIntegrityRemaining * 10_000) / result.gateIntegrityMax)
      )),
    },
    tactics: {
      aimCommandsApplied: sum(results.map((result) => result.aimCommandsApplied)),
      overdriveCommandsApplied: sum(
        results.map((result) => result.overdriveCommandsApplied),
      ),
      overdriveReadyEvents: sum(results.map((result) => result.overdriveReadyEvents)),
      overdriveActivatedEvents: sum(
        results.map((result) => result.overdriveActivatedEvents),
      ),
      overdriveEndedEvents: sum(results.map((result) => result.overdriveEndedEvents)),
      overdriveActivationsByTower: Object.fromEntries(TOWER_IDS.map((towerId) => [
        String(towerId),
        sum(results.map((result) => result.overdriveActivationsByTower[towerId])),
      ])),
    },
    economy: {
      warPointsEarned: distribution(results.map((result) => result.warPointsEarned)),
      warPointsSpent: distribution(results.map((result) => result.warPointsSpent)),
      warPointsBalance: distribution(results.map((result) => result.warPointsBalance)),
      minimumStatCardWarPointCost: distribution(
        results.map((result) => result.minimumStatCardWarPointCost),
      ),
      firstAffordableRate: rounded(
        results.filter((result) => result.firstAffordableTick !== null).length / results.length,
        6,
      ),
      firstAffordableTicks: distribution(results.flatMap((result) =>
        result.firstAffordableTick === null ? [] : [result.firstAffordableTick]
      )),
      firstAffordableSeconds: distribution(results.flatMap((result) =>
        result.firstAffordableTick === null
          ? []
          : [result.firstAffordableTick / TICKS_PER_SECOND]
      )),
      firstPurchaseRate: rounded(
        results.filter((result) => result.firstPurchaseTick !== null).length / results.length,
        6,
      ),
      firstPurchaseTicks: distribution(results.flatMap((result) =>
        result.firstPurchaseTick === null ? [] : [result.firstPurchaseTick]
      )),
      shopOffers: distribution(results.map((result) => result.shopOffers)),
      shopPurchases: distribution(results.map((result) => result.shopPurchases)),
      shopClosuresWithoutPurchase: distribution(
        results.map((result) => result.shopClosuresWithoutPurchase),
      ),
      cachedShopReopens: distribution(
        results.map((result) => result.cachedShopReopens),
      ),
      towerPurchases: sum(results.map((result) => result.towerPurchases)),
      towerPurchaseRate: rounded(
        results.filter((result) => result.towerPurchases > 0).length / results.length,
        6,
      ),
      finalActiveTowerCount: distribution(results.map((result) => result.activeTowerCount)),
    },
    progression: {
      finalLevel: distribution(results.map((result) => result.finalLevel)),
      revivesUsed: distribution(results.map((result) => result.revivesUsed)),
      rerollsUsed: distribution(results.map((result) => result.rerollsUsed)),
      choicesPerRun: rounded(totalChoices / results.length),
      choicesByEffect: aggregateCounts(
        CARD_EFFECT_IDS,
        results,
        (result) => result.choicesByEffect,
      ),
      choicesByQuality: aggregateCounts(
        CARD_QUALITIES,
        results,
        (result) => result.choicesByQuality,
      ),
    },
  };
}

function compactCaseFromResults(
  stageId: BattleStageId,
  strategy: Strategy,
  revivePolicy: (typeof REVIVE_POLICIES)[number],
  results: readonly RunResult[],
): CompactCase {
  return {
    stageId,
    strategy: strategy.id,
    revivePolicy: revivePolicy.id,
    count: results.length,
    clearCount: results.filter((result) => result.clear).length,
    noReviveClearCount: results.filter((result) => result.noReviveClear).length,
    terminalMedian: percentile(results.map((result) => result.terminalTick), 0.5),
    terminalP90: percentile(results.map((result) => result.terminalTick), 0.9),
    clearMedian: percentile(
      results.filter((result) => result.clear).map((result) => result.terminalTick),
      0.5,
    ),
    clearP90: percentile(
      results.filter((result) => result.clear).map((result) => result.terminalTick),
      0.9,
    ),
    failureWaves: failureWaveCounts(results),
    peakAliveMedian: percentile(results.map((result) => result.peakAlive), 0.5),
    killBurst3sMedian: percentile(results.map((result) => result.killBurst3s), 0.5),
    quietGapP95Median: percentile(results.map((result) => result.quietGapP95Ticks), 0.5),
    warPointsEarnedMedian: percentile(results.map((result) => result.warPointsEarned), 0.5),
    warPointsSpentMedian: percentile(results.map((result) => result.warPointsSpent), 0.5),
    warPointsBalanceMedian: percentile(results.map((result) => result.warPointsBalance), 0.5),
    minimumStatCardWarPointCostMedian: percentile(
      results.map((result) => result.minimumStatCardWarPointCost),
      0.5,
    ),
    firstAffordableRunCount: results.filter(
      (result) => result.firstAffordableTick !== null,
    ).length,
    firstAffordableTickMedian: percentile(results.flatMap((result) =>
      result.firstAffordableTick === null ? [] : [result.firstAffordableTick]
    ), 0.5),
    firstPurchaseRunCount: results.filter(
      (result) => result.firstPurchaseTick !== null,
    ).length,
    firstPurchaseTickMedian: percentile(results.flatMap((result) =>
      result.firstPurchaseTick === null ? [] : [result.firstPurchaseTick]
    ), 0.5),
    shopOffersMedian: percentile(results.map((result) => result.shopOffers), 0.5),
    shopPurchasesMedian: percentile(results.map((result) => result.shopPurchases), 0.5),
    shopClosuresMedian: percentile(
      results.map((result) => result.shopClosuresWithoutPurchase),
      0.5,
    ),
    cachedShopReopensMedian: percentile(
      results.map((result) => result.cachedShopReopens),
      0.5,
    ),
    purchasesByEffect: aggregateCounts(
      CARD_EFFECT_IDS,
      results,
      (result) => result.choicesByEffect,
    ),
    towerPurchaseRunCount: results.filter((result) => result.towerPurchases > 0).length,
    towerUnlockWaves: results.reduce<Record<string, number>>((counts, result) => {
      const key = result.towerUnlockWave === null ? 'none' : String(result.towerUnlockWave);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}),
    activeTowerCountMedian: percentile(results.map((result) => result.activeTowerCount), 0.5),
    finalGateIntegrityMedian: percentile(
      results.map((result) => result.gateIntegrityRemaining),
      0.5,
    ),
    finalGateIntegrityBpMedian: percentile(results.map((result) =>
      Math.round((result.gateIntegrityRemaining * 10_000) / result.gateIntegrityMax)
    ), 0.5),
  };
}

const seedCorpus = buildSeedCorpus();
assert.equal(seedCorpus.length, SEED_COUNT);
assert.equal(new Set(seedCorpus).size, SEED_COUNT, 'Campaign balance seeds must be unique.');
assert.equal(
  createHash('sha256').update(seedCorpus.join(',')).digest('hex'),
  SEED_CORPUS_HASH,
  'The fixed campaign balance seed corpus changed.',
);
const holdoutSeedCorpus = buildHoldoutSeedCorpus();
assert.equal(holdoutSeedCorpus.length, HOLDOUT_SEED_COUNT);
assert.equal(
  new Set(holdoutSeedCorpus).size,
  HOLDOUT_SEED_COUNT,
  'Campaign balance holdout seeds must be unique.',
);
assert.equal(
  holdoutSeedCorpus.some((seed) => seedCorpus.includes(seed)),
  false,
  'Campaign balance holdout seeds must be disjoint from the primary corpus.',
);
assert.equal(
  createHash('sha256').update(holdoutSeedCorpus.join(',')).digest('hex'),
  HOLDOUT_SEED_CORPUS_HASH,
  'The fixed campaign balance holdout seed corpus changed.',
);

interface CompactCase {
  stageId: BattleStageId;
  strategy: StrategyId;
  revivePolicy: RevivePolicyId;
  count: number;
  clearCount: number;
  noReviveClearCount: number;
  terminalMedian: number | null;
  terminalP90: number | null;
  clearMedian: number | null;
  clearP90: number | null;
  failureWaves: Record<string, number>;
  peakAliveMedian: number | null;
  killBurst3sMedian: number | null;
  quietGapP95Median: number | null;
  warPointsEarnedMedian: number | null;
  warPointsSpentMedian: number | null;
  warPointsBalanceMedian: number | null;
  minimumStatCardWarPointCostMedian: number | null;
  firstAffordableRunCount: number;
  firstAffordableTickMedian: number | null;
  firstPurchaseRunCount: number;
  firstPurchaseTickMedian: number | null;
  shopOffersMedian: number | null;
  shopPurchasesMedian: number | null;
  shopClosuresMedian: number | null;
  cachedShopReopensMedian: number | null;
  purchasesByEffect: Record<CardEffectId, number>;
  towerPurchaseRunCount: number;
  towerUnlockWaves: Record<string, number>;
  activeTowerCountMedian: number | null;
  finalGateIntegrityMedian: number | null;
  finalGateIntegrityBpMedian: number | null;
}

interface GateFailure {
  id: string;
  scope: string;
  expected: string;
  actual: unknown;
}

interface GateEvaluation {
  checkCount: number;
  failures: GateFailure[];
}

const ACTIVE_STRATEGY_IDS = [
  'single-target',
  'volley-penetration',
  'greedy-throughput',
] as const satisfies readonly StrategyId[];
const HUMAN_OPERATION_STRATEGY_IDS = [
  'medium-human',
  ...ACTIVE_STRATEGY_IDS,
] as const satisfies readonly StrategyId[];
const POWER_STRATEGY_IDS = [
  'volley-penetration',
  'greedy-throughput',
] as const satisfies readonly StrategyId[];
const BUILD_EFFECT_IDS = CARD_EFFECT_IDS.filter(
  (effectId) => effectId !== 'tower-count',
);

function aggregatePurchaseEffects(
  cases: readonly CompactCase[],
  strategyId: StrategyId,
): Record<CardEffectId, number> {
  const matching = cases.filter((compact) =>
    compact.strategy === strategyId && compact.revivePolicy === 'never'
  );
  return Object.fromEntries(CARD_EFFECT_IDS.map((effectId) => [
    effectId,
    sum(matching.map((compact) => compact.purchasesByEffect[effectId])),
  ])) as Record<CardEffectId, number>;
}

function purchaseDistributionDistanceBp(
  left: Record<CardEffectId, number>,
  right: Record<CardEffectId, number>,
): number | null {
  const leftTotal = sum(BUILD_EFFECT_IDS.map((effectId) => left[effectId]));
  const rightTotal = sum(BUILD_EFFECT_IDS.map((effectId) => right[effectId]));
  if (leftTotal === 0 || rightTotal === 0) return null;
  const scaledL1 = sum(BUILD_EFFECT_IDS.map((effectId) =>
    Math.abs(left[effectId] * rightTotal - right[effectId] * leftTotal)
  ));
  return Math.round((scaledL1 * 10_000) / (2 * leftTotal * rightTotal));
}

function buildStrategyPairDiagnostics(cases: readonly CompactCase[]) {
  return ACTIVE_STRATEGY_IDS.flatMap((leftStrategy, leftIndex) =>
    ACTIVE_STRATEGY_IDS.slice(leftIndex + 1).map((rightStrategy) => {
      const left = aggregatePurchaseEffects(cases, leftStrategy);
      const right = aggregatePurchaseEffects(cases, rightStrategy);
      const distanceBp = purchaseDistributionDistanceBp(left, right);
      return {
        leftStrategy,
        rightStrategy,
        purchaseDistributionDistanceBp: distanceBp,
        purchaseDistributionDistancePct: distanceBp === null
          ? null
          : rounded(distanceBp / 100, 2),
        minimumDistanceBp: MIN_BUILD_TRAJECTORY_DISTANCE_BP,
        leftPurchasesByEffect: left,
        rightPurchasesByEffect: right,
        pass: distanceBp !== null && distanceBp >= MIN_BUILD_TRAJECTORY_DISTANCE_BP,
      };
    })
  );
}

function requireCompactCase(
  cases: readonly CompactCase[],
  stageId: BattleStageId,
  strategy: StrategyId,
  revivePolicy: RevivePolicyId,
): CompactCase {
  const matched = cases.find((candidate) =>
    candidate.stageId === stageId &&
    candidate.strategy === strategy &&
    candidate.revivePolicy === revivePolicy
  );
  assert.ok(matched, `Missing compact balance case ${stageId}/${strategy}/${revivePolicy}.`);
  return matched;
}

function rateBp(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator * 10_000) / denominator);
}

function ratePct(numerator: number, denominator: number): number | null {
  const basisPoints = rateBp(numerator, denominator);
  return basisPoints === null ? null : rounded(basisPoints / 100, 2);
}

function reviveUpliftWindow(never: CompactCase): {
  headroom: number;
  minimumRescued: number;
  maximumRescued: number;
} {
  const headroom = never.count - never.clearCount;
  return {
    headroom,
    minimumRescued: Math.min(
      headroom,
      Math.ceil((never.count * MIN_REVIVE_UPLIFT_BP) / 10_000),
    ),
    maximumRescued: Math.min(
      headroom,
      Math.floor((never.count * MAX_REVIVE_UPLIFT_BP) / 10_000),
    ),
  };
}

function buildBalanceDiagnostics(cases: readonly CompactCase[]): object {
  const noOperationBaseline = CAMPAIGN_STAGE_IDS.map((stageId) => {
    const compact = requireCompactCase(cases, stageId, 'first-card', 'never');
    return {
      stageId,
      clearCount: compact.clearCount,
      clearRatePct: ratePct(compact.clearCount, compact.count),
      failureWaves: compact.failureWaves,
      interpretation:
        'Deliberately weak no-operation floor; excluded from human early/late and skilled-build spread gates.',
    };
  });
  const adjacentStageCurve = ACTIVE_STRATEGY_IDS.flatMap((strategyId) =>
    CAMPAIGN_STAGE_IDS.slice(1).map((toStageId, index) => {
      const fromStageId = CAMPAIGN_STAGE_IDS[index];
      const from = requireCompactCase(cases, fromStageId, strategyId, 'never');
      const to = requireCompactCase(cases, toStageId, strategyId, 'never');
      const deltaClearCount = to.clearCount - from.clearCount;
      const deltaBp = rateBp(deltaClearCount, from.count) ?? 0;
      return {
        strategy: strategyId,
        fromStageId,
        toStageId,
        fromClearCount: from.clearCount,
        toClearCount: to.clearCount,
        fromClearRatePct: ratePct(from.clearCount, from.count),
        toClearRatePct: ratePct(to.clearCount, to.count),
        deltaPp: rounded(deltaBp / 100, 2),
        pass: deltaClearCount * 10_000 <=
          MAX_ADJACENT_CLEAR_RATE_REVERSAL_BP * from.count,
      };
    })
  );

  const earlyWaveAndFailureShape = CAMPAIGN_STAGE_IDS.flatMap((stageId) =>
    HUMAN_OPERATION_STRATEGY_IDS.map((strategyId) => {
      const compact = requireCompactCase(cases, stageId, strategyId, 'never');
      const failureCount = compact.count - compact.clearCount;
      const wave1Failures = compact.failureWaves['1'] ?? 0;
      const wave2Failures = compact.failureWaves['2'] ?? 0;
      const lateFailures = (compact.failureWaves['4'] ?? 0) +
        (compact.failureWaves['5'] ?? 0);
      return {
        stageId,
        strategy: strategyId,
        failureCount,
        wave1Failures,
        wave1FailureRatePct: ratePct(wave1Failures, compact.count),
        wave2Failures,
        wave2FailureRatePct: ratePct(wave2Failures, compact.count),
        lateWaveFailures: lateFailures,
        lateFailureSharePct: ratePct(lateFailures, failureCount),
        pass: wave1Failures === 0 &&
          wave2Failures * 10_000 < MAX_WAVE_TWO_FAILURE_RATE_BP * compact.count &&
          (failureCount === 0 ||
            lateFailures * 10_000 >= MIN_LATE_FAILURE_SHARE_BP * failureCount),
      };
    })
  );

  const activeStrategySpread = CAMPAIGN_STAGE_IDS.map((stageId) => {
    const stageCases = ACTIVE_STRATEGY_IDS.map((strategyId) =>
      requireCompactCase(cases, stageId, strategyId, 'never')
    );
    const minimum = stageCases.reduce((left, right) =>
      left.clearCount <= right.clearCount ? left : right
    );
    const maximum = stageCases.reduce((left, right) =>
      left.clearCount >= right.clearCount ? left : right
    );
    const spreadCount = maximum.clearCount - minimum.clearCount;
    const spreadBp = rateBp(spreadCount, minimum.count) ?? 0;
    return {
      stageId,
      clearRatesPct: Object.fromEntries(stageCases.map((compact) => [
        compact.strategy,
        ratePct(compact.clearCount, compact.count),
      ])),
      minimum: { strategy: minimum.strategy, clearCount: minimum.clearCount },
      maximum: { strategy: maximum.strategy, clearCount: maximum.clearCount },
      spreadCount,
      spreadPp: rounded(spreadBp / 100, 2),
      pass: spreadCount * 10_000 <=
        MAX_ACTIVE_STRATEGY_CLEAR_RATE_SPREAD_BP * minimum.count,
    };
  });

  const buildStrategyDifference = buildStrategyPairDiagnostics(cases);

  const reviveRescue = CAMPAIGN_STAGE_IDS.flatMap((stageId) =>
    HUMAN_OPERATION_STRATEGY_IDS.map((strategyId) => {
      const never = requireCompactCase(cases, stageId, strategyId, 'never');
      const once = requireCompactCase(cases, stageId, strategyId, 'once');
      const rescued = once.clearCount - never.clearCount;
      const window = reviveUpliftWindow(never);
      return {
        stageId,
        strategy: strategyId,
        neverClearCount: never.clearCount,
        onceClearCount: once.clearCount,
        headroom: window.headroom,
        rescued,
        upliftPp: ratePct(rescued, never.count),
        targetRescuedRange: [window.minimumRescued, window.maximumRescued],
        targetUpliftRangePp: [
          ratePct(window.minimumRescued, never.count),
          ratePct(window.maximumRescued, never.count),
        ],
        withinDiagnosticTarget:
          rescued >= window.minimumRescued && rescued <= window.maximumRescued,
      };
    })
  );

  const experienceTelemetry = CAMPAIGN_STAGE_IDS.flatMap((stageId) =>
    ACTIVE_STRATEGY_IDS.map((strategyId) => {
      const compact = requireCompactCase(cases, stageId, strategyId, 'never');
      return {
        stageId,
        strategy: strategyId,
        terminal: {
          p50Ticks: compact.terminalMedian,
          p90Ticks: compact.terminalP90,
          p50Seconds: compact.terminalMedian === null
            ? null
            : rounded(compact.terminalMedian / TICKS_PER_SECOND, 2),
          p90Seconds: compact.terminalP90 === null
            ? null
            : rounded(compact.terminalP90 / TICKS_PER_SECOND, 2),
        },
        peakAliveP50: compact.peakAliveMedian,
        firstAffordable: {
          definition: 'first tick where authoritative balance reaches the cheapest stat-card cost',
          minimumStatCardWarPointCost: compact.minimumStatCardWarPointCostMedian,
          reachedCount: compact.firstAffordableRunCount,
          reachedRatePct: ratePct(compact.firstAffordableRunCount, compact.count),
          p50Tick: compact.firstAffordableTickMedian,
          p50Seconds: compact.firstAffordableTickMedian === null
            ? null
            : rounded(compact.firstAffordableTickMedian / TICKS_PER_SECOND, 2),
        },
        firstPurchase: {
          purchasedCount: compact.firstPurchaseRunCount,
          purchasedRatePct: ratePct(compact.firstPurchaseRunCount, compact.count),
          p50Tick: compact.firstPurchaseTickMedian,
          p50Seconds: compact.firstPurchaseTickMedian === null
            ? null
            : rounded(compact.firstPurchaseTickMedian / TICKS_PER_SECOND, 2),
        },
        thirdTower: {
          unlockedCount: compact.towerPurchaseRunCount,
          unlockedRatePct: ratePct(compact.towerPurchaseRunCount, compact.count),
          unlockWaves: compact.towerUnlockWaves,
        },
      };
    })
  );

  return {
    criteria: {
      adjacentStageClearRate:
        'For each active no-revive strategy, the next stage may reverse by at most 5 percentage points.',
      noOperationBaseline:
        'The first-card/no-operation profile is diagnostic only and is not treated as a normal-player balance gate.',
      earlyFailure:
        'For each active no-revive case, wave 1 has zero failures and wave 2 has below 5% of all runs.',
      lateFailureConcentration:
        'When failures exist, at least 70% occur in waves 4-5.',
      activeStrategySpread:
        'Within a stage, reasonable active no-revive strategies differ by at most 15 percentage points.',
      buildStrategyDifference:
        'Across the main corpus, each skilled build pair has at least 5% total-variation distance in purchased effects before clear-rate spread is interpreted.',
      reviveRescue:
        'Hard gate: when at least 8 no-revive runs fail, one revive rescues at least 1 seed. The 10-20 percentage-point uplift remains diagnostic.',
    },
    thresholdsBp: {
      maximumAdjacentReversal: MAX_ADJACENT_CLEAR_RATE_REVERSAL_BP,
      maximumWaveTwoFailureExclusive: MAX_WAVE_TWO_FAILURE_RATE_BP,
      minimumLateFailureShare: MIN_LATE_FAILURE_SHARE_BP,
      maximumActiveStrategySpread: MAX_ACTIVE_STRATEGY_CLEAR_RATE_SPREAD_BP,
      minimumBuildTrajectoryDistance: MIN_BUILD_TRAJECTORY_DISTANCE_BP,
      minimumReviveRescueHeadroom: MIN_REVIVE_RESCUE_HEADROOM,
      reviveDiagnosticTarget: [MIN_REVIVE_UPLIFT_BP, MAX_REVIVE_UPLIFT_BP],
    },
    noOperationBaseline,
    adjacentStageCurve,
    earlyWaveAndFailureShape,
    buildStrategyDifference,
    activeStrategySpread,
    reviveRescue,
    experienceTelemetry,
  };
}

function evaluateBalanceGates(cases: readonly CompactCase[]): GateEvaluation {
  const failures: GateFailure[] = [];
  let checkCount = 0;
  const check = (
    condition: boolean,
    id: string,
    scope: string,
    expected: string,
    actual: unknown,
  ): void => {
    checkCount += 1;
    if (!condition) failures.push({ id, scope, expected, actual });
  };

  for (const stageId of CAMPAIGN_STAGE_IDS) {
    for (const strategy of STRATEGIES) {
      const never = requireCompactCase(cases, stageId, strategy.id, 'never');
      const once = requireCompactCase(cases, stageId, strategy.id, 'once');
      const pairScope = `${stageId}/${strategy.id}`;
      check(
        never.count === SEED_COUNT && once.count === SEED_COUNT,
        'seed-count',
        pairScope,
        `${SEED_COUNT} runs per revive policy`,
        { never: never.count, once: once.count },
      );
      check(
        never.noReviveClearCount === never.clearCount,
        'never-no-revive-accounting',
        pairScope,
        'never.noReviveClearCount equals never.clearCount',
        { clearCount: never.clearCount, noReviveClearCount: never.noReviveClearCount },
      );
      check(
        once.noReviveClearCount === never.clearCount,
        'once-no-revive-accounting',
        pairScope,
        'once.noReviveClearCount equals never.clearCount for the same fixed seeds',
        {
          neverClearCount: never.clearCount,
          onceNoReviveClearCount: once.noReviveClearCount,
        },
      );
      check(
        once.clearCount >= never.clearCount,
        'revive-monotonic',
        pairScope,
        'once.clearCount is not lower than never.clearCount',
        { never: never.clearCount, once: once.clearCount },
      );
      if (HUMAN_OPERATION_STRATEGY_IDS.includes(
        strategy.id as (typeof HUMAN_OPERATION_STRATEGY_IDS)[number],
      )) {
        const headroom = never.count - never.clearCount;
        const rescued = once.clearCount - never.clearCount;
        check(
          headroom < MIN_REVIVE_RESCUE_HEADROOM || rescued >= 1,
          'revive-rescues-seed-with-headroom',
          pairScope,
          `when no-revive failure headroom is at least ${MIN_REVIVE_RESCUE_HEADROOM}, one revive rescues at least 1 seed`,
          { headroom, rescued, never: never.clearCount, once: once.clearCount },
        );
      }
      for (const compact of [never, once]) {
        const scope = `${pairScope}/${compact.revivePolicy}`;
        const median = compact.terminalMedian;
        const p90 = compact.terminalP90;
        check(
          median !== null && median >= 900 && median <= 5_400,
          'terminal-p50-safety',
          scope,
          'terminal tick P50 is within [900, 5400]',
          median,
        );
        check(
          median !== null &&
            p90 !== null &&
            p90 >= median &&
            p90 <= 7_200 &&
            p90 <= median * 1.8,
          'terminal-p90-safety',
          scope,
          'terminal tick P90 is between P50 and min(7200, 1.8 * P50)',
          { median, p90 },
        );
        check(
          (compact.failureWaves.unknown ?? 0) === 0,
          'known-failure-wave',
          scope,
          'all failures have a known wave',
          compact.failureWaves,
        );
        check(
          compact.shopClosuresMedian !== null &&
            compact.cachedShopReopensMedian !== null &&
            compact.shopClosuresMedian >= 1 &&
            compact.cachedShopReopensMedian >= 1,
          'cached-shop-reopen-coverage',
          scope,
          'P50 run prefetches, closes, then reopens at least one cached fixed quote',
          {
            shopClosuresMedian: compact.shopClosuresMedian,
            cachedShopReopensMedian: compact.cachedShopReopensMedian,
          },
        );

        if (POWER_STRATEGY_IDS.includes(strategy.id as (typeof POWER_STRATEGY_IDS)[number])) {
          check(
            compact.killBurst3sMedian !== null &&
              compact.killBurst3sMedian >= 10 &&
              compact.killBurst3sMedian <= 30,
            'power-kill-burst-density',
            scope,
            'strong-build 3-second kill-burst P50 is within [10, 30]',
            compact.killBurst3sMedian,
          );
          check(
            compact.quietGapP95Median !== null && compact.quietGapP95Median <= 60,
            'power-quiet-gap-density',
            scope,
            'strong-build quiet-gap P95 median is at most 60 ticks',
            compact.quietGapP95Median,
          );
        }
      }
    }
  }

  for (const strategyId of ACTIVE_STRATEGY_IDS) {
    for (let index = 1; index < CAMPAIGN_STAGE_IDS.length; index += 1) {
      const fromStageId = CAMPAIGN_STAGE_IDS[index - 1];
      const toStageId = CAMPAIGN_STAGE_IDS[index];
      const from = requireCompactCase(cases, fromStageId, strategyId, 'never');
      const to = requireCompactCase(cases, toStageId, strategyId, 'never');
      const deltaClearCount = to.clearCount - from.clearCount;
      const deltaBp = rateBp(deltaClearCount, from.count) ?? 0;
      check(
        deltaClearCount * 10_000 <=
          MAX_ADJACENT_CLEAR_RATE_REVERSAL_BP * from.count,
        'adjacent-stage-clear-rate-curve',
        `${strategyId}/${fromStageId}->${toStageId}/never`,
        'next-stage clear rate does not increase by more than 5 percentage points',
        {
          fromClearCount: from.clearCount,
          toClearCount: to.clearCount,
          fromClearRatePct: ratePct(from.clearCount, from.count),
          toClearRatePct: ratePct(to.clearCount, to.count),
          deltaPp: rounded(deltaBp / 100, 2),
        },
      );
    }
  }

  for (const stageId of CAMPAIGN_STAGE_IDS) {
    for (const strategyId of HUMAN_OPERATION_STRATEGY_IDS) {
      const compact = requireCompactCase(cases, stageId, strategyId, 'never');
      const failureCount = compact.count - compact.clearCount;
      const wave1Failures = compact.failureWaves['1'] ?? 0;
      const wave2Failures = compact.failureWaves['2'] ?? 0;
      const lateFailures = (compact.failureWaves['4'] ?? 0) +
        (compact.failureWaves['5'] ?? 0);
      check(
        wave1Failures === 0,
        'no-wave-1-failure',
        `${stageId}/${strategyId}/never`,
        'zero failures at wave 1',
        compact.failureWaves,
      );
      check(
        wave2Failures * 10_000 < MAX_WAVE_TWO_FAILURE_RATE_BP * compact.count,
        'wave-2-failure-rate',
        `${stageId}/${strategyId}/never`,
        'wave-2 failures are below 5% of all runs',
        {
          failureCount: wave2Failures,
          failureRatePct: ratePct(wave2Failures, compact.count),
          failureWaves: compact.failureWaves,
        },
      );
      check(
        failureCount === 0 ||
          lateFailures * 10_000 >= MIN_LATE_FAILURE_SHARE_BP * failureCount,
        'late-failure-concentration',
        `${stageId}/${strategyId}/never`,
        'at least 70% of failures occur in waves 4-5 (or no failures exist)',
        {
          failureCount,
          lateFailures,
          lateFailureSharePct: ratePct(lateFailures, failureCount),
          failureWaves: compact.failureWaves,
        },
      );
    }
  }

  for (const strategyId of HUMAN_OPERATION_STRATEGY_IDS) {
    const stage05 = requireCompactCase(cases, 'STAGE_05', strategyId, 'never');
    const stage06 = requireCompactCase(cases, 'STAGE_06', strategyId, 'never');
    check(
      stage06.clearCount <= stage05.clearCount,
      'stage-06-not-easier-than-stage-05',
      `${strategyId}/STAGE_05->STAGE_06/never`,
      'S06 clearCount does not exceed S05 on the primary corpus',
      {
        stage05ClearCount: stage05.clearCount,
        stage06ClearCount: stage06.clearCount,
      },
    );
  }

  for (const pair of buildStrategyPairDiagnostics(cases)) {
    check(
      pair.pass,
      'active-build-trajectory-difference',
      `${pair.leftStrategy}/${pair.rightStrategy}/never`,
      `purchased-effect total-variation distance is at least ${MIN_BUILD_TRAJECTORY_DISTANCE_BP}bp`,
      {
        distanceBp: pair.purchaseDistributionDistanceBp,
        left: pair.leftPurchasesByEffect,
        right: pair.rightPurchasesByEffect,
      },
    );
  }

  for (const stageId of CAMPAIGN_STAGE_IDS) {
    const stageCases = ACTIVE_STRATEGY_IDS.map((strategyId) =>
      requireCompactCase(cases, stageId, strategyId, 'never')
    );
    const minimum = stageCases.reduce((left, right) =>
      left.clearCount <= right.clearCount ? left : right
    );
    const maximum = stageCases.reduce((left, right) =>
      left.clearCount >= right.clearCount ? left : right
    );
    const spreadCount = maximum.clearCount - minimum.clearCount;
    const spreadBp = rateBp(spreadCount, minimum.count) ?? 0;
    check(
      spreadCount * 10_000 <=
        MAX_ACTIVE_STRATEGY_CLEAR_RATE_SPREAD_BP * minimum.count,
      'active-strategy-clear-rate-spread',
      `${stageId}/never`,
      'reasonable active strategy clear rates differ by at most 15 percentage points',
      {
        clearCounts: Object.fromEntries(stageCases.map((compact) => [
          compact.strategy,
          compact.clearCount,
        ])),
        minimumStrategy: minimum.strategy,
        maximumStrategy: maximum.strategy,
        spreadCount,
        spreadPp: rounded(spreadBp / 100, 2),
      },
    );
  }

  for (const strategyId of HUMAN_OPERATION_STRATEGY_IDS) {
    const stage01 = requireCompactCase(cases, 'STAGE_01', strategyId, 'never');
    check(
      stage01.clearCount >= 32 && stage01.clearCount <= SEED_COUNT,
      'stage-01-clear-window',
      `STAGE_01/${strategyId}/never`,
      `clearCount is within [32, ${SEED_COUNT}]`,
      stage01.clearCount,
    );
  }

  for (const strategyId of POWER_STRATEGY_IDS) {
    const stage02 = requireCompactCase(cases, 'STAGE_02', strategyId, 'never');
    check(
      stage02.clearCount > 0 && stage02.clearCount < SEED_COUNT,
      'stage-02-power-clear-window',
      `STAGE_02/${strategyId}/never`,
      'clearCount is within [1, 63]',
      stage02.clearCount,
    );
  }

  const stage02Single = requireCompactCase(cases, 'STAGE_02', 'single-target', 'never');
  check(
    stage02Single.clearCount > 0 && stage02Single.clearCount < SEED_COUNT,
    'stage-02-single-clear-window',
    'STAGE_02/single-target/never',
    'clearCount is within [1, 63]',
    stage02Single.clearCount,
  );

  for (const stageId of CAMPAIGN_STAGE_IDS.slice(2, 6)) {
    for (const strategyId of ACTIVE_STRATEGY_IDS) {
      const compact = requireCompactCase(cases, stageId, strategyId, 'never');
      check(
        compact.clearCount > 0 && compact.clearCount < SEED_COUNT,
        'mid-late-active-clear-window',
        `${stageId}/${strategyId}/never`,
        'clearCount is within [1, 63]',
        compact.clearCount,
      );
    }
  }


  const stage07SingleOnce = requireCompactCase(cases, 'STAGE_07', 'single-target', 'once');
  check(
    stage07SingleOnce.clearCount > 0 && stage07SingleOnce.clearCount < SEED_COUNT,
    'stage-07-single-revive-clear-window',
    'STAGE_07/single-target/once',
    'clearCount is within [1, 63]',
    stage07SingleOnce.clearCount,
  );
  for (const strategyId of POWER_STRATEGY_IDS) {
    const stage07 = requireCompactCase(cases, 'STAGE_07', strategyId, 'never');
    check(
      stage07.clearCount > 0 && stage07.clearCount < SEED_COUNT,
      'stage-07-power-clear-window',
      `STAGE_07/${strategyId}/never`,
      'clearCount is within [1, 63]',
      stage07.clearCount,
    );
  }

  for (const strategyId of ACTIVE_STRATEGY_IDS) {
    const earlyMean = (
      requireCompactCase(cases, 'STAGE_01', strategyId, 'never').clearCount +
      requireCompactCase(cases, 'STAGE_02', strategyId, 'never').clearCount
    ) / 2;
    const lateMean = (
      requireCompactCase(cases, 'STAGE_05', strategyId, 'never').clearCount +
      requireCompactCase(cases, 'STAGE_06', strategyId, 'never').clearCount +
      requireCompactCase(cases, 'STAGE_07', strategyId, 'never').clearCount
    ) / 3;
    check(
      lateMean <= earlyMean,
      'late-campaign-not-easier',
      strategyId,
      'mean S05-S07 clearCount does not exceed mean S01-S02',
      { earlyMean: rounded(earlyMean), lateMean: rounded(lateMean) },
    );
  }

  for (const strategyId of POWER_STRATEGY_IDS) {
    const stage01Never = requireCompactCase(cases, 'STAGE_01', strategyId, 'never');
    const stage07Never = requireCompactCase(cases, 'STAGE_07', strategyId, 'never');
    const minimumClearGap = strategyId === 'volley-penetration' ? 7 : 0;
    check(
      stage07Never.clearCount <= stage01Never.clearCount - minimumClearGap,
      'stage-07-power-clear-gap',
      `${strategyId}/never`,
      strategyId === 'volley-penetration'
        ? 'S07 clearCount is at least 7 below S01'
        : 'S07 clearCount does not exceed S01',
      {
        stage01: stage01Never.clearCount,
        stage07: stage07Never.clearCount,
        minimumClearGap,
      },
    );

    for (const revivePolicy of REVIVE_POLICIES) {
      const stage01 = requireCompactCase(cases, 'STAGE_01', strategyId, revivePolicy.id);
      const stage07 = requireCompactCase(cases, 'STAGE_07', strategyId, revivePolicy.id);
      check(
        stage01.peakAliveMedian !== null &&
          stage07.peakAliveMedian !== null &&
          stage07.peakAliveMedian >= stage01.peakAliveMedian + 8,
        'stage-07-power-peak-pressure',
        `${strategyId}/${revivePolicy.id}`,
        'S07 peak-alive P50 is at least 8 above S01',
        { stage01: stage01.peakAliveMedian, stage07: stage07.peakAliveMedian },
      );
      check(
        stage01.clearMedian !== null &&
          stage07.clearMedian !== null &&
          stage07.clearMedian >= stage01.clearMedian * 1.25,
        'stage-07-power-duration',
        `${strategyId}/${revivePolicy.id}`,
        'S07 clear tick P50 is at least 1.25 times S01',
        { stage01: stage01.clearMedian, stage07: stage07.clearMedian },
      );
    }
  }

  return { checkCount, failures };
}

function evaluateHoldoutGates(cases: readonly CompactCase[]): GateEvaluation {
  const failures: GateFailure[] = [];
  let checkCount = 0;
  const check = (
    condition: boolean,
    id: string,
    scope: string,
    expected: string,
    actual: unknown,
  ): void => {
    checkCount += 1;
    if (!condition) failures.push({ id, scope, expected, actual });
  };

  for (const strategyId of HUMAN_OPERATION_STRATEGY_IDS) {
    for (const stageId of CAMPAIGN_STAGE_IDS) {
      const compact = requireCompactCase(cases, stageId, strategyId, 'never');
      const wave1Failures = compact.failureWaves['1'] ?? 0;
      const wave2Failures = compact.failureWaves['2'] ?? 0;
      const failureCount = compact.count - compact.clearCount;
      const lateFailures = (compact.failureWaves['4'] ?? 0) +
        (compact.failureWaves['5'] ?? 0);
      check(
        compact.count === HOLDOUT_SEED_COUNT,
        'holdout-seed-count',
        `${stageId}/${strategyId}/never`,
        `${HOLDOUT_SEED_COUNT} independent holdout runs`,
        compact.count,
      );
      check(
        compact.shopClosuresMedian !== null &&
          compact.cachedShopReopensMedian !== null &&
          compact.shopClosuresMedian >= 1 &&
          compact.cachedShopReopensMedian >= 1,
        'holdout-cached-shop-reopen-coverage',
        `${stageId}/${strategyId}/never`,
        'P50 holdout run prefetches, closes, then reopens at least one cached fixed quote',
        {
          shopClosuresMedian: compact.shopClosuresMedian,
          cachedShopReopensMedian: compact.cachedShopReopensMedian,
        },
      );
      check(
        wave1Failures === 0,
        'holdout-no-wave-1-failure',
        `${stageId}/${strategyId}/never`,
        'zero holdout failures at wave 1',
        compact.failureWaves,
      );
      check(
        wave2Failures * 10_000 < MAX_WAVE_TWO_FAILURE_RATE_BP * compact.count,
        'holdout-wave-2-failure-rate',
        `${stageId}/${strategyId}/never`,
        'holdout wave-2 failures are below 5% of all runs',
        {
          failureCount: wave2Failures,
          failureRatePct: ratePct(wave2Failures, compact.count),
          failureWaves: compact.failureWaves,
        },
      );
      check(
        failureCount === 0 ||
          lateFailures * 10_000 >= MIN_LATE_FAILURE_SHARE_BP * failureCount,
        'holdout-late-failure-concentration',
        `${stageId}/${strategyId}/never`,
        'at least 70% of holdout failures occur in waves 4-5 (or no failures exist)',
        {
          failureCount,
          lateFailures,
          lateFailureSharePct: ratePct(lateFailures, failureCount),
          failureWaves: compact.failureWaves,
        },
      );
    }

    if (ACTIVE_STRATEGY_IDS.includes(
      strategyId as (typeof ACTIVE_STRATEGY_IDS)[number],
    )) {
      for (let index = 1; index < CAMPAIGN_STAGE_IDS.length; index += 1) {
        const fromStageId = CAMPAIGN_STAGE_IDS[index - 1];
        const toStageId = CAMPAIGN_STAGE_IDS[index];
        const from = requireCompactCase(cases, fromStageId, strategyId, 'never');
        const to = requireCompactCase(cases, toStageId, strategyId, 'never');
        const deltaClearCount = to.clearCount - from.clearCount;
        check(
          deltaClearCount * 10_000 <=
            MAX_ADJACENT_CLEAR_RATE_REVERSAL_BP * from.count,
          'holdout-adjacent-stage-clear-rate-curve',
          `${strategyId}/${fromStageId}->${toStageId}/never`,
          'holdout next-stage clear rate does not increase by more than 5 percentage points',
          {
            fromClearCount: from.clearCount,
            toClearCount: to.clearCount,
            fromClearRatePct: ratePct(from.clearCount, from.count),
            toClearRatePct: ratePct(to.clearCount, to.count),
            deltaPp: ratePct(deltaClearCount, from.count),
          },
        );
      }
    }

    for (const stageId of ['STAGE_05', 'STAGE_06'] as const) {
      const compact = requireCompactCase(cases, stageId, strategyId, 'never');
      check(
        compact.clearCount > 0 && compact.clearCount < compact.count,
        'holdout-stage-05-06-clear-window',
        `${stageId}/${strategyId}/never`,
        `holdout clearCount is within [1, ${HOLDOUT_SEED_COUNT - 1}]`,
        compact.clearCount,
      );
    }

    const stage05 = requireCompactCase(cases, 'STAGE_05', strategyId, 'never');
    const stage06 = requireCompactCase(cases, 'STAGE_06', strategyId, 'never');
    check(
      stage06.clearCount <= stage05.clearCount,
      'holdout-stage-06-not-easier-than-stage-05',
      `${strategyId}/STAGE_05->STAGE_06/never`,
      'S06 clearCount does not exceed S05 on the holdout corpus',
      {
        stage05ClearCount: stage05.clearCount,
        stage06ClearCount: stage06.clearCount,
      },
    );
  }

  for (const pair of buildStrategyPairDiagnostics(cases)) {
    check(
      pair.pass,
      'holdout-active-build-trajectory-difference',
      `${pair.leftStrategy}/${pair.rightStrategy}/never`,
      `holdout purchased-effect total-variation distance is at least ${MIN_BUILD_TRAJECTORY_DISTANCE_BP}bp`,
      {
        distanceBp: pair.purchaseDistributionDistanceBp,
        left: pair.leftPurchasesByEffect,
        right: pair.rightPurchasesByEffect,
      },
    );
  }

  for (const stageId of CAMPAIGN_STAGE_IDS) {
    const stageCases = ACTIVE_STRATEGY_IDS.map((strategyId) =>
      requireCompactCase(cases, stageId, strategyId, 'never')
    );
    const clearCounts = stageCases.map((compact) => compact.clearCount);
    const spreadCount = Math.max(...clearCounts) - Math.min(...clearCounts);
    check(
      spreadCount * 10_000 <=
        MAX_ACTIVE_STRATEGY_CLEAR_RATE_SPREAD_BP * HOLDOUT_SEED_COUNT,
      'holdout-active-strategy-clear-rate-spread',
      `${stageId}/never`,
      'holdout skilled strategy clear rates differ by at most 15 percentage points',
      {
        clearCounts: Object.fromEntries(stageCases.map((compact) => [
          compact.strategy,
          compact.clearCount,
        ])),
        spreadCount,
        spreadPp: ratePct(spreadCount, HOLDOUT_SEED_COUNT),
      },
    );
  }

  return { checkCount, failures };
}

const compactCases: CompactCase[] = [];
const stages: Record<string, object> = {};
for (const stageId of CAMPAIGN_STAGE_IDS) {
  const versionBundle = resolveStageBundleForSeed(stageId, seedCorpus[0] ?? 1);
  const cases: object[] = [];
  for (const strategy of STRATEGIES) {
    for (const revivePolicy of REVIVE_POLICIES) {
      const results = seedCorpus.map((seed) =>
        runCampaignStage(stageId, seed, strategy, revivePolicy)
      );
      assert.equal(results.length, SEED_COUNT);
      cases.push(aggregateCase(strategy, revivePolicy, results));
      compactCases.push(compactCaseFromResults(stageId, strategy, revivePolicy, results));
    }
  }
  stages[stageId] = {
    name: versionBundle.stage.name,
    releaseId: versionBundle.releaseId,
    configHash: versionBundle.configHash,
    cases,
  };
}

const noRevivePolicy = REVIVE_POLICIES.find((policy) => policy.id === 'never');
assert.ok(noRevivePolicy, 'Missing no-revive policy for holdout corpus.');
const holdoutCases: CompactCase[] = [];
for (const stageId of CAMPAIGN_STAGE_IDS) {
  for (const strategyId of HUMAN_OPERATION_STRATEGY_IDS) {
    const strategy = STRATEGIES.find((candidate) => candidate.id === strategyId);
    assert.ok(strategy, `Missing holdout strategy ${strategyId}.`);
    const results = holdoutSeedCorpus.map((seed) =>
      runCampaignStage(stageId, seed, strategy, noRevivePolicy)
    );
    assert.equal(results.length, HOLDOUT_SEED_COUNT);
    holdoutCases.push(compactCaseFromResults(stageId, strategy, noRevivePolicy, results));
  }
}

const gateEvaluation = evaluateBalanceGates(compactCases);
const holdoutGateEvaluation = evaluateHoldoutGates(holdoutCases);
const diagnostics = buildBalanceDiagnostics(compactCases);
const gateStatus = gateEvaluation.failures.length === 0 &&
    holdoutGateEvaluation.failures.length === 0
  ? 'passed'
  : 'failed';
const report = {
  schemaVersion: 6,
  status: gateStatus,
  ticksPerSecond: TICKS_PER_SECOND,
  corpus: {
    count: seedCorpus.length,
    generator: `uint32(imul(index + 1, 0x${SEED_MULTIPLIER.toString(16)}))`,
    values: seedCorpus,
    sha256: SEED_CORPUS_HASH,
  },
  holdoutCorpus: {
    count: holdoutSeedCorpus.length,
    generator:
      `uint32(imul(index + 1, 0x${HOLDOUT_SEED_MULTIPLIER.toString(16)}) + 0x${HOLDOUT_SEED_SALT.toString(16)})`,
    values: holdoutSeedCorpus,
    sha256: HOLDOUT_SEED_CORPUS_HASH,
    disjointFromPrimary: true,
  },
  strategies: STRATEGIES.map((strategy) => strategy.id),
  strategyProfiles: STRATEGIES.map((strategy) => ({
    id: strategy.id,
    operationSkill: strategy.operationSkill,
    tacticIntervalTicks: strategy.tacticIntervalTicks ?? null,
    tacticIntervalSeconds: strategy.tacticIntervalTicks === undefined
      ? null
      : strategy.tacticIntervalTicks / TICKS_PER_SECOND,
    targeting: strategy.tacticIntervalTicks === undefined
      ? 'no-operation'
      : 'each-tower-nearest-gate-in-range',
    overdrive: strategy.useOverdrive
      ? 'activate-on-highest-pressure-tower-when-ready'
      : 'unused',
    shop: {
      cadence: 'up-to-configured-purchase-limit-per-wave-after-minimum-price-is-affordable',
      selection: strategy.tiers === undefined
        ? 'projected-throughput-gain-per-war-point'
        : `priority-tiers:${strategy.tiers.map((tier) => tier.join('+')).join('>')};then-gain-per-war-point`,
      rerolls: 'disabled',
    },
  })),
  revivePolicies: REVIVE_POLICIES.map((policy) => policy.id),
  gates: {
    profile: 'campaign-progression-strict-v5',
    checkCount: gateEvaluation.checkCount + holdoutGateEvaluation.checkCount,
    failureCount:
      gateEvaluation.failures.length + holdoutGateEvaluation.failures.length,
    failures: [...gateEvaluation.failures, ...holdoutGateEvaluation.failures],
    primary: gateEvaluation,
    holdout: holdoutGateEvaluation,
  },
  diagnostics,
  holdoutCases,
  stages,
};

const runtimeProcess = (globalThis as typeof globalThis & {
  process?: {
    env?: Record<string, string | undefined>;
    exitCode?: number;
  };
}).process;
const summaryOnly = runtimeProcess?.env?.CAMPAIGN_BALANCE_SUMMARY === '1';
console.log(JSON.stringify(summaryOnly ? {
  status: report.status,
  corpus: report.corpus,
  holdoutCorpus: report.holdoutCorpus,
  gates: report.gates,
  diagnostics: report.diagnostics,
  cases: compactCases,
  holdoutCases,
} : report, null, 2));
if (gateStatus === 'failed' && runtimeProcess !== undefined) {
  runtimeProcess.exitCode = 1;
}
