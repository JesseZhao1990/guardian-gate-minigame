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

interface StageRoadContract {
  schemaVersion: 3;
  stageId: BattleStageId;
  background: {
    assetPath: string;
    sha256: string;
    width: number;
    height: number;
    worldRect: { x: number; y: number; width: number; height: number };
  };
  waypointTolerancePx: number;
  maxDeviationPx: number;
  sampleStepPx: number;
  assetRoutePoints: Point[];
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

const CALIBRATED_ROAD_STAGE_IDS = [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
] as const satisfies readonly BattleStageId[];

const TARGET_LENGTH_PX: Record<(typeof FIXED_STAGE_IDS)[number], number> = {
  STAGE_01: 1_960,
  STAGE_02: 1_840,
  STAGE_03: 1_960,
  STAGE_04: 2_150,
  STAGE_05: 2_250,
  STAGE_06: 2_400,
  STAGE_07: 2_500,
};
const TARGET_TOLERANCE_PX: Record<(typeof FIXED_STAGE_IDS)[number], number> = {
  STAGE_01: 40,
  STAGE_02: 40,
  STAGE_03: 40,
  STAGE_04: 140,
  STAGE_05: 140,
  STAGE_06: 140,
  STAGE_07: 140,
};
const MIN_ADJACENT_GROWTH_PX = 20;
// Stage 01's annotated side-gate road contains a deliberately longer lower
// S-bend than Stage 02. From Stage 02 onward the campaign still grows in route
// length; Stage 01 difficulty remains governed by its protected ingress.
const ADJACENT_GROWTH_STAGE_IDS = new Set<BattleStageId>([
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
]);
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

function readStageRoadContract(stageId: (typeof CALIBRATED_ROAD_STAGE_IDS)[number]): StageRoadContract {
  const suffix = stageId.slice(-2).toLowerCase();
  const contractPath = `${process.cwd()}/scripts/stage-${suffix}-road-contract.json`;
  const source = readFileSync(contractPath, 'utf8');
  assert(typeof source === 'string', `${stageId} road contract must be readable JSON text.`);
  return JSON.parse(source) as StageRoadContract;
}

function assertBackgroundRoadContract(
  stageId: (typeof CALIBRATED_ROAD_STAGE_IDS)[number],
  points: readonly Point[],
): void {
  const contract = readStageRoadContract(stageId);
  assert(contract.schemaVersion === 3, `${stageId} road contract schema must remain version 3.`);
  assert(contract.stageId === stageId, `${stageId} road contract must target its matching stage.`);
  assert(
    JSON.stringify(contract.background.worldRect) === JSON.stringify(BATTLE_BACKGROUND_WORLD_RECT),
    `${stageId} road contract world rect must match the renderer background projection.`,
  );
  assert(
    contract.background.width === BATTLE_BACKGROUND_WORLD_RECT.width &&
      contract.background.height === BATTLE_BACKGROUND_WORLD_RECT.height,
    `${stageId} road contract dimensions must match the formal battle background.`,
  );
  const background = readFileSync(`${process.cwd()}/${contract.background.assetPath}`);
  assert(background instanceof Uint8Array, `${stageId} formal background must be readable as bytes.`);
  const actualSha256 = createHash('sha256').update(background).digest('hex');
  assert(
    actualSha256 === contract.background.sha256,
    `${stageId} background changed without a re-authored road contract (${actualSha256}).`,
  );
  assert(
    contract.assetRoutePoints.length === points.length,
    `${stageId} road contract must cover every waypoint from the visible entry to the breach.`,
  );
  assert(
    contract.waypointTolerancePx > 0 &&
      contract.maxDeviationPx > 0 &&
      contract.sampleStepPx > 0,
    `${stageId} road contract must define positive waypoint and segment tolerances.`,
  );
  for (let index = 0; index < contract.assetRoutePoints.length; index += 1) {
    const expectedAssetPoint = contract.assetRoutePoints[index]!;
    const point = points[index];
    assert(point, `${stageId} is missing visible road waypoint ${index}.`);
    const assetX = point.x - BATTLE_BACKGROUND_WORLD_RECT.x;
    const assetY = point.y - BATTLE_BACKGROUND_WORLD_RECT.y;
    assert(
      Math.abs(assetX - expectedAssetPoint.x) <= contract.waypointTolerancePx &&
        Math.abs(assetY - expectedAssetPoint.y) <= contract.waypointTolerancePx,
      `${stageId} visible waypoint ${index} maps to asset (${assetX}, ${assetY}) outside its authored road corridor.`,
    );
  }
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const sampleCount = Math.max(
      1,
      Math.ceil(segmentLength / contract.sampleStepPx),
    );
    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
      const ratio = sampleIndex / sampleCount;
      const assetPoint = {
        x: start.x + (end.x - start.x) * ratio - BATTLE_BACKGROUND_WORLD_RECT.x,
        y: start.y + (end.y - start.y) * ratio - BATTLE_BACKGROUND_WORLD_RECT.y,
      };
      const deviation = distanceFromPointToPolyline(
        assetPoint,
        contract.assetRoutePoints,
      );
      assert(
        deviation <= contract.maxDeviationPx,
        `${stageId} route segment ${index - 1}→${index} leaves the paved-road corridor by ${deviation.toFixed(1)}px at asset (${assetPoint.x.toFixed(1)}, ${assetPoint.y.toFixed(1)}).`,
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
  assert(
    JSON.stringify(route.breachPoint) === JSON.stringify(points[points.length - 1]),
    `${stageId} breach point must be the final route point so visuals and simulation agree.`,
  );
  if (CALIBRATED_ROAD_STAGE_IDS.includes(
    stageId as (typeof CALIBRATED_ROAD_STAGE_IDS)[number],
  )) {
    assertBackgroundRoadContract(
      stageId as (typeof CALIBRATED_ROAD_STAGE_IDS)[number],
      points,
    );
  }
  if (stageId === 'STAGE_01') {
    assertStage01SideGateEntry(points);
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
  if (previousLength > 0 && ADJACENT_GROWTH_STAGE_IDS.has(stageId)) {
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

console.log(`✓ 关卡路线匹配校准长度、曲折且无自交（${summary.join(' / ')}）`);
