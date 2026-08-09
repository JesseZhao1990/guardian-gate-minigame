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
  type CardDefinition,
  type CardEffectId,
  type EndlessSettlementReason,
  type HudProjectionV1,
  type OfferGranted,
} from '../src/core/contracts';
import { LocalPracticeAuthority } from '../src/core/local-authority';

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

const ROUTE_IDS = [
  'ROUTE_STAGE_08_ABYSS_A',
  'ROUTE_STAGE_08_ABYSS_B',
  'ROUTE_STAGE_08_ABYSS_C',
] as const;
type EndlessRouteId = (typeof ROUTE_IDS)[number];

const BALANCE_SEEDS_PER_ROUTE = 96;
const ATTACK_SEEDS_PER_ROUTE = 32;
const BALANCE_SEED_HASH = '2c0063b270b5ad825584e716b51ad412f325610471b0955619b3d9a8ca008e0b';
const SIMULATION_CHUNK_TICKS = 900;
const FOUR_MINUTES_TICKS = 4 * 60 * TICKS_PER_SECOND;

interface Strategy {
  id: 'attack-speed' | 'volley-penetration';
  tiers: readonly (readonly CardEffectId[])[];
}

const ATTACK_SPEED_STRATEGY: Strategy = {
  id: 'attack-speed',
  tiers: [
    ['tower-damage', 'tower-frequency'],
    ['crit-rate', 'crit-damage'],
    ['arrow-count', 'penetration'],
  ],
};

const VOLLEY_PENETRATION_STRATEGY: Strategy = {
  id: 'volley-penetration',
  tiers: [
    ['arrow-count', 'penetration'],
    ['tower-frequency', 'tower-damage'],
    ['crit-rate', 'crit-damage'],
  ],
};

const QUALITY_RANK = { G: 0, B: 1, P: 2 } as const;

interface SeedCorpus {
  all: number[];
  byRoute: Map<EndlessRouteId, number[]>;
}

interface Harness {
  bundle: BattleBundleV1;
  simulation: BattleSimulation;
  authority: LocalPracticeAuthority;
  rerollsUsed: number;
  choicesByEffect: Partial<Record<CardEffectId, number>>;
}

interface StrategyResult {
  seed: number;
  routeId: EndlessRouteId;
  terminalTick: number;
  settlementReason: EndlessSettlementReason;
  reachedBoss: boolean;
  full: boolean;
  level: number;
  revivesUsed: number;
  rerollsUsed: number;
  bossLayer: number;
  bossDamageMilli: number;
  choicesByEffect: Partial<Record<CardEffectId, number>>;
}

interface TickDistribution {
  min: number | null;
  p10: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
}

interface RouteMetrics {
  count: number;
  bossCount: number;
  bossRate: number;
  fullCount: number;
  fullRate: number;
  breachCount: number;
  breachTicks: TickDistribution;
}

interface StrategyMetrics extends RouteMetrics {
  routeBossSpread: number;
  routeFullSpread: number;
  routes: Record<EndlessRouteId, RouteMetrics>;
  averageRerolls: number;
  reviveCount: number;
  lostBeforeBoss: number;
  lostAfterBoss: number;
  choicesByEffect: Partial<Record<CardEffectId, number>>;
}

function isRouteId(value: string): value is EndlessRouteId {
  return (ROUTE_IDS as readonly string[]).includes(value);
}

function buildSeedCorpus(): SeedCorpus {
  const byRoute = new Map<EndlessRouteId, number[]>(
    ROUTE_IDS.map((routeId) => [routeId, []]),
  );

  for (let index = 0; index < 10_000; index += 1) {
    const seed = Math.imul(index + 1, 0x9e37_79b1) >>> 0;
    const routeId = resolveStageBundleForSeed('STAGE_08', seed).route.id;
    if (!isRouteId(routeId)) {
      throw new Error(`Unexpected Stage 08 route ${routeId}.`);
    }
    const routeSeeds = byRoute.get(routeId);
    if (!routeSeeds) throw new Error(`Missing seed bucket for ${routeId}.`);
    if (routeSeeds.length < BALANCE_SEEDS_PER_ROUTE) routeSeeds.push(seed);
    if (ROUTE_IDS.every((id) => (byRoute.get(id)?.length ?? 0) === BALANCE_SEEDS_PER_ROUTE)) {
      const all = ROUTE_IDS.flatMap((id) => byRoute.get(id) ?? []);
      return { all, byRoute };
    }
  }

  throw new Error('Unable to build the route-balanced Stage 08 seed corpus.');
}

function cardDefinition(bundle: BattleBundleV1, cardId: string): CardDefinition {
  const card = bundle.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}.`);
  return card;
}

function strategyTierIndex(strategy: Strategy, effectId: CardEffectId): number {
  const index = strategy.tiers.findIndex((tier) => tier.includes(effectId));
  if (index < 0) throw new Error(`Strategy ${strategy.id} does not rank ${effectId}.`);
  return index;
}

function activeTier(
  strategy: Strategy,
  eligibleEffectIds: readonly CardEffectId[],
): readonly CardEffectId[] {
  return strategy.tiers
    .find((tier) => tier.some((effectId) => eligibleEffectIds.includes(effectId)))
    ?.filter((effectId) => eligibleEffectIds.includes(effectId)) ?? [];
}

function shouldReroll(
  bundle: BattleBundleV1,
  strategy: Strategy,
  eligibleEffectIds: readonly CardEffectId[],
  offer: OfferGranted,
): boolean {
  const wantedEffects = activeTier(strategy, eligibleEffectIds);
  return wantedEffects.length > 0 && !offer.cards.some((cardId) =>
    wantedEffects.includes(cardDefinition(bundle, cardId).effectId)
  );
}

function chooseCard(
  bundle: BattleBundleV1,
  strategy: Strategy,
  hud: HudProjectionV1,
  offer: OfferGranted,
): string {
  const previews = new Map(
    (hud.offerPreviews ?? []).map((preview) => [preview.cardId, preview]),
  );
  const ranked = [...offer.cards].sort((leftId, rightId) => {
    const left = cardDefinition(bundle, leftId);
    const right = cardDefinition(bundle, rightId);
    const leftTier = strategyTierIndex(strategy, left.effectId);
    const rightTier = strategyTierIndex(strategy, right.effectId);
    const leftEffectRank = strategy.tiers[leftTier]?.indexOf(left.effectId) ?? -1;
    const rightEffectRank = strategy.tiers[rightTier]?.indexOf(right.effectId) ?? -1;
    const leftValue = left.valueBp ?? left.valueInt ?? 0;
    const rightValue = right.valueBp ?? right.valueInt ?? 0;

    return leftTier - rightTier ||
      QUALITY_RANK[right.quality] - QUALITY_RANK[left.quality] ||
      Number(previews.get(leftId)?.capped ?? false) -
        Number(previews.get(rightId)?.capped ?? false) ||
      leftEffectRank - rightEffectRank ||
      rightValue - leftValue ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
  const selected = ranked[0];
  if (!selected) throw new Error(`Offer ${offer.offerId} contains no selectable card.`);
  return selected;
}

function createHarness(bundle: BattleBundleV1, seed: number): Harness {
  assert.equal(bundle.rules.maxRevives, 1, 'Stage 08 balance smoke expects exactly one revive.');
  return {
    bundle,
    simulation: createBattleSimulation(bundle, seed),
    authority: new LocalPracticeAuthority(bundle, seed),
    rerollsUsed: 0,
    choicesByEffect: {},
  };
}

function drainFlowQueue(
  harness: Harness,
  strategy: Strategy,
  initialOutput: SimulationOutput,
): void {
  const queue = [initialOutput];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const output = queue[cursor];
    if (!output) continue;
    for (const request of output.flowRequests) {
      if (request.type === 'REVIVE') {
        assert.equal(request.ordinal, 1, 'Stage 08 may request only its single revive.');
        queue.push(
          harness.simulation.applyAuthorityEvent(
            harness.authority.grantRevive(request.ordinal),
          ),
        );
        continue;
      }

      let offer = harness.authority.requestOffer(
        request.ordinal,
        undefined,
        request.eligibleEffectIds,
      );
      queue.push(harness.simulation.applyAuthorityEvent(offer));
      if (
        shouldReroll(
          harness.bundle,
          strategy,
          request.eligibleEffectIds,
          offer,
        ) &&
        harness.authority.getRerollsRemaining(request.ordinal) > 0
      ) {
        offer = harness.authority.requestOffer(
          request.ordinal,
          offer.offerId,
          request.eligibleEffectIds,
        );
        queue.push(harness.simulation.applyAuthorityEvent(offer));
        harness.rerollsUsed += 1;
      }

      const selectedCardId = chooseCard(
        harness.bundle,
        strategy,
        harness.simulation.getHudProjection(),
        offer,
      );
      const effectId = cardDefinition(harness.bundle, selectedCardId).effectId;
      harness.choicesByEffect[effectId] = (harness.choicesByEffect[effectId] ?? 0) + 1;
      queue.push(
        harness.simulation.applyAuthorityEvent(
          harness.authority.acceptChoice(offer.offerId, selectedCardId),
        ),
      );
    }
  }
}

function advanceHarnessToTick(
  harness: Harness,
  strategy: Strategy,
  targetTick: number,
): void {
  while (
    harness.simulation.getHudProjection().tick < targetTick &&
    harness.simulation.getHudProjection().flowState !== 'result'
  ) {
    const before = harness.simulation.getHudProjection();
    const ticks = Math.min(SIMULATION_CHUNK_TICKS, targetTick - before.tick);
    drainFlowQueue(harness, strategy, harness.simulation.advanceTicks(ticks));
    const after = harness.simulation.getHudProjection();
    if (after.tick === before.tick && after.flowState !== 'result') {
      throw new Error(
        `Strategy ${strategy.id} stalled at tick ${after.tick} in ${after.flowState}.`,
      );
    }
  }
}

function runStrategy(seed: number, strategy: Strategy): StrategyResult {
  const bundle = resolveStageBundleForSeed('STAGE_08', seed);
  const rules = bundle.endless;
  assert.ok(rules, 'Stage 08 balance smoke requires endless rules.');
  const harness = createHarness(bundle, seed);
  advanceHarnessToTick(harness, strategy, rules.settlementTick);
  const hud = harness.simulation.getHudProjection();
  const endless = hud.endless;
  assert.ok(endless, 'Stage 08 balance smoke requires endless HUD data.');
  assert.equal(hud.flowState, 'result', `Seed ${seed} did not reach a terminal result.`);
  assert.ok(endless.settlementReason, `Seed ${seed} has no settlement reason.`);
  assert.ok(isRouteId(endless.routeId), `Seed ${seed} resolved to ${endless.routeId}.`);

  const full =
    hud.flowState === 'result' &&
    hud.outcome === 'settled' &&
    endless.phase === 'settled' &&
    endless.settlementReason === 'time-limit' &&
    hud.tick === rules.settlementTick &&
    endless.reachedBoss &&
    endless.survivalTick === rules.bossPhaseTick;

  return {
    seed,
    routeId: endless.routeId,
    terminalTick: hud.tick,
    settlementReason: endless.settlementReason,
    reachedBoss: endless.reachedBoss,
    full,
    level: hud.level,
    revivesUsed: hud.revivesUsed,
    rerollsUsed: harness.rerollsUsed,
    bossLayer: endless.bossLayer,
    bossDamageMilli: endless.bossDamageMilli,
    choicesByEffect: { ...harness.choicesByEffect },
  };
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

function tickDistribution(values: readonly number[]): TickDistribution {
  return {
    min: percentile(values, 0),
    p10: percentile(values, 0.1),
    p25: percentile(values, 0.25),
    median: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
    max: percentile(values, 1),
  };
}

function routeMetrics(results: readonly StrategyResult[]): RouteMetrics {
  const bossCount = results.filter((result) => result.reachedBoss).length;
  const fullCount = results.filter((result) => result.full).length;
  const breaches = results.filter((result) => result.settlementReason === 'breach');
  return {
    count: results.length,
    bossCount,
    bossRate: bossCount / results.length,
    fullCount,
    fullRate: fullCount / results.length,
    breachCount: breaches.length,
    breachTicks: tickDistribution(breaches.map((result) => result.terminalTick)),
  };
}

function strategyMetrics(results: readonly StrategyResult[]): StrategyMetrics {
  const overall = routeMetrics(results);
  const routes = Object.fromEntries(
    ROUTE_IDS.map((routeId) => [
      routeId,
      routeMetrics(results.filter((result) => result.routeId === routeId)),
    ]),
  ) as Record<EndlessRouteId, RouteMetrics>;
  const routeBossRates = ROUTE_IDS.map((routeId) => routes[routeId].bossRate);
  const routeFullRates = ROUTE_IDS.map((routeId) => routes[routeId].fullRate);
  const choicesByEffect: Partial<Record<CardEffectId, number>> = {};
  for (const result of results) {
    for (const [effectId, count] of Object.entries(result.choicesByEffect)) {
      const typedEffectId = effectId as CardEffectId;
      choicesByEffect[typedEffectId] = (choicesByEffect[typedEffectId] ?? 0) + count;
    }
  }

  return {
    ...overall,
    routeBossSpread: Math.max(...routeBossRates) - Math.min(...routeBossRates),
    routeFullSpread: Math.max(...routeFullRates) - Math.min(...routeFullRates),
    routes,
    averageRerolls:
      results.reduce((sum, result) => sum + result.rerollsUsed, 0) / results.length,
    reviveCount: results.filter((result) => result.revivesUsed === 1).length,
    lostBeforeBoss: results.filter(
      (result) => result.settlementReason === 'breach' && !result.reachedBoss,
    ).length,
    lostAfterBoss: results.filter(
      (result) => result.settlementReason === 'breach' && result.reachedBoss,
    ).length,
    choicesByEffect,
  };
}

function runGodClearLevel(seed: number): number {
  const bundle = resolveStageBundleForSeed('STAGE_08', seed);
  const rules = bundle.endless;
  assert.ok(rules, 'God-clear probe requires Stage 08 endless rules.');
  bundle.tower.baseDamageMilli = 3_000_000_000;
  bundle.tower.attackIntervalTicks = 6;
  bundle.tower.rangePx = 5_000;
  bundle.tower.projectileSpeedPxPerSecond = 100_000;
  bundle.tower.critChanceBp = 0;
  const harness = createHarness(bundle, seed);
  advanceHarnessToTick(harness, VOLLEY_PENETRATION_STRATEGY, rules.bossPhaseTick);
  const hud = harness.simulation.getHudProjection();
  assert.equal(hud.tick, rules.bossPhaseTick, `God-clear seed ${seed} missed the boss tick.`);
  assert.equal(hud.endless?.reachedBoss, true, `God-clear seed ${seed} did not reach the boss.`);
  return hud.level;
}

function displayRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const seedCorpus = buildSeedCorpus();
assert.equal(seedCorpus.all.length, ROUTE_IDS.length * BALANCE_SEEDS_PER_ROUTE);
assert.equal(new Set(seedCorpus.all).size, seedCorpus.all.length, 'Balance seeds must be unique.');
for (const routeId of ROUTE_IDS) {
  assert.equal(seedCorpus.byRoute.get(routeId)?.length, BALANCE_SEEDS_PER_ROUTE);
}
assert.equal(
  createHash('sha256').update(seedCorpus.all.join(',')).digest('hex'),
  BALANCE_SEED_HASH,
  'The fixed Stage 08 balance corpus changed.',
);

const multiResults = seedCorpus.all.map((seed) =>
  runStrategy(seed, VOLLEY_PENETRATION_STRATEGY)
);
const multiMetrics = strategyMetrics(multiResults);
assert.ok(
  multiMetrics.bossRate >= 0.6 && multiMetrics.bossRate <= 0.85,
  `Multi-arrow Boss rate ${displayRate(multiMetrics.bossRate)} is outside 60–85%.`,
);
assert.ok(
  multiMetrics.fullRate >= 0.15 && multiMetrics.fullRate <= 0.35,
  `Multi-arrow full rate ${displayRate(multiMetrics.fullRate)} is outside 15–35%.`,
);
assert.ok(
  multiMetrics.routeBossSpread <= 0.1,
  `Multi-arrow route Boss spread ${displayRate(multiMetrics.routeBossSpread)} exceeds 10pp.`,
);
for (const routeId of ROUTE_IDS) {
  assert.equal(multiMetrics.routes[routeId].count, BALANCE_SEEDS_PER_ROUTE);
}

const attackSeeds = ROUTE_IDS.flatMap((routeId) =>
  (seedCorpus.byRoute.get(routeId) ?? []).slice(0, ATTACK_SEEDS_PER_ROUTE)
);
const attackResults = attackSeeds.map((seed) => runStrategy(seed, ATTACK_SPEED_STRATEGY));
const attackMetrics = strategyMetrics(attackResults);
const attackBreachTicks = attackResults
  .filter((result) => result.settlementReason === 'breach')
  .map((result) => result.terminalTick);
const attackTicks = tickDistribution(attackBreachTicks);
assert.equal(attackMetrics.bossCount, 0, 'Attack-speed representative must not reach the Boss.');
assert.equal(
  attackMetrics.breachCount,
  attackResults.length,
  'Every attack-speed representative must settle by breach.',
);
assert.equal(
  attackBreachTicks.filter((tick) => tick < FOUR_MINUTES_TICKS).length,
  0,
  'Attack-speed representative must not fail before four minutes.',
);
assert.ok(
  attackTicks.p10 !== null && attackTicks.p10 >= 14_400,
  `Attack-speed p10 ${String(attackTicks.p10)} is below tick 14400.`,
);
assert.ok(
  attackTicks.median !== null && attackTicks.median >= 21_600 && attackTicks.median <= 28_800,
  `Attack-speed median ${String(attackTicks.median)} is outside tick 21600–28800.`,
);
for (const routeId of ROUTE_IDS) {
  assert.equal(attackMetrics.routes[routeId].count, ATTACK_SEEDS_PER_ROUTE);
}

const godClearLevels = Array.from({ length: 30 }, (_, index) =>
  runGodClearLevel((0x8000_0000 + index) >>> 0)
);
for (const [index, level] of godClearLevels.entries()) {
  assert.ok(
    level >= 35 && level <= 42,
    `God-clear seed ${0x8000_0000 + index} reached level ${level}, outside 35–42.`,
  );
}

const report = {
  configHash: resolveStageBundleForSeed('STAGE_08', seedCorpus.all[0] ?? 0).configHash,
  corpus: {
    count: seedCorpus.all.length,
    perRoute: BALANCE_SEEDS_PER_ROUTE,
    sha256: BALANCE_SEED_HASH,
  },
  multi: {
    ...multiMetrics,
    bossRateDisplay: displayRate(multiMetrics.bossRate),
    fullRateDisplay: displayRate(multiMetrics.fullRate),
    routeBossSpreadDisplay: displayRate(multiMetrics.routeBossSpread),
  },
  attackRepresentative: {
    ...attackMetrics,
    p10: attackTicks.p10,
    median: attackTicks.median,
    failuresBeforeFourMinutes: attackBreachTicks.filter(
      (tick) => tick < FOUR_MINUTES_TICKS
    ).length,
  },
  godClearLevels: {
    count: godClearLevels.length,
    min: Math.min(...godClearLevels),
    median: percentile(godClearLevels, 0.5),
    max: Math.max(...godClearLevels),
  },
};

console.log('✓ Stage 08 真实重抽策略平衡门禁通过');
console.log(JSON.stringify(report, null, 2));
