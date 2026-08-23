import { createBattleSimulation, type SimulationOutput } from '../src/core/battle-sim';
import { createStage01Bundle } from '../src/core/content';
import type { BattleEvent, Point } from '../src/core/contracts';

const MILLI_PX = 1_000;
const PROTECTED_INGRESS_PX = 420;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function startPreparedWave(simulation: ReturnType<typeof createBattleSimulation>): void {
  const hud = simulation.getHudProjection();
  const output = simulation.applyCommand({
    seq: hud.lastCommandSeq + 1,
    type: 'START_WAVE',
  });
  assert(output.commandAcks[0]?.status === 'applied', 'Stage 01 ingress probe could not start wave 1.');
}

function checkpointState(simulation: ReturnType<typeof createBattleSimulation>): {
  tick: number;
  enemies: Array<{ entityId: number; distanceMilli: number }>;
} {
  const envelope = JSON.parse(new TextDecoder().decode(simulation.createCheckpoint())) as {
    state: {
      tick: number;
      enemies: Array<{ entityId: number; distanceMilli: number }>;
    };
  };
  return envelope.state;
}

function routeDistanceAtPoint(points: readonly Point[], point: Point): number {
  let cumulativeDistance = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestRouteDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
    const segmentLength = Math.sqrt(segmentLengthSquared);
    const ratio = segmentLengthSquared <= 0
      ? 0
      : Math.max(0, Math.min(1,
          ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
            segmentLengthSquared,
        ));
    const projectedX = start.x + deltaX * ratio;
    const projectedY = start.y + deltaY * ratio;
    const error = Math.hypot(point.x - projectedX, point.y - projectedY);
    if (error < bestDistance) {
      bestDistance = error;
      bestRouteDistance = cumulativeDistance + segmentLength * ratio;
    }
    cumulativeDistance += segmentLength;
  }
  assert(bestDistance < 1, `Combat event (${point.x}, ${point.y}) left the authored Stage 01 route.`);
  return bestRouteDistance;
}

function advanceOne(simulation: ReturnType<typeof createBattleSimulation>): SimulationOutput {
  const output = simulation.advanceTicks(1);
  assert(output.ticksAdvanced === 1, 'Stage 01 ingress probe stalled before reaching combat.');
  return output;
}

const bundle = createStage01Bundle();
const gateSpawn = bundle.route.points[0];
assert(gateSpawn, 'Stage 01 must declare a ground-level gate spawn point.');
assert(
  bundle.route.combatStartDistancePx === PROTECTED_INGRESS_PX,
  `Stage 01 must protect its first ${PROTECTED_INGRESS_PX}px from combat.`,
);

const simulation = createBattleSimulation(bundle, 0x5101_1a11);
startPreparedWave(simulation);
let firstEntityId: number | undefined;
let observedGateSpawn = false;
let observedGateExit = false;
let observedRoadTurn = false;
let firstAttackTick: number | undefined;
let firstHitTick: number | undefined;
const combatEvents: BattleEvent[] = [];

for (let elapsed = 0; elapsed < 900; elapsed += 1) {
  const output = advanceOne(simulation);
  combatEvents.push(...output.events);
  const state = checkpointState(simulation);
  const snapshot = simulation.getRenderSnapshot();
  const firstEnemy = snapshot.entities.find((entity) =>
    entity.renderKind === 'enemy' && (firstEntityId === undefined || entity.entityId === firstEntityId));
  if (firstEntityId === undefined && firstEnemy) firstEntityId = firstEnemy.entityId;
  if (firstEnemy) {
    if (Math.hypot(firstEnemy.x - gateSpawn.x, firstEnemy.y - gateSpawn.y) <= 6) {
      observedGateSpawn = true;
    }
    if (firstEnemy.x < 1_830 && firstEnemy.y > 245) observedGateExit = true;
    if (firstEnemy.x < 1_700 && firstEnemy.y > 300) observedRoadTurn = true;
  }

  for (const event of output.events) {
    if (event.type === 'ATTACK_RELEASE' && firstAttackTick === undefined) {
      firstAttackTick = state.tick;
      const leadingDistanceMilli = Math.max(0, ...state.enemies.map((enemy) => enemy.distanceMilli));
      assert(
        leadingDistanceMilli >= PROTECTED_INGRESS_PX * MILLI_PX,
        `Tower attacked at ${leadingDistanceMilli / MILLI_PX}px inside the protected ingress.`,
      );
    }
    if (event.type === 'HIT') {
      firstHitTick ??= state.tick;
      const impactDistance = routeDistanceAtPoint(bundle.route.points, {
        x: event.impactX,
        y: event.impactY,
      });
      assert(
        impactDistance + 0.5 >= PROTECTED_INGRESS_PX,
        `Hit at ${impactDistance.toFixed(1)}px bypassed the protected ingress.`,
      );
    }
  }
  if (firstHitTick !== undefined && observedRoadTurn) break;
}

assert(observedGateSpawn, 'The first monster must begin inside the authored ground-level fortress gate.');
assert(observedGateExit, 'The first monster must visibly leave the fortress gate along its stone threshold.');
assert(observedRoadTurn, 'The first monster must continue from the gate onto the curved stone road.');
assert(firstAttackTick !== undefined, 'Stage 01 towers never acquired a target after the protected ingress.');
assert(firstHitTick !== undefined, 'Stage 01 towers never hit a target after the protected ingress.');
assert(
  !combatEvents.some((event) => event.type === 'DEATH' && event.tick < firstAttackTick!),
  'An enemy died before the first legal tower attack.',
);

// A precision arrow aimed at the leading target must not penetrate into followers
// that are still inside the protected ingress.
const penetrationBundle = createStage01Bundle();
penetrationBundle.waves[0]!.groups = [{ enemyId: 'MON_TIDE_IMP', count: 3, intervalTicks: 10 }];
penetrationBundle.enemies.MON_TIDE_IMP!.maxHpMilli = 10_000_000;
penetrationBundle.route.towerAnchors[0] = { x: 2_240, y: 400 };
penetrationBundle.route.towerAnchors[1] = { x: -10_000, y: -10_000 };
penetrationBundle.tower.rangePx = 5_000;
penetrationBundle.tower.baseDamageMilli = 10_000;
penetrationBundle.tower.projectileSpeedPxPerSecond = 100_000;
penetrationBundle.tower.basePenetration = 2;
penetrationBundle.tower.critChanceBp = 0;
const penetrationSimulation = createBattleSimulation(penetrationBundle, 0x5101_0e11);
startPreparedWave(penetrationSimulation);
let firstImpactEvents: BattleEvent[] = [];
for (let elapsed = 0; elapsed < 240; elapsed += 1) {
  const output = advanceOne(penetrationSimulation);
  const hits = output.events.filter((event) => event.type === 'HIT');
  if (hits.length > 0) {
    firstImpactEvents = hits;
    break;
  }
}
assert(
  firstImpactEvents.length === 1,
  `The first precision impact must not penetrate into protected followers (received ${firstImpactEvents.length} hits).`,
);
assert(
  firstImpactEvents[0]?.type === 'HIT' && firstImpactEvents[0].penetrationIndex === 0,
  'The only legal first impact must be the leading primary target.',
);

for (const invalidDistance of [0, 99_999]) {
  const invalidBundle = createStage01Bundle();
  invalidBundle.route.combatStartDistancePx = invalidDistance;
  let rejected = false;
  try {
    createBattleSimulation(invalidBundle, 1);
  } catch {
    rejected = true;
  }
  assert(rejected, `Invalid combat-start distance ${invalidDistance} must be rejected.`);
}

console.log('✓ 第一关右侧城门入场、420px禁火段、沿路移动与穿透隔离通过');
