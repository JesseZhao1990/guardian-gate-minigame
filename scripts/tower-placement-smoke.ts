import {
  createDefaultTowerBuildZones,
  findNearestValidTowerPlacement,
  pointInBuildZone,
  snapTowerPlacement,
  TOWER_BREACH_CLEARANCE_PX,
  TOWER_PLACEMENT_GRID_PX,
  TOWER_ROUTE_CLEARANCE_PX,
  TOWER_SPACING_PX,
  validateTowerPlacement,
  type TowerBuildZone,
} from '../src/core/tower-placement';
import {
  createStage01Bundle,
  createStage02Bundle,
  createStage03Bundle,
  createStage04Bundle,
  createStage05Bundle,
  createStage06Bundle,
  createStage07Bundle,
  createStage08Bundle,
} from '../src/core/content';

const STAGE_01_AUTHORED_TOWER_ANCHORS = [
  { x: 1_216, y: 256 },
  { x: 1_600, y: 768 },
  { x: 1_792, y: 512 },
  { x: 928, y: 480 },
] as const;

const STAGE_02_AUTHORED_TOWER_ANCHORS = [
  { x: 1_248, y: 224 },
  { x: 1_344, y: 608 },
  { x: 1_376, y: 960 },
  { x: 480, y: 960 },
] as const;

const STAGE_03_AUTHORED_TOWER_ANCHORS = [
  { x: 768, y: 480 },
  { x: 480, y: 160 },
  { x: 1_408, y: 160 },
  { x: 1_504, y: 768 },
] as const;

const AUTHORED_CALIBRATED_TOWER_ANCHORS = {
  STAGE_01: STAGE_01_AUTHORED_TOWER_ANCHORS,
  STAGE_02: STAGE_02_AUTHORED_TOWER_ANCHORS,
  STAGE_03: STAGE_03_AUTHORED_TOWER_ANCHORS,
} as const;

const assert = {
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
};

const buildZone: TowerBuildZone = {
  id: 'TEST_BUILD_ZONE',
  points: [
    { x: 320, y: 256 },
    { x: 1_600, y: 256 },
    { x: 1_600, y: 960 },
    { x: 320, y: 960 },
  ],
};
const routePoints = [
  { x: 960, y: -64 },
  { x: 960, y: 1_120 },
];
const breachPoint = { x: 960, y: 1_120 };

assert.deepEqual(snapTowerPlacement({ x: 337, y: 273 }), { x: 352, y: 288 });
assert.equal(pointInBuildZone({ x: 320, y: 512 }, buildZone), true, 'Polygon boundary must be buildable.');
assert.equal(pointInBuildZone({ x: 100, y: 512 }, buildZone), false);

const valid = validateTowerPlacement({
  point: { x: 352, y: 288 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [],
});
assert.deepEqual(valid, { valid: true, point: { x: 352, y: 288 } });

assert.equal(validateTowerPlacement({
  point: { x: -20, y: 400 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [],
}).reason, 'outside-battlefield');

assert.equal(validateTowerPlacement({
  point: { x: 96, y: 512 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [],
}).reason, 'outside-build-zone');

assert.equal(validateTowerPlacement({
  point: { x: 850, y: 400 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [],
}).reason, 'route-clearance');

assert.equal(validateTowerPlacement({
  point: { x: 352, y: 288 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [{ x: 480, y: 320 }],
}).reason, 'tower-spacing');

assert.equal(validateTowerPlacement({
  point: { x: 1_184, y: 1_088 },
  buildZones: [{
    id: 'BREACH_ZONE',
    points: [
      { x: 1_056, y: 960 },
      { x: 1_408, y: 960 },
      { x: 1_408, y: 1_184 },
      { x: 1_056, y: 1_184 },
    ],
  }],
  routePoints: [{ x: 0, y: 0 }, { x: 0, y: 1 }],
  breachPoint,
  existingTowerPoints: [],
}).reason, 'breach-clearance');

const first = validateTowerPlacement({
  point: { x: 350.1, y: 286.9 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [],
});
const second = validateTowerPlacement({
  point: { x: 350.1, y: 286.9 },
  buildZones: [buildZone],
  routePoints,
  breachPoint,
  existingTowerPoints: [],
});
assert.deepEqual(first, second, 'Placement validation must be deterministic.');

const fallbackInput = {
  point: { x: 960, y: 480 },
  buildZones: createDefaultTowerBuildZones(),
  routePoints,
  breachPoint,
  existingTowerPoints: [{ x: 768, y: 480 }],
};
const fallback = findNearestValidTowerPlacement(fallbackInput);
assert.equal(fallback?.valid, true, 'A nearby legal fallback should be found.');
assert.deepEqual(
  fallback,
  findNearestValidTowerPlacement(fallbackInput),
  'Nearest legal placement must be deterministic.',
);
assert.equal((fallback!.point.x % 32), 0, 'Fallback x must stay on the build grid.');
assert.equal((fallback!.point.y % 32), 0, 'Fallback y must stay on the build grid.');

assert.equal(TOWER_PLACEMENT_GRID_PX, 32, 'Authored towers must stay on the 32px build grid.');
assert.equal(TOWER_ROUTE_CLEARANCE_PX, 170, 'Tower-to-road clearance must remain 170px.');
assert.equal(TOWER_SPACING_PX, 200, 'Tower-to-tower spacing must remain 200px.');
assert.equal(TOWER_BREACH_CLEARANCE_PX, 240, 'Tower-to-breach clearance must remain 240px.');

for (const bundle of [
  createStage01Bundle(),
  createStage02Bundle(),
  createStage03Bundle(),
  createStage04Bundle(),
  createStage05Bundle(),
  createStage06Bundle(),
  createStage07Bundle(),
]) {
  assert.equal(
    bundle.route.towerAnchors.length,
    4,
    `${bundle.stage.id} must author four tower slots.`,
  );
  if (bundle.stage.id in AUTHORED_CALIBRATED_TOWER_ANCHORS) {
    const expected = AUTHORED_CALIBRATED_TOWER_ANCHORS[
      bundle.stage.id as keyof typeof AUTHORED_CALIBRATED_TOWER_ANCHORS
    ];
    assert.deepEqual(
      bundle.route.towerAnchors,
      expected,
      `${bundle.stage.id} tower anchors must stay aligned with the calibrated visible platforms.`,
    );
  }
  const anchorsToValidate = bundle.route.towerAnchors.map((anchor, index) => ({ anchor, index }));
  for (const { anchor, index } of anchorsToValidate) {
    if (anchor === undefined) {
      throw new Error(`${bundle.stage.id} has no tower anchor ${index + 1}.`);
    }
    assert.deepEqual(
      snapTowerPlacement(anchor),
      anchor,
      `${bundle.stage.id} tower anchor ${index + 1} must stay on the 32px grid.`,
    );
    assert.deepEqual(
      validateTowerPlacement({
        point: anchor,
        buildZones: createDefaultTowerBuildZones(),
        routePoints: bundle.route.points,
        breachPoint: bundle.route.breachPoint,
        existingTowerPoints: bundle.route.towerAnchors.filter(
          (_, candidateIndex) => candidateIndex !== index,
        ),
      }),
      { valid: true, point: anchor },
      `${bundle.stage.id} tower anchor ${index + 1} must be a legal snapped placement.`,
    );
  }
}

const stage08Bundle = createStage08Bundle();
assert.equal(
  stage08Bundle.route.towerAnchors.length,
  3,
  'Stage 08 must preserve its exact three-tower leaderboard contract.',
);
assert.equal(
  stage08Bundle.endless?.routes.length,
  3,
  'Stage 08 must validate its authored towers against every endless route.',
);
for (const route of stage08Bundle.endless?.routes ?? []) {
  for (const [index, anchor] of route.towerAnchors.entries()) {
    assert.deepEqual(
      snapTowerPlacement(anchor),
      anchor,
      `${route.id} tower anchor ${index + 1} must stay on the 32px grid.`,
    );
    assert.deepEqual(
      validateTowerPlacement({
        point: anchor,
        buildZones: createDefaultTowerBuildZones(),
        routePoints: route.points,
        breachPoint: route.breachPoint,
        existingTowerPoints: route.towerAnchors.filter(
          (_, candidateIndex) => candidateIndex !== index,
        ),
      }),
      { valid: true, point: anchor },
      `${route.id} tower anchor ${index + 1} must be legal for the selected endless route.`,
    );
  }
}

console.log('✓ 自由布阵网格吸附、区域、道路、塔间距与关门安全校验通过');
