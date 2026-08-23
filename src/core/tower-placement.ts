import { DESIGN_WIDTH, type Point } from './contracts';

export const TOWER_PLACEMENT_GRID_PX = 32;
export const TOWER_ROUTE_CLEARANCE_PX = 170;
export const TOWER_SPACING_PX = 200;
export const TOWER_BREACH_CLEARANCE_PX = 240;
export const TOWER_BUILD_ZONE_INSET_PX = 96;

export interface TowerBuildZone {
  id: string;
  points: Point[];
}

export type TowerPlacementBlockReason =
  | 'invalid-point'
  | 'outside-battlefield'
  | 'outside-build-zone'
  | 'route-clearance'
  | 'tower-spacing'
  | 'breach-clearance';

export interface TowerPlacementValidationInput {
  point: Point;
  buildZones: readonly TowerBuildZone[];
  routePoints: readonly Point[];
  breachPoint: Point;
  existingTowerPoints: readonly Point[];
  battlefieldWidth?: number;
  battlefieldHeight?: number;
  routeClearancePx?: number;
  towerSpacingPx?: number;
  breachClearancePx?: number;
}

export interface TowerPlacementValidationResult {
  valid: boolean;
  point: Point;
  reason?: TowerPlacementBlockReason;
}

export function createDefaultTowerBuildZones(
  battlefieldWidth = DESIGN_WIDTH,
  battlefieldHeight = 1_200,
): TowerBuildZone[] {
  const inset = TOWER_BUILD_ZONE_INSET_PX;
  return [{
    id: 'BATTLEFIELD_BUILD_ZONE',
    points: [
      { x: inset, y: inset },
      { x: battlefieldWidth - inset, y: inset },
      { x: battlefieldWidth - inset, y: battlefieldHeight - inset },
      { x: inset, y: battlefieldHeight - inset },
    ],
  }];
}

function squaredDistance(left: Point, right: Point): number {
  const deltaX = left.x - right.x;
  const deltaY = left.y - right.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function squaredDistanceToSegment(point: Point, start: Point, end: Point): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared <= 0) return squaredDistance(point, start);

  const projection = Math.max(0, Math.min(1,
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
      segmentLengthSquared,
  ));
  const projected = {
    x: start.x + segmentX * projection,
    y: start.y + segmentY * projection,
  };
  return squaredDistance(point, projected);
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  const cross = (point.y - start.y) * (end.x - start.x) -
    (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > 0.000_001) return false;
  return point.x >= Math.min(start.x, end.x) &&
    point.x <= Math.max(start.x, end.x) &&
    point.y >= Math.min(start.y, end.y) &&
    point.y <= Math.max(start.y, end.y);
}

export function pointInBuildZone(point: Point, zone: TowerBuildZone): boolean {
  if (zone.points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = zone.points.length - 1; index < zone.points.length; previous = index, index += 1) {
    const currentPoint = zone.points[index];
    const previousPoint = zone.points[previous];
    if (!currentPoint || !previousPoint) continue;
    if (pointOnSegment(point, previousPoint, currentPoint)) return true;
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
        (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function snapTowerPlacement(
  point: Point,
  gridPx = TOWER_PLACEMENT_GRID_PX,
): Point {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isSafeInteger(gridPx) || gridPx <= 0) {
    return { x: Number.NaN, y: Number.NaN };
  }
  return {
    x: Math.round(point.x / gridPx) * gridPx,
    y: Math.round(point.y / gridPx) * gridPx,
  };
}

export function validateTowerPlacement(
  input: TowerPlacementValidationInput,
): TowerPlacementValidationResult {
  const point = snapTowerPlacement(input.point);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return { valid: false, point, reason: 'invalid-point' };
  }

  const width = input.battlefieldWidth ?? DESIGN_WIDTH;
  const height = input.battlefieldHeight ?? 1_200;
  if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) {
    return { valid: false, point, reason: 'outside-battlefield' };
  }

  if (!input.buildZones.some((zone) => pointInBuildZone(point, zone))) {
    return { valid: false, point, reason: 'outside-build-zone' };
  }

  const routeClearance = input.routeClearancePx ?? TOWER_ROUTE_CLEARANCE_PX;
  const routeClearanceSquared = routeClearance * routeClearance;
  for (let index = 1; index < input.routePoints.length; index += 1) {
    const start = input.routePoints[index - 1];
    const end = input.routePoints[index];
    if (start && end && squaredDistanceToSegment(point, start, end) < routeClearanceSquared) {
      return { valid: false, point, reason: 'route-clearance' };
    }
  }

  const towerSpacing = input.towerSpacingPx ?? TOWER_SPACING_PX;
  const towerSpacingSquared = towerSpacing * towerSpacing;
  if (input.existingTowerPoints.some((existing) => squaredDistance(point, existing) < towerSpacingSquared)) {
    return { valid: false, point, reason: 'tower-spacing' };
  }

  const breachClearance = input.breachClearancePx ?? TOWER_BREACH_CLEARANCE_PX;
  if (squaredDistance(point, input.breachPoint) < breachClearance * breachClearance) {
    return { valid: false, point, reason: 'breach-clearance' };
  }

  return { valid: true, point };
}

/**
 * Finds the closest legal snapped point without depending on floating-point
 * angle iteration. This gives authored/default placements a deterministic
 * fallback when a route revision makes their old position illegal.
 */
export function findNearestValidTowerPlacement(
  input: TowerPlacementValidationInput,
): TowerPlacementValidationResult | undefined {
  const desired = snapTowerPlacement(input.point);
  if (!Number.isFinite(desired.x) || !Number.isFinite(desired.y)) return undefined;
  const direct = validateTowerPlacement({ ...input, point: desired });
  if (direct.valid) return direct;

  const width = input.battlefieldWidth ?? DESIGN_WIDTH;
  const height = input.battlefieldHeight ?? 1_200;
  const candidates: Point[] = [];
  for (let y = 0; y <= height; y += TOWER_PLACEMENT_GRID_PX) {
    for (let x = 0; x <= width; x += TOWER_PLACEMENT_GRID_PX) {
      candidates.push({ x, y });
    }
  }
  candidates.sort((left, right) => {
    const leftDistance = squaredDistance(left, desired);
    const rightDistance = squaredDistance(right, desired);
    return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
  });
  for (const point of candidates) {
    const result = validateTowerPlacement({ ...input, point });
    if (result.valid) return result;
  }
  return undefined;
}
