import {
  createBattleSimulation,
  type BattleSimulation,
} from '../src/core/battle-sim';
import { createStage01Bundle } from '../src/core/content';
import type {
  AuthorityEventV1,
  BattleEvent,
  EffectiveTowerStatsV1,
} from '../src/core/contracts';

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

const expectedBaseStats: EffectiveTowerStatsV1 = {
  damagePerArrowMilli: 24_000,
  criticalDamagePerArrowMilli: 36_000,
  attackIntervalTicks: 24,
  attackRateMilliPerSecond: 1_250,
  rangePx: 360,
  arrowCount: 1,
  penetrationCount: 0,
  penetrationRetentionBp: 7_000,
  critChanceBp: 500,
  critDamageBp: 15_000,
};

const initialSimulation = createBattleSimulation(createStage01Bundle(), 0x57a75);
const initialHud = initialSimulation.getHudProjection();
assert.deepEqual(initialHud.towerStats, {
  base: expectedBaseStats,
  afterLevel: expectedBaseStats,
  current: expectedBaseStats,
});
assert.deepEqual(
  initialHud.towerRuntime.map((tower) => ({
    towerId: tower.towerId,
    enemiesInRange: tower.enemiesInRange,
    preferredEnemiesInRange: tower.preferredEnemiesInRange,
  })),
  [
    { towerId: 0, enemiesInRange: 0, preferredEnemiesInRange: 0 },
    { towerId: 1, enemiesInRange: 0, preferredEnemiesInRange: 0 },
    { towerId: 2, enemiesInRange: 0, preferredEnemiesInRange: 0 },
  ],
);
assert.equal(initialHud.offerPreviews, undefined);

function applyAuthority(simulation: BattleSimulation, event: AuthorityEventV1): void {
  simulation.applyAuthorityEvent(event);
}

const hitBundle = createStage01Bundle();
hitBundle.tower.rangePx = 5_000;
hitBundle.tower.projectileSpeedPxPerSecond = 5_000;
hitBundle.tower.baseDamageMilli = 1_000;
hitBundle.tower.critChanceBp = 0;
const hitWave = hitBundle.waves[0];
const hitEnemy = hitBundle.enemies.MON_SWIFT_EEL;
if (!hitWave || !hitEnemy) throw new Error('HIT projection probe requires Stage 01 wave and enemy.');
hitWave.groups = [{ enemyId: hitEnemy.id, count: 2, intervalTicks: 1 }];
hitEnemy.maxHpMilli = 100_000;
hitEnemy.armorBp = 0;
const hitSimulation = createBattleSimulation(hitBundle, 0x117da7a);
const hitEvents: Array<Extract<BattleEvent, { type: 'HIT' }>> = [];
for (let tick = 0; tick < 180 && hitEvents.length === 0; tick += 1) {
  const output = hitSimulation.advanceTicks(1);
  hitEvents.push(...output.events.filter(
    (event): event is Extract<BattleEvent, { type: 'HIT' }> => event.type === 'HIT',
  ));
}
assert.ok(hitEvents.length > 0);
for (const hit of hitEvents) {
  assert.ok(hit.towerId === 0 || hit.towerId === 1 || hit.towerId === 2);
  assert.ok(Number.isSafeInteger(hit.penetrationIndex) && hit.penetrationIndex >= 0);
  assert.ok(Number.isFinite(hit.impactX));
  assert.ok(Number.isFinite(hit.impactY));
  assert.ok(hit.damageMilli > 0);
}
assert.equal(
  hitSimulation.getHudProjection().damageDealtMilli,
  hitEvents.reduce((sum, hit) => sum + hit.damageMilli, 0),
);
const runtimeWithTargets = hitSimulation.getHudProjection().towerRuntime;
assert.equal(runtimeWithTargets.length, 3);
assert.ok(runtimeWithTargets.every((tower) => tower.enemiesInRange > 0));
assert.ok(runtimeWithTargets.every((tower) => tower.currentTargetEntityId !== undefined));
assert.ok(runtimeWithTargets.every((tower) => tower.currentTargetName === hitEnemy.name));

const previewBundle = createStage01Bundle();
previewBundle.tower.rangePx = 5_000;
previewBundle.tower.projectileSpeedPxPerSecond = 5_000;
previewBundle.tower.critChanceBp = 0;
const previewWave = previewBundle.waves[0];
const previewEnemy = previewBundle.enemies.MON_SWIFT_EEL;
if (!previewWave || !previewEnemy) throw new Error('Offer preview probe requires Stage 01 wave and enemy.');
previewWave.groups = [{ enemyId: previewEnemy.id, count: 1, intervalTicks: 1 }];
previewEnemy.maxHpMilli = 1;
previewEnemy.armorBp = 0;
previewEnemy.exp = 100;

const previewSimulation = createBattleSimulation(previewBundle, 0xc4ad5);
let offerOrdinal: number | undefined;
for (let tick = 0; tick < 180 && offerOrdinal === undefined; tick += 1) {
  const output = previewSimulation.advanceTicks(1);
  const request = output.flowRequests.find((candidate) => candidate.type === 'OFFER');
  if (request?.type === 'OFFER') offerOrdinal = request.ordinal;
}
assert.ok(offerOrdinal !== undefined);
const previewCards = [
  'CARD_BASIC_DAMAGE_P',
  'CARD_BASIC_FREQUENCY_P',
  'CARD_BASIC_ARROW_COUNT_P',
] as const;
applyAuthority(previewSimulation, {
  type: 'OFFER_GRANTED',
  authoritySeq: 1,
  authorizationId: 'projection-probe-grant',
  offerId: `projection-probe-${offerOrdinal}`,
  cards: [...previewCards],
});
const pendingHud = previewSimulation.getHudProjection();
assert.equal(pendingHud.flowState, 'offer-pending');
assert.equal(pendingHud.offerPreviews?.length, 3);
const damagePreview = pendingHud.offerPreviews?.find((preview) => preview.cardId === previewCards[0]);
const frequencyPreview = pendingHud.offerPreviews?.find((preview) => preview.cardId === previewCards[1]);
const arrowPreview = pendingHud.offerPreviews?.find((preview) => preview.cardId === previewCards[2]);
if (!damagePreview || !frequencyPreview || !arrowPreview) {
  throw new Error('All three projection previews must be present.');
}
assert.deepEqual(damagePreview.before, pendingHud.towerStats.current);
assert.equal(damagePreview.after.damagePerArrowMilli, 28_800);
assert.equal(damagePreview.after.criticalDamagePerArrowMilli, 43_200);
assert.equal(damagePreview.capped, false);
assert.equal(frequencyPreview.after.attackIntervalTicks, 21);
assert.equal(frequencyPreview.after.attackRateMilliPerSecond, 1_429);
assert.equal(frequencyPreview.capped, false);
assert.equal(arrowPreview.after.arrowCount, 3);
assert.equal(arrowPreview.after.damagePerArrowMilli, 19_200);
assert.equal(arrowPreview.after.criticalDamagePerArrowMilli, 28_800);
assert.equal(arrowPreview.capped, false);

applyAuthority(previewSimulation, {
  type: 'CARD_CHOICE_ACCEPTED',
  authoritySeq: 2,
  authorizationId: 'projection-probe-choice',
  offerId: `projection-probe-${offerOrdinal}`,
  cardId: previewCards[0],
});
const chosenHud = previewSimulation.getHudProjection();
assert.deepEqual(chosenHud.towerStats.current, damagePreview.after);
assert.equal(chosenHud.offerPreviews, undefined);

console.log('✓ 塔属性投影、卡牌前后值、单塔运行态与 HIT 实际伤害字段通过');
