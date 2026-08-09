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
] as const satisfies readonly CardEffectId[];

const CARD_QUALITIES = ['G', 'B', 'P'] as const satisfies readonly CardDefinition['quality'][];
const QUALITY_RANK: Record<CardDefinition['quality'], number> = { G: 0, B: 1, P: 2 };
const SEED_COUNT = 64;
const SEED_MULTIPLIER = 0x9e37_79b1;
const SEED_CORPUS_HASH = '4d3f95bc53db958f05825f2829d0247425ea8a98b24bcff4594e0c46920f7dda';
const SIMULATION_CHUNK_TICKS = 900;
const SIMULATION_TICK_BUDGET = 180_000;
const KILL_BURST_WINDOW_TICKS = 3 * TICKS_PER_SECOND;
const SKILLED_TACTIC_INTERVAL_TICKS = 3 * TICKS_PER_SECOND;
const MEDIUM_TACTIC_INTERVAL_TICKS = 6 * TICKS_PER_SECOND;
const U16_TURN = 65_536;
const TOWER_IDS = [0, 1, 2] as const satisfies readonly TowerId[];

type StrategyId = 'first-card' | 'single-target' | 'volley-penetration' | 'greedy-throughput';
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
    id: 'single-target',
    operationSkill: 'skilled',
    tacticIntervalTicks: SKILLED_TACTIC_INTERVAL_TICKS,
    useOverdrive: true,
    tiers: [
      ['tower-damage', 'tower-frequency'],
      ['crit-rate', 'crit-damage'],
      ['arrow-count'],
      ['penetration'],
    ],
  },
  {
    id: 'volley-penetration',
    operationSkill: 'medium',
    tacticIntervalTicks: MEDIUM_TACTIC_INTERVAL_TICKS,
    useOverdrive: true,
    tiers: [
      ['arrow-count', 'penetration'],
      ['tower-frequency', 'tower-damage'],
      ['crit-rate', 'crit-damage'],
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
  overdriveActivationsByTower: [number, number, number];
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
  overdriveActivationsByTower: [number, number, number];
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

function cardDefinition(bundle: BattleBundleV1, cardId: string): CardDefinition {
  const card = bundle.cards.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}.`);
  return card;
}

function activeTier(
  strategy: Strategy,
  eligibleEffectIds: readonly CardEffectId[],
): readonly CardEffectId[] {
  return strategy.tiers
    ?.find((tier) => tier.some((effectId) => eligibleEffectIds.includes(effectId)))
    ?.filter((effectId) => eligibleEffectIds.includes(effectId)) ?? [];
}

function tierIndex(strategy: Strategy, effectId: CardEffectId): number {
  const index = strategy.tiers?.findIndex((tier) => tier.includes(effectId)) ?? -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
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

function greedyImprovementBp(hud: HudProjectionV1, cardId: string): number {
  const preview = hud.offerPreviews?.find((candidate) => candidate.cardId === cardId);
  if (!preview) return Number.NEGATIVE_INFINITY;
  const before = throughputScore(preview.before);
  const after = throughputScore(preview.after);
  return before <= 0 ? Number.POSITIVE_INFINITY : ((after - before) * 10_000) / before;
}

function shouldReroll(
  bundle: BattleBundleV1,
  strategy: Strategy,
  eligibleEffectIds: readonly CardEffectId[],
  offer: OfferGranted,
  hud: HudProjectionV1,
): boolean {
  if (strategy.id === 'first-card') return false;
  if (strategy.id === 'greedy-throughput') {
    const bestImprovementBp = Math.max(
      ...offer.cards.map((cardId) => greedyImprovementBp(hud, cardId)),
    );
    return bestImprovementBp < 500;
  }
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
  const first = offer.cards[0];
  if (!first) throw new Error(`Offer ${offer.offerId} contains no selectable card.`);
  if (strategy.id === 'first-card') return first;

  const previews = new Map(
    (hud.offerPreviews ?? []).map((preview) => [preview.cardId, preview]),
  );
  const ranked = [...offer.cards].sort((leftId, rightId) => {
    const left = cardDefinition(bundle, leftId);
    const right = cardDefinition(bundle, rightId);
    const cappedOrder = Number(previews.get(leftId)?.capped ?? false) -
      Number(previews.get(rightId)?.capped ?? false);
    const qualityOrder = QUALITY_RANK[right.quality] - QUALITY_RANK[left.quality];
    const valueOrder = (right.valueBp ?? right.valueInt ?? 0) -
      (left.valueBp ?? left.valueInt ?? 0);

    if (strategy.id === 'greedy-throughput') {
      return greedyImprovementBp(hud, rightId) - greedyImprovementBp(hud, leftId) ||
        cappedOrder || qualityOrder || valueOrder || left.id.localeCompare(right.id);
    }

    const leftTier = tierIndex(strategy, left.effectId);
    const rightTier = tierIndex(strategy, right.effectId);
    const leftEffectRank = strategy.tiers?.[leftTier]?.indexOf(left.effectId) ?? -1;
    const rightEffectRank = strategy.tiers?.[rightTier]?.indexOf(right.effectId) ?? -1;
    return leftTier - rightTier || cappedOrder || qualityOrder ||
      leftEffectRank - rightEffectRank || valueOrder || left.id.localeCompare(right.id);
  });
  return ranked[0] ?? first;
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
      overdriveActivationsByTower: [0, 0, 0],
    },
    rerollsUsed: 0,
    revivesGranted: 0,
    choicesByEffect: emptyEffectCounts(),
    choicesByQuality: emptyQualityCounts(),
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
  strategy: Strategy,
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

      let offer = harness.authority.requestOffer(
        request.ordinal,
        undefined,
        request.eligibleEffectIds,
      );
      queue.push(harness.simulation.applyAuthorityEvent(offer));
      if (
        harness.authority.getRerollsRemaining(request.ordinal) > 0 &&
        shouldReroll(
          harness.bundle,
          strategy,
          request.eligibleEffectIds,
          offer,
          harness.simulation.getHudProjection(),
        )
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
      const selectedCard = cardDefinition(harness.bundle, selectedCardId);
      harness.choicesByEffect[selectedCard.effectId] += 1;
      harness.choicesByQuality[selectedCard.quality] += 1;
      queue.push(
        harness.simulation.applyAuthorityEvent(
          harness.authority.acceptChoice(offer.offerId, selectedCardId),
        ),
      );
    }
  }
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
  return TOWER_IDS.map((towerId) => {
    const anchor = harness.bundle.route.towerAnchors[towerId];
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
  const output = harness.simulation.applyCommand(command);
  assert.equal(output.commandAcks.length, 1, `${command.type} did not produce exactly one ack.`);
  const ack = output.commandAcks[0];
  assert.equal(ack?.seq, command.seq, `${command.type} ack sequence diverged.`);
  assert.equal(ack?.status, 'applied', `${command.type} command ${command.seq} was rejected.`);
  if (command.type === 'SET_AIM') harness.metrics.aimCommandsApplied += 1;
  if (command.type === 'ACTIVATE_OVERDRIVE') harness.metrics.overdriveCommandsApplied += 1;
  drainFlowQueue(harness, strategy, reviveLimit, output);
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
    const anchor = harness.bundle.route.towerAnchors[pressure.towerId];
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

  while (remainingTicks > 0) {
    let before = harness.simulation.getHudProjection();
    if (before.flowState === 'result' || before.flowState === 'defeat-pending') break;
    assert.equal(before.flowState, 'running', `${stageId} stalled in ${before.flowState}.`);
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
      ? SIMULATION_CHUNK_TICKS
      : Math.max(1, harness.nextTacticTick - before.tick);
    const output = harness.simulation.advanceTicks(
      Math.min(SIMULATION_CHUNK_TICKS, remainingTicks, ticksUntilNextTactic),
    );
    remainingTicks -= output.ticksAdvanced;
    drainFlowQueue(harness, strategy, revivePolicy.limit, output);
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

const seedCorpus = buildSeedCorpus();
assert.equal(seedCorpus.length, SEED_COUNT);
assert.equal(new Set(seedCorpus).size, SEED_COUNT, 'Campaign balance seeds must be unique.');
assert.equal(
  createHash('sha256').update(seedCorpus.join(',')).digest('hex'),
  SEED_CORPUS_HASH,
  'The fixed campaign balance seed corpus changed.',
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
const POWER_STRATEGY_IDS = [
  'volley-penetration',
  'greedy-throughput',
] as const satisfies readonly StrategyId[];

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
      const neverFailureCount = SEED_COUNT - never.clearCount;
      const rescuedByRevive = once.clearCount - never.clearCount;
      const reviveUpliftCeiling = Math.max(16, Math.floor(neverFailureCount * 0.8));
      check(
        rescuedByRevive <= reviveUpliftCeiling,
        'revive-uplift-ceiling',
        pairScope,
        'rescued seeds are at most max(16, floor(80% of never failures))',
        {
          never: never.clearCount,
          once: once.clearCount,
          neverFailureCount,
          rescuedByRevive,
          ceiling: reviveUpliftCeiling,
        },
      );
      if (
        never.clearCount <= SEED_COUNT - 8 &&
        ACTIVE_STRATEGY_IDS.includes(strategy.id as (typeof ACTIVE_STRATEGY_IDS)[number])
      ) {
        check(
          once.clearCount > never.clearCount,
          'revive-has-benefit',
          pairScope,
          'one revive rescues at least one seed when eight or more never runs fail',
          { never: never.clearCount, once: once.clearCount },
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
          (compact.failureWaves['1'] ?? 0) === 0,
          'no-wave-1-failure',
          scope,
          'zero failures at wave 1',
          compact.failureWaves,
        );
        check(
          (compact.failureWaves.unknown ?? 0) === 0,
          'known-failure-wave',
          scope,
          'all failures have a known wave',
          compact.failureWaves,
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

  const stage01Minimums: Record<StrategyId, number> = {
    'first-card': 32,
    'single-target': 32,
    'volley-penetration': 32,
    'greedy-throughput': 32,
  };
  for (const strategy of STRATEGIES) {
    const stage01 = requireCompactCase(cases, 'STAGE_01', strategy.id, 'never');
    check(
      stage01.clearCount >= stage01Minimums[strategy.id] && stage01.clearCount < SEED_COUNT,
      'stage-01-clear-window',
      `STAGE_01/${strategy.id}/never`,
      `clearCount is within [${stage01Minimums[strategy.id]}, 63]`,
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
      compactCases.push({
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
      });
    }
  }
  stages[stageId] = {
    name: versionBundle.stage.name,
    releaseId: versionBundle.releaseId,
    configHash: versionBundle.configHash,
    cases,
  };
}

const gateEvaluation = evaluateBalanceGates(compactCases);
const gateStatus = gateEvaluation.failures.length === 0 ? 'passed' : 'failed';
const report = {
  schemaVersion: 2,
  status: gateStatus,
  ticksPerSecond: TICKS_PER_SECOND,
  corpus: {
    count: seedCorpus.length,
    generator: `uint32(imul(index + 1, 0x${SEED_MULTIPLIER.toString(16)}))`,
    values: seedCorpus,
    sha256: SEED_CORPUS_HASH,
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
  })),
  revivePolicies: REVIVE_POLICIES.map((policy) => policy.id),
  gates: {
    profile: 'campaign-balance-wide-v1',
    checkCount: gateEvaluation.checkCount,
    failureCount: gateEvaluation.failures.length,
    failures: gateEvaluation.failures,
  },
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
  gates: report.gates,
  cases: compactCases,
} : report, null, 2));
if (gateStatus === 'failed' && runtimeProcess !== undefined) {
  runtimeProcess.exitCode = 1;
}
