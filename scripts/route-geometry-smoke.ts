declare const process: { cwd(): string };
declare const require: (id: string) => unknown;

import { STAGE_BUNDLES } from '../src/core/content';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  type BattleStageId,
  type Point,
} from '../src/core/contracts';
import {
  createDefaultTowerBuildZones,
  validateTowerPlacement,
} from '../src/core/tower-placement';
import {
  BATTLE_BACKGROUND_WORLD_RECT,
  projectBattleWorldPoint,
} from '../src/render/CanvasRenderer';

interface Stage01RoadContract {
  schemaVersion: 2;
  stageId: 'STAGE_01';
  background: {
    assetPath: string;
    sha256: string;
    width: number;
    height: number;
    worldRect: { x: number; y: number; width: number; height: number };
  };
  visibleRoadCorridor: Array<{
    routePointIndex: number;
    assetX: number;
    assetY: number;
    toleranceX: number;
    toleranceY: number;
  }>;
  roadCenterline: {
    maxDeviationPx: number;
    sampleStepPx: number;
    points: Point[];
  };
}

const { readFileSync } = require('node:fs') as {
  readFileSync(path: string, encoding?: 'utf8'): Uint8Array | string;
};
const { createHash } = require('node:crypto') as {
  createHash(algorithm: 'sha256'): {
    update(data: Uint8Array | string): { digest(encoding: 'hex'): string };
  };
};

const FIXED_STAGE_IDS = [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
] as const satisfies readonly BattleStageId[];

const TARGET_LENGTH_PX: Record<(typeof FIXED_STAGE_IDS)[number], number> = {
  STAGE_01: 1_475,
  STAGE_02: 1_800,
  STAGE_03: 2_000,
  STAGE_04: 2_150,
  STAGE_05: 2_250,
  STAGE_06: 2_400,
  STAGE_07: 2_500,
};
const TARGET_TOLERANCE_PX: Record<(typeof FIXED_STAGE_IDS)[number], number> = {
  STAGE_01: 40,
  STAGE_02: 140,
  STAGE_03: 140,
  STAGE_04: 140,
  STAGE_05: 140,
  STAGE_06: 140,
  STAGE_07: 140,
};
const MIN_ADJACENT_GROWTH_PX = 20;
const STAGE_01_COMBAT_START_DISTANCE_PX = 420;
const STAGE_01_VISIBLE_GROUND_ENTRY_PX = 160;
const STAGE_01_TOP_CONTROLS_BOTTOM_Y = 106;
// Covers the largest reachable Stage 01 body (the 250x200 Dragon Tortoise at
// 1.1 render scale) after the 0.75 battle-world projection. This deliberately
// guards the boss rather than only the much smaller first-wave imp.
const STAGE_01_SPAWN_SCREEN_HALF_WIDTH_PX = 104;
const STAGE_01_SPAWN_SCREEN_HALF_HEIGHT_PX = 83;
const STAGE_01_TOP_CONTROLS_MARGIN_PX = 12;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function routeLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
}

function distanceFromPointToSegment(point: Point, start: Point, end: Point): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1,
        ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared,
      ));
  return Math.hypot(
    point.x - (start.x + deltaX * ratio),
    point.y - (start.y + deltaY * ratio),
  );
}

function distanceFromPointToPolyline(point: Point, line: readonly Point[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 1; index < line.length; index += 1) {
    minimum = Math.min(
      minimum,
      distanceFromPointToSegment(point, line[index - 1]!, line[index]!),
    );
  }
  return minimum;
}

function pointAtRouteDistance(points: readonly Point[], distancePx: number): Point {
  let remaining = Math.max(0, distancePx);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    if (remaining <= segmentLength) {
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    remaining -= segmentLength;
  }
  return { ...points[points.length - 1]! };
}

function readStage01RoadContract(): Stage01RoadContract {
  const contractPath = `${process.cwd()}/scripts/stage-01-road-contract.json`;
  const source = readFileSync(contractPath, 'utf8');
  assert(typeof source === 'string', 'STAGE_01 road contract must be readable JSON text.');
  return JSON.parse(source) as Stage01RoadContract;
}

function assertStage01BackgroundRoadContract(points: readonly Point[]): void {
  const contract = readStage01RoadContract();
  assert(contract.schemaVersion === 2, 'STAGE_01 road contract schema must remain version 2.');
  assert(contract.stageId === 'STAGE_01', 'STAGE_01 road contract must target Stage 01.');
  assert(
    JSON.stringify(contract.background.worldRect) === JSON.stringify(BATTLE_BACKGROUND_WORLD_RECT),
    'STAGE_01 road contract world rect must match the renderer background projection.',
  );
  assert(
    contract.background.width === BATTLE_BACKGROUND_WORLD_RECT.width &&
      contract.background.height === BATTLE_BACKGROUND_WORLD_RECT.height,
    'STAGE_01 road contract dimensions must match the formal battle background.',
  );
  const background = readFileSync(`${process.cwd()}/${contract.background.assetPath}`);
  assert(background instanceof Uint8Array, 'STAGE_01 formal background must be readable as bytes.');
  const actualSha256 = createHash('sha256').update(background).digest('hex');
  assert(
    actualSha256 === contract.background.sha256,
    `STAGE_01 background changed without a re-authored road contract (${actualSha256}).`,
  );
  assert(
    contract.visibleRoadCorridor.length === points.length,
    'STAGE_01 road contract must cover every waypoint from the visible gate to the breach.',
  );
  for (let index = 0; index < contract.visibleRoadCorridor.length; index += 1) {
    const corridor = contract.visibleRoadCorridor[index]!;
    const expectedRoutePointIndex = index;
    assert(
      corridor.routePointIndex === expectedRoutePointIndex,
      `STAGE_01 road contract must cover visible waypoint ${expectedRoutePointIndex} in order.`,
    );
    const point = points[corridor.routePointIndex];
    assert(point, `STAGE_01 is missing visible road waypoint ${corridor.routePointIndex}.`);
    const assetX = point.x - BATTLE_BACKGROUND_WORLD_RECT.x;
    const assetY = point.y - BATTLE_BACKGROUND_WORLD_RECT.y;
    assert(
      Math.abs(assetX - corridor.assetX) <= corridor.toleranceX &&
        Math.abs(assetY - corridor.assetY) <= corridor.toleranceY,
      `STAGE_01 visible waypoint ${corridor.routePointIndex} maps to asset (${assetX}, ${assetY}) outside its authored road corridor.`,
    );
  }
  assert(
    contract.roadCenterline.points.length >= 2 &&
      contract.roadCenterline.maxDeviationPx > 0 &&
      contract.roadCenterline.sampleStepPx > 0,
    'STAGE_01 road centerline contract must define a positive dense-sampling corridor.',
  );
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const sampleCount = Math.max(
      1,
      Math.ceil(segmentLength / contract.roadCenterline.sampleStepPx),
    );
    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
      const ratio = sampleIndex / sampleCount;
      const assetPoint = {
        x: start.x + (end.x - start.x) * ratio - BATTLE_BACKGROUND_WORLD_RECT.x,
        y: start.y + (end.y - start.y) * ratio - BATTLE_BACKGROUND_WORLD_RECT.y,
      };
      const deviation = distanceFromPointToPolyline(
        assetPoint,
        contract.roadCenterline.points,
      );
      assert(
        deviation <= contract.roadCenterline.maxDeviationPx,
        `STAGE_01 route segment ${index - 1}→${index} leaves the paved-road corridor by ${deviation.toFixed(1)}px at asset (${assetPoint.x.toFixed(1)}, ${assetPoint.y.toFixed(1)}).`,
      );
    }
  }
}

function assertStage01SideGateEntry(points: readonly Point[]): void {
  const spawn = points[0];
  assert(spawn, 'STAGE_01 side-gate entry needs a visible fortress-gate spawn point.');
  const projectedSpawn = projectBattleWorldPoint(spawn);
  assert(
    projectedSpawn.x - STAGE_01_SPAWN_SCREEN_HALF_WIDTH_PX >= 0 &&
      projectedSpawn.x + STAGE_01_SPAWN_SCREEN_HALF_WIDTH_PX <= DESIGN_WIDTH &&
      projectedSpawn.y - STAGE_01_SPAWN_SCREEN_HALF_HEIGHT_PX >= 0 &&
      projectedSpawn.y + STAGE_01_SPAWN_SCREEN_HALF_HEIGHT_PX <= DESIGN_HEIGHT,
    `STAGE_01 gate spawn and its entity bounds must remain fully on screen, received (${projectedSpawn.x}, ${projectedSpawn.y}).`,
  );
  assert(
    projectedSpawn.x < DESIGN_WIDTH - 120 && projectedSpawn.x >= DESIGN_WIDTH - 320,
    `STAGE_01 visible fortress gate must sit just inside the right edge, received screen x=${projectedSpawn.x}.`,
  );
  assert(
    projectedSpawn.y - STAGE_01_SPAWN_SCREEN_HALF_HEIGHT_PX >=
      STAGE_01_TOP_CONTROLS_BOTTOM_Y + STAGE_01_TOP_CONTROLS_MARGIN_PX,
    `STAGE_01 gate spawn entity must clear the top controls, received screen y=${projectedSpawn.y}.`,
  );
  const visibleEntry = pointAtRouteDistance(points, STAGE_01_VISIBLE_GROUND_ENTRY_PX);
  const projectedVisibleEntry = projectBattleWorldPoint(visibleEntry);
  const entryDeltaX = projectedVisibleEntry.x - projectedSpawn.x;
  const entryDeltaY = projectedVisibleEntry.y - projectedSpawn.y;
  assert(
    projectedVisibleEntry.x < DESIGN_WIDTH && entryDeltaX < 0,
    'STAGE_01 first visible 160px must travel leftward from the side gate.',
  );
  assert(
    Math.abs(entryDeltaY / entryDeltaX) <= .5,
    'STAGE_01 first visible 160px must stay on a ground-entry slope no steeper than 0.5.',
  );
}

function assertStage01ProtectedIngress(): void {
  const bundle = STAGE_BUNDLES.STAGE_01;
  const protectedDistance = bundle.route.combatStartDistancePx;
  assert(
    protectedDistance === STAGE_01_COMBAT_START_DISTANCE_PX,
    `STAGE_01 protected ingress must remain ${STAGE_01_COMBAT_START_DISTANCE_PX}px.`,
  );
  const initialTowerIds = bundle.rules.initialActiveTowerIds;
  assert(
    initialTowerIds?.length === 2 && initialTowerIds[0] === 0 && initialTowerIds[1] === 1,
    'STAGE_01 protected-ingress geometry assumes exactly initial towers 1 and 2.',
  );
}

function assertAllStage01AnchorsAreLegal(): void {
  const route = STAGE_BUNDLES.STAGE_01.route;
  route.towerAnchors.forEach((anchor, index) => {
    const placement = validateTowerPlacement({
      point: anchor,
      buildZones: createDefaultTowerBuildZones(),
      routePoints: route.points,
      breachPoint: route.breachPoint,
      existingTowerPoints: route.towerAnchors.filter((_, candidateIndex) => candidateIndex !== index),
    });
    assert(
      placement.valid,
      `STAGE_01 tower anchor ${index + 1} is illegal: ${String(placement.reason)}.`,
    );
  });
}

function orientation(first: Point, second: Point, third: Point): number {
  const cross = (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x);
  return Math.abs(cross) < 0.000_001 ? 0 : Math.sign(cross);
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  return orientation(start, end, point) === 0 &&
    point.x >= Math.min(start.x, end.x) && point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) && point.y <= Math.max(start.y, end.y);
}

function segmentsIntersect(
  leftStart: Point,
  leftEnd: Point,
  rightStart: Point,
  rightEnd: Point,
): boolean {
  const leftStartSide = orientation(rightStart, rightEnd, leftStart);
  const leftEndSide = orientation(rightStart, rightEnd, leftEnd);
  const rightStartSide = orientation(leftStart, leftEnd, rightStart);
  const rightEndSide = orientation(leftStart, leftEnd, rightEnd);
  if (leftStartSide !== leftEndSide && rightStartSide !== rightEndSide) return true;
  return (leftStartSide === 0 && pointOnSegment(leftStart, rightStart, rightEnd)) ||
    (leftEndSide === 0 && pointOnSegment(leftEnd, rightStart, rightEnd)) ||
    (rightStartSide === 0 && pointOnSegment(rightStart, leftStart, leftEnd)) ||
    (rightEndSide === 0 && pointOnSegment(rightEnd, leftStart, leftEnd));
}

function assertNoSelfIntersection(stageId: BattleStageId, points: readonly Point[]): void {
  for (let left = 1; left < points.length; left += 1) {
    for (let right = left + 2; right < points.length; right += 1) {
      // First and last segments are not a closed polygon and therefore are not adjacent.
      if (segmentsIntersect(
        points[left - 1]!,
        points[left]!,
        points[right - 1]!,
        points[right]!,
      )) {
        throw new Error(`${stageId} route segments ${left} and ${right} self-intersect.`);
      }
    }
  }
}

let previousLength = 0;
const summary: string[] = [];
for (const stageId of FIXED_STAGE_IDS) {
  const route = STAGE_BUNDLES[stageId].route;
  const points = route.points;
  assert(points.length >= 7, `${stageId} route needs enough turns to read as winding.`);
  assert(route.towerAnchors.length === 4, `${stageId} must author four fixed-campaign tower slots.`);
  if (stageId === 'STAGE_01') {
    assertStage01SideGateEntry(points);
    assertStage01BackgroundRoadContract(points);
    assertStage01ProtectedIngress();
    assertAllStage01AnchorsAreLegal();
  } else {
    const fourthAnchor = route.towerAnchors[3];
    assert(fourthAnchor, `${stageId} is missing its fourth tower anchor.`);
    const fourthPlacement = validateTowerPlacement({
      point: fourthAnchor,
      buildZones: createDefaultTowerBuildZones(),
      routePoints: points,
      breachPoint: route.breachPoint,
      existingTowerPoints: route.towerAnchors.slice(0, 3),
    });
    assert(
      fourthPlacement.valid,
      `${stageId} fourth tower anchor is illegal: ${String(fourthPlacement.reason)}.`,
    );
  }
  assertNoSelfIntersection(stageId, points);
  const length = routeLength(points);
  const target = TARGET_LENGTH_PX[stageId];
  const tolerance = TARGET_TOLERANCE_PX[stageId];
  assert(
    Math.abs(length - target) <= tolerance,
    `${stageId} route length ${length.toFixed(1)}px misses ${target}±${tolerance}px.`,
  );
  if (previousLength > 0) {
    assert(
      length >= previousLength + MIN_ADJACENT_GROWTH_PX,
      `${stageId} route must grow by at least ${MIN_ADJACENT_GROWTH_PX}px from the prior stage.`,
    );
  }
  previousLength = length;
  summary.push(`${stageId.slice(-2)}:${Math.round(length)}px`);
}

assert(
  STAGE_BUNDLES.STAGE_08.route.towerAnchors.length === 3 &&
    STAGE_BUNDLES.STAGE_08.endless?.routes.every((route) => route.towerAnchors.length === 3),
  'Stage 08 leaderboard routes must remain on their three-tower contract.',
);

console.log(`✓ 关卡路线逐关增长、曲折且无自交（${summary.join(' / ')}）`);
