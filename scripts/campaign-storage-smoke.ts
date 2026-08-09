import {
  completeCampaignStage,
  createDefaultCampaignProgress,
  nextStageId,
  normalizeCampaignProgress,
  selectCampaignStage,
  STAGE_ORDER,
} from '../src/core/campaign';
import { createBattleSimulation } from '../src/core/battle-sim';
import { resolveStageBundleForSeed } from '../src/core/content';
import type { BattleEvent, BattleStageId } from '../src/core/contracts';
import { GuardianGateGame } from '../src/GuardianGateGame';
import { LocalPracticeAuthority, type LocalAuthoritySnapshotV1 } from '../src/core/local-authority';
import {
  checkpointChecksum,
  compareEndlessRecords,
  decodeText,
  MiniGameCampaignStore,
  MiniGameEndlessRecordStore,
  MiniGameSaveStore,
  type EndlessRecordV1,
  type SavedBattleV1,
  type SavedBattleV2,
} from '../src/platform/wechat';

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

const storage = new Map<string, unknown>();
let storageWrites = 0;
Object.assign(globalThis, {
  wx: {
    getStorageSync(key: string): unknown {
      const value = storage.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    setStorageSync(key: string, value: unknown): void {
      storageWrites += 1;
      storage.set(key, structuredClone(value));
    },
    removeStorageSync(key: string): void {
      storage.delete(key);
    },
  },
});

const authoritySnapshot: LocalAuthoritySnapshotV1 = {
  schemaVersion: 1,
  rngState: 1,
  authoritySeq: 0,
  offerSerial: 0,
  offersSincePurple: 0,
  consecutiveGreenSlots: 0,
  acceptedChoices: [],
  offers: [],
};

function savedBattleV2(
  stageId: BattleStageId,
  configHash: string,
  tick: number,
): SavedBattleV2 {
  const checkpointText = JSON.stringify({ stageId, tick });
  return {
    schemaVersion: 2,
    stageId,
    configHash,
    seed: tick + 7,
    tick,
    savedAt: 1_000 + tick,
    checkpointText,
    checkpointChecksum: checkpointChecksum(checkpointText),
    authoritySnapshot,
  };
}

function savedBattleV1(configHash: string, tick: number): SavedBattleV1 {
  const checkpointText = JSON.stringify({ stageId: 'STAGE_01', tick });
  return {
    schemaVersion: 1,
    configHash,
    seed: tick + 11,
    tick,
    savedAt: 2_000 + tick,
    checkpointText,
    checkpointChecksum: checkpointChecksum(checkpointText),
    authoritySnapshot,
  };
}

function endlessRecord(
  routeId: string,
  overrides: Partial<EndlessRecordV1> = {},
): EndlessRecordV1 {
  return {
    schemaVersion: 1,
    stageId: 'STAGE_08',
    routeId,
    releaseId: 'ENDLESS_RELEASE_001',
    configHash: 'endless-config-001',
    reachedBoss: false,
    bossDamageMilli: 0,
    bossLayer: 0,
    scoreReachedTick: 0,
    survivalTick: 9_000,
    achievedAt: 10_000,
    ...overrides,
  };
}

const initial = createDefaultCampaignProgress(100);
assert.deepEqual(initial, {
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_01'],
  completedStageIds: [],
  selectedStageId: 'STAGE_01',
  updatedAt: 100,
});
assert.equal(selectCampaignStage(initial, 'STAGE_02', 101).selectedStageId, 'STAGE_01');
assert.equal(selectCampaignStage(initial, 'STAGE_03', 102).selectedStageId, 'STAGE_01');
assert.equal(selectCampaignStage(initial, 'STAGE_04', 103).selectedStageId, 'STAGE_01');
assert.equal(selectCampaignStage(initial, 'STAGE_05', 104).selectedStageId, 'STAGE_01');
assert.equal(selectCampaignStage(initial, 'STAGE_06', 105).selectedStageId, 'STAGE_01');
assert.equal(selectCampaignStage(initial, 'STAGE_07', 106).selectedStageId, 'STAGE_01');
assert.equal(selectCampaignStage(initial, 'STAGE_08', 107).selectedStageId, 'STAGE_01');

const afterStage01 = completeCampaignStage(initial, 'STAGE_01', 200);
assert.deepEqual(afterStage01.unlockedStageIds, ['STAGE_01', 'STAGE_02']);
assert.deepEqual(afterStage01.completedStageIds, ['STAGE_01']);
const selectedStage02 = selectCampaignStage(afterStage01, 'STAGE_02', 201);
assert.equal(selectedStage02.selectedStageId, 'STAGE_02');
assert.equal(selectCampaignStage(afterStage01, 'STAGE_03', 202).selectedStageId, 'STAGE_01');

const afterStage02 = completeCampaignStage(selectedStage02, 'STAGE_02', 203);
assert.deepEqual(afterStage02.unlockedStageIds, ['STAGE_01', 'STAGE_02', 'STAGE_03']);
assert.deepEqual(afterStage02.completedStageIds, ['STAGE_01', 'STAGE_02']);
const selectedStage03 = selectCampaignStage(afterStage02, 'STAGE_03', 204);
assert.equal(selectedStage03.selectedStageId, 'STAGE_03');
assert.equal(selectCampaignStage(afterStage02, 'STAGE_04', 205).selectedStageId, 'STAGE_02');
const afterStage03 = completeCampaignStage(selectedStage03, 'STAGE_03', 206);
assert.deepEqual(afterStage03.unlockedStageIds, ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04']);
assert.deepEqual(afterStage03.completedStageIds, ['STAGE_01', 'STAGE_02', 'STAGE_03']);
assert.equal(selectCampaignStage(afterStage03, 'STAGE_05', 207).selectedStageId, 'STAGE_03');
const selectedStage04 = selectCampaignStage(afterStage03, 'STAGE_04', 208);
assert.equal(selectedStage04.selectedStageId, 'STAGE_04');
const afterStage04 = completeCampaignStage(selectedStage04, 'STAGE_04', 209);
assert.deepEqual(afterStage04.unlockedStageIds, ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05']);
assert.deepEqual(afterStage04.completedStageIds, ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04']);
const selectedStage05 = selectCampaignStage(afterStage04, 'STAGE_05', 210);
assert.equal(selectedStage05.selectedStageId, 'STAGE_05');
assert.equal(selectCampaignStage(afterStage04, 'STAGE_06', 211).selectedStageId, 'STAGE_04');
const afterStage05 = completeCampaignStage(selectedStage05, 'STAGE_05', 212);
assert.deepEqual(afterStage05.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
]);
assert.deepEqual(afterStage05.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
]);
const selectedStage06 = selectCampaignStage(afterStage05, 'STAGE_06', 213);
assert.equal(selectedStage06.selectedStageId, 'STAGE_06');
const afterStage06 = completeCampaignStage(selectedStage06, 'STAGE_06', 214);
assert.deepEqual(afterStage06.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
]);
assert.deepEqual(afterStage06.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
]);
const selectedStage07 = selectCampaignStage(afterStage06, 'STAGE_07', 215);
assert.equal(selectedStage07.selectedStageId, 'STAGE_07');
const afterStage07 = completeCampaignStage(selectedStage07, 'STAGE_07', 216);
assert.deepEqual(afterStage07.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
  'STAGE_08',
]);
assert.deepEqual(afterStage07.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
]);
const selectedStage08 = selectCampaignStage(afterStage07, 'STAGE_08', 217);
assert.equal(selectedStage08.selectedStageId, 'STAGE_08');
const afterStage08Settlement = completeCampaignStage(selectedStage08, 'STAGE_08', 218);
assert.deepEqual(afterStage08Settlement, selectedStage08);
assert.equal(afterStage08Settlement.completedStageIds.includes('STAGE_08'), false);
assert.equal(nextStageId('STAGE_01'), 'STAGE_02');
assert.equal(nextStageId('STAGE_02'), 'STAGE_03');
assert.equal(nextStageId('STAGE_03'), 'STAGE_04');
assert.equal(nextStageId('STAGE_04'), 'STAGE_05');
assert.equal(nextStageId('STAGE_05'), 'STAGE_06');
assert.equal(nextStageId('STAGE_06'), 'STAGE_07');
assert.equal(nextStageId('STAGE_07'), 'STAGE_08');
assert.equal(nextStageId('STAGE_08'), undefined);

const migratedThreeStageCompletion = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03'],
  completedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03'],
  selectedStageId: 'STAGE_03',
  updatedAt: 208,
});
assert.deepEqual(migratedThreeStageCompletion.unlockedStageIds, ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04']);
assert.equal(migratedThreeStageCompletion.selectedStageId, 'STAGE_03');

const migratedFourStageCompletion = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04'],
  completedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04'],
  selectedStageId: 'STAGE_04',
  updatedAt: 209,
});
assert.deepEqual(migratedFourStageCompletion.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
]);
assert.deepEqual(migratedFourStageCompletion.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
]);
assert.equal(migratedFourStageCompletion.selectedStageId, 'STAGE_04');

const migratedFiveStageCompletion = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05'],
  completedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05'],
  selectedStageId: 'STAGE_05',
  updatedAt: 210,
});
assert.deepEqual(migratedFiveStageCompletion.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
]);
assert.deepEqual(migratedFiveStageCompletion.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
]);
assert.equal(migratedFiveStageCompletion.selectedStageId, 'STAGE_05');

const migratedSixStageCompletion = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05', 'STAGE_06'],
  completedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05', 'STAGE_06'],
  selectedStageId: 'STAGE_06',
  updatedAt: 211,
});
assert.deepEqual(migratedSixStageCompletion.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
]);
assert.deepEqual(migratedSixStageCompletion.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
]);
assert.equal(migratedSixStageCompletion.selectedStageId, 'STAGE_06');

const migratedSevenStageCompletion = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05', 'STAGE_06', 'STAGE_07'],
  completedStageIds: ['STAGE_01', 'STAGE_02', 'STAGE_03', 'STAGE_04', 'STAGE_05', 'STAGE_06', 'STAGE_07'],
  selectedStageId: 'STAGE_07',
  updatedAt: 212,
});
assert.deepEqual(migratedSevenStageCompletion.unlockedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
  'STAGE_08',
]);
assert.deepEqual(migratedSevenStageCompletion.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
]);
assert.equal(migratedSevenStageCompletion.selectedStageId, 'STAGE_07');

const impossibleEndlessCompletion = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: STAGE_ORDER,
  completedStageIds: STAGE_ORDER,
  selectedStageId: 'STAGE_08',
  updatedAt: 213,
});
assert.deepEqual(impossibleEndlessCompletion.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
  'STAGE_07',
]);
assert.deepEqual(impossibleEndlessCompletion.unlockedStageIds, [...STAGE_ORDER]);
assert.equal(impossibleEndlessCompletion.selectedStageId, 'STAGE_08');

const impossibleProgress = normalizeCampaignProgress({
  schemaVersion: 1,
  unlockedStageIds: ['STAGE_02', 'BROKEN_STAGE'],
  completedStageIds: ['STAGE_02'],
  selectedStageId: 'STAGE_02',
  updatedAt: Number.NaN,
}, 300);
assert.deepEqual(impossibleProgress, createDefaultCampaignProgress(300));

const campaignStore = new MiniGameCampaignStore(() => 400);
assert.deepEqual(campaignStore.load(), createDefaultCampaignProgress(400));
campaignStore.save(selectedStage02);
assert.deepEqual(new MiniGameCampaignStore(() => 999).load(), selectedStage02);

const endlessStore = new MiniGameEndlessRecordStore();
const routeASurvival = endlessRecord('ROUTE_ENDLESS_A');
assert.deepEqual(endlessStore.save(routeASurvival), routeASurvival);
assert.deepEqual(
  endlessStore.load('ROUTE_ENDLESS_A', routeASurvival.releaseId, routeASurvival.configHash),
  routeASurvival,
);
assert.equal(endlessStore.load('ROUTE_ENDLESS_A', 'OTHER_RELEASE', routeASurvival.configHash), undefined);
assert.equal(endlessStore.load('ROUTE_ENDLESS_A', routeASurvival.releaseId, 'other-config'), undefined);

const longerRouteASurvival = endlessRecord('ROUTE_ENDLESS_A', {
  survivalTick: 10_000,
  achievedAt: 10_100,
});
assert.ok(compareEndlessRecords(longerRouteASurvival, routeASurvival) > 0);
assert.deepEqual(endlessStore.save(longerRouteASurvival), longerRouteASurvival);

const routeABoss = endlessRecord('ROUTE_ENDLESS_A', {
  reachedBoss: true,
  bossDamageMilli: 80_000,
  scoreReachedTick: 37_000,
  survivalTick: 37_000,
  achievedAt: 10_200,
});
assert.ok(compareEndlessRecords(routeABoss, longerRouteASurvival) > 0);
assert.deepEqual(endlessStore.save(routeABoss), routeABoss);

const slowerTie = endlessRecord('ROUTE_ENDLESS_A', {
  reachedBoss: true,
  bossDamageMilli: routeABoss.bossDamageMilli,
  scoreReachedTick: routeABoss.scoreReachedTick + 1,
  survivalTick: routeABoss.survivalTick + 1,
  achievedAt: routeABoss.achievedAt - 1,
});
assert.ok(compareEndlessRecords(slowerTie, routeABoss) < 0);
const writesBeforeWorseScore = storageWrites;
assert.deepEqual(endlessStore.save(slowerTie), routeABoss);
assert.equal(storageWrites, writesBeforeWorseScore);

const earlierTie = endlessRecord('ROUTE_ENDLESS_A', {
  ...routeABoss,
  achievedAt: routeABoss.achievedAt - 1,
});
assert.ok(compareEndlessRecords(earlierTie, routeABoss) > 0);
assert.deepEqual(endlessStore.save(earlierTie), earlierTie);
const writesBeforeDuplicate = storageWrites;
assert.deepEqual(endlessStore.save(earlierTie), earlierTie);
assert.equal(storageWrites, writesBeforeDuplicate);

const routeB = endlessRecord('ROUTE_ENDLESS_B', {
  survivalTick: 8_000,
  achievedAt: 9_000,
});
assert.deepEqual(endlessStore.save(routeB), routeB);
assert.deepEqual(
  endlessStore.loadAll(routeB.releaseId, routeB.configHash),
  [earlierTie, routeB],
);
assert.equal(endlessStore.save({ ...routeB, survivalTick: Number.MAX_SAFE_INTEGER + 1 }), undefined);
assert.deepEqual(endlessStore.load('ROUTE_ENDLESS_B', routeB.releaseId, routeB.configHash), routeB);

storage.set('guardian-gate:minigame:endless-records:confirmed:v1', {
  schemaVersion: 1,
  recordsByRoute: {
    ROUTE_ENDLESS_A: { ...earlierTie, bossDamageMilli: Number.NaN },
    ROUTE_ENDLESS_B: routeB,
  },
});
assert.equal(endlessStore.load('ROUTE_ENDLESS_A', earlierTie.releaseId, earlierTie.configHash), undefined);
assert.deepEqual(endlessStore.load('ROUTE_ENDLESS_B', routeB.releaseId, routeB.configHash), routeB);
endlessStore.clear();
assert.deepEqual(endlessStore.loadAll(routeB.releaseId, routeB.configHash), []);

const settlementStore = new MiniGameEndlessRecordStore();
const settlementBundle = resolveStageBundleForSeed('STAGE_08', 42);
const foreignRouteRecord = endlessRecord('ROUTE_STAGE_08_FOREIGN', {
  releaseId: settlementBundle.releaseId,
  configHash: settlementBundle.configHash,
});
assert.deepEqual(settlementStore.save(foreignRouteRecord), foreignRouteRecord);
const controller = Object.create(GuardianGateGame.prototype) as Record<string, any>;
let clearedEndlessCheckpoints = 0;
controller.activeBundle = settlementBundle;
controller.activeStageId = 'STAGE_08';
controller.endlessRecordStore = settlementStore;
controller.store = {
  clear(stageId: BattleStageId): void {
    assert.equal(stageId, 'STAGE_08');
    clearedEndlessCheckpoints += 1;
  },
};
controller.savedBattles = new Map<BattleStageId, SavedBattleV2>();
controller.campaign = selectedStage08;
controller.victory = true;
controller.pendingNextStageId = 'STAGE_08';
controller.reviveOrdinal = 1;
const settlementEvent: Extract<BattleEvent, { type: 'ENDLESS_SETTLED' }> = {
  eventId: '9000:sim:1',
  tick: 9_000,
  type: 'ENDLESS_SETTLED',
  reason: 'manual',
  routeId: settlementBundle.route.id,
  reachedBoss: false,
  survivalTick: 9_000,
  bossLayer: 0,
  bossDamageMilli: 0,
  scoreReachedTick: 9_000,
};
const campaignBeforeSettlement = structuredClone(controller.campaign);
controller.handleEndlessSettlement(settlementEvent);
assert.deepEqual(controller.campaign, campaignBeforeSettlement);
assert.equal(controller.victory, false);
assert.equal(controller.pendingNextStageId, undefined);
assert.equal(controller.reviveOrdinal, undefined);
assert.equal(controller.endlessSettlementReason, 'manual');
assert.equal(controller.endlessPreviousBest, undefined);
assert.equal(controller.endlessIsNewBest, true);
assert.equal(controller.endlessResult.routeId, settlementBundle.route.id);
assert.equal(clearedEndlessCheckpoints, 1);
assert.deepEqual(
  settlementStore.load(
    settlementBundle.route.id,
    settlementBundle.releaseId,
    settlementBundle.configHash,
  ),
  controller.endlessResult,
);
assert.deepEqual(
  controller.endlessBestRecords.map((record: EndlessRecordV1) => record.routeId),
  [settlementBundle.route.id],
);
const writesAfterFirstSettlement = storageWrites;
controller.handleEndlessSettlement(settlementEvent);
assert.equal(storageWrites, writesAfterFirstSettlement);
assert.equal(clearedEndlessCheckpoints, 1);
assert.equal(controller.endlessPreviousBest, undefined);
assert.deepEqual(controller.campaign, campaignBeforeSettlement);
let issuedEndlessCommand: unknown;
controller.screen = 'battle';
controller.audio = { start(): void {} };
controller.hud = { mode: 'endless', flowState: 'defeat-pending' };
controller.issueCommand = (command: unknown): void => {
  issuedEndlessCommand = command;
};
controller.handleInteraction('overlay-exit');
assert.deepEqual(issuedEndlessCommand, { type: 'FORFEIT' });
let exitedAfterFatalError = false;
controller.fatalError = '演算已中断';
controller.exitToHome = (): void => {
  exitedAfterFatalError = true;
};
controller.handleInteraction('overlay-exit');
assert.equal(exitedAfterFatalError, true);
settlementStore.clear();

const abandonedFixedStages: BattleStageId[] = [];
let fixedExitSaveFlag: boolean | undefined;
const fixedDefeatPendingController = Object.create(
  GuardianGateGame.prototype,
) as Record<string, any>;
fixedDefeatPendingController.screen = 'battle';
fixedDefeatPendingController.audio = { start(): void {} };
fixedDefeatPendingController.hud = {
  mode: 'fixed',
  flowState: 'defeat-pending',
};
fixedDefeatPendingController.activeStageId = 'STAGE_01';
fixedDefeatPendingController.savedBattles = new Map<BattleStageId, SavedBattleV2>([[
  'STAGE_01',
  savedBattleV2('STAGE_01', 'fixed-defeat-pending', 1),
]]);
fixedDefeatPendingController.store = {
  clear(stageId: BattleStageId): void {
    abandonedFixedStages.push(stageId);
  },
};
fixedDefeatPendingController.exitToHome = (saveCurrentBattle = true): void => {
  fixedExitSaveFlag = saveCurrentBattle;
};
fixedDefeatPendingController.handleInteraction('overlay-exit');
assert.deepEqual(abandonedFixedStages, ['STAGE_01']);
assert.equal(fixedDefeatPendingController.savedBattles.has('STAGE_01'), false);
assert.equal(fixedExitSaveFlag, false);

const failedSettlementController = Object.create(GuardianGateGame.prototype) as Record<string, any>;
let clearedAfterFailedRecordWrite = 0;
failedSettlementController.activeBundle = settlementBundle;
failedSettlementController.activeStageId = 'STAGE_08';
failedSettlementController.endlessRecordStore = {
  load(): undefined {
    return undefined;
  },
  save(): undefined {
    return undefined;
  },
  loadAll(): [] {
    return [];
  },
};
failedSettlementController.store = {
  clear(): void {
    clearedAfterFailedRecordWrite += 1;
  },
};
failedSettlementController.savedBattles = new Map<BattleStageId, SavedBattleV2>();
failedSettlementController.handleEndlessSettlement(settlementEvent);
assert.equal(clearedAfterFailedRecordWrite, 0);
assert.equal(failedSettlementController.endlessResult.achievedAt <= Date.now(), true);

const eligibleEffects = ['tower-damage', 'tower-frequency', 'crit-rate'] as const;
let forwardedOfferRequest: readonly unknown[] | undefined;
const offerController = Object.create(GuardianGateGame.prototype) as Record<string, any>;
offerController.authority = {
  requestOffer(...args: readonly unknown[]): Record<string, unknown> {
    forwardedOfferRequest = args;
    return { type: 'OFFER_GRANTED' };
  },
};
offerController.simulation = {
  applyAuthorityEvent(): Record<string, unknown> {
    return { ticksAdvanced: 0, commandAcks: [], events: [], flowRequests: [] };
  },
};
offerController.processOutput({
  ticksAdvanced: 0,
  commandAcks: [],
  events: [],
  flowRequests: [{
    type: 'OFFER',
    ordinal: 7,
    tick: 10_000,
    eligibleEffectIds: [...eligibleEffects],
  }],
});
assert.deepEqual(forwardedOfferRequest, [7, undefined, [...eligibleEffects]]);
assert.equal(offerController.currentOfferOrdinal, 7);

const commandResumeBundle = resolveStageBundleForSeed('STAGE_01', 0x51ec0de);
const commandResumeSeed = 0x51ec0de;
const commandBeforeSave = createBattleSimulation(commandResumeBundle, commandResumeSeed);
assert.equal(commandBeforeSave.applyCommand({
  seq: 1_000_001,
  type: 'PAUSE',
}).commandAcks[0]?.status, 'applied');
const restoredCommandSimulation = createBattleSimulation(
  commandResumeBundle,
  commandResumeSeed,
  commandBeforeSave.createCheckpoint(),
);
assert.equal(restoredCommandSimulation.getHudProjection().lastCommandSeq, 1_000_001);
const commandResumeController = Object.create(GuardianGateGame.prototype) as Record<string, any>;
commandResumeController.simulation = restoredCommandSimulation;
commandResumeController.commandSequence = Math.max(
  1_000_000,
  restoredCommandSimulation.getHudProjection().lastCommandSeq,
);
commandResumeController.processOutput = (): void => {};
commandResumeController.refreshBattleProjection = (): void => {};
assert.equal(commandResumeController.issueCommand({ type: 'RESUME' }), 'applied');
assert.equal(commandResumeController.commandSequence, 1_000_002);
assert.equal(restoredCommandSimulation.getHudProjection().flowState, 'running');

let savedDefeatPending: SavedBattleV2 | undefined;
const defeatPendingController = Object.create(GuardianGateGame.prototype) as Record<string, any>;
defeatPendingController.simulation = {
  getHudProjection: () => ({ tick: 8_888, flowState: 'defeat-pending', outcome: 'defeat' }),
  createCheckpoint: () => new TextEncoder().encode('defeat-pending-checkpoint'),
};
defeatPendingController.authority = { snapshot: () => authoritySnapshot };
defeatPendingController.activeStageId = 'STAGE_08';
defeatPendingController.activeBundle = settlementBundle;
defeatPendingController.seed = 42;
defeatPendingController.store = {
  save(value: SavedBattleV2): void {
    savedDefeatPending = value;
  },
};
defeatPendingController.savedBattles = new Map<BattleStageId, SavedBattleV2>();
defeatPendingController.saveBattle();
assert.equal(savedDefeatPending?.tick, 8_888);
assert.equal(savedDefeatPending?.stageId, 'STAGE_08');

const terminalSeed = 4_242;
const terminalBundle = resolveStageBundleForSeed('STAGE_08', terminalSeed);
const terminalSimulation = createBattleSimulation(terminalBundle, terminalSeed);
const terminalAuthority = new LocalPracticeAuthority(terminalBundle, terminalSeed);
const terminalOutput = terminalSimulation.applyCommand({ seq: 1, type: 'FORFEIT' });
assert.equal(
  terminalOutput.events.some((event) => event.type === 'ENDLESS_SETTLED' && event.reason === 'manual'),
  true,
);
const terminalHud = terminalSimulation.getHudProjection();
assert.equal(terminalHud.flowState, 'result');
assert.equal(terminalHud.outcome, 'settled');
assert.equal(terminalHud.endless?.settlementReason, 'manual');
const terminalCheckpointText = decodeText(terminalSimulation.createCheckpoint());
const terminalSavedAt = 123_456;
const terminalSaved: SavedBattleV2 = {
  schemaVersion: 2,
  stageId: 'STAGE_08',
  configHash: terminalBundle.configHash,
  seed: terminalSeed,
  tick: terminalHud.tick,
  savedAt: terminalSavedAt,
  checkpointText: terminalCheckpointText,
  checkpointChecksum: checkpointChecksum(terminalCheckpointText),
  authoritySnapshot: terminalAuthority.snapshot(),
};
const terminalSaveStore = new MiniGameSaveStore();
terminalSaveStore.save(terminalSaved);
const terminalRecordStore = new MiniGameEndlessRecordStore();
const recoveryController = Object.create(GuardianGateGame.prototype) as Record<string, any>;
recoveryController.store = terminalSaveStore;
recoveryController.endlessRecordStore = terminalRecordStore;
recoveryController.savedBattles = new Map<BattleStageId, SavedBattleV2>();
recoveryController.endlessBestRecords = [];
recoveryController.campaign = selectedStage08;
recoveryController.refreshSavedBattles();
const recoveredRecord = terminalRecordStore.load(
  terminalBundle.route.id,
  terminalBundle.releaseId,
  terminalBundle.configHash,
);
assert.equal(recoveredRecord?.achievedAt, terminalSavedAt);
assert.equal(terminalSaveStore.load('STAGE_08', terminalBundle.configHash), undefined);
assert.equal(recoveryController.savedBattles.has('STAGE_08'), false);
const writesAfterTerminalRecovery = storageWrites;
recoveryController.refreshSavedBattles();
assert.equal(storageWrites, writesAfterTerminalRecovery);
terminalRecordStore.clear();

for (const [index, reason] of (['time-limit', 'breach', 'manual'] as const).entries()) {
  const reasonRecordStore = new MiniGameEndlessRecordStore();
  const reasonController = Object.create(GuardianGateGame.prototype) as Record<string, any>;
  let clearedReasonCheckpoint = 0;
  reasonController.endlessRecordStore = reasonRecordStore;
  reasonController.store = {
    clear(stageId: BattleStageId): void {
      assert.equal(stageId, 'STAGE_08');
      clearedReasonCheckpoint += 1;
    },
  };
  reasonController.savedBattles = new Map<BattleStageId, SavedBattleV2>();
  reasonController.endlessBestRecords = [];
  reasonController.victory = true;
  reasonController.pendingNextStageId = 'STAGE_08';
  reasonController.reviveOrdinal = 1;
  const reasonHud = {
    ...terminalHud,
    tick: reason === 'time-limit'
      ? terminalBundle.endless?.settlementTick ?? terminalHud.tick
      : terminalHud.tick,
    outcome: reason === 'breach' ? 'defeat' as const : 'settled' as const,
    endless: terminalHud.endless
      ? { ...terminalHud.endless, settlementReason: reason }
      : undefined,
  };
  const reasonAchievedAt = 200_000 + index;
  reasonController.restoreEndlessSettlement(terminalBundle, reasonHud, reasonAchievedAt);
  assert.equal(reasonController.endlessSettlementReason, reason);
  assert.equal(reasonController.endlessResult.achievedAt, reasonAchievedAt);
  assert.equal(reasonController.victory, false);
  assert.equal(reasonController.pendingNextStageId, undefined);
  assert.equal(reasonController.reviveOrdinal, undefined);
  assert.equal(clearedReasonCheckpoint, 1);
  reasonRecordStore.clear();
}

const saveStore = new MiniGameSaveStore();
const stage01Save = savedBattleV2('STAGE_01', 'hash-stage-01', 111);
const stage02Save = savedBattleV2('STAGE_02', 'hash-stage-02', 222);
const stage03Save = savedBattleV2('STAGE_03', 'hash-stage-03', 333);
const stage04Save = savedBattleV2('STAGE_04', 'hash-stage-04', 444);
const stage05Save = savedBattleV2('STAGE_05', 'hash-stage-05', 555);
const stage06Save = savedBattleV2('STAGE_06', 'hash-stage-06', 666);
const stage07Save = savedBattleV2('STAGE_07', 'hash-stage-07', 777);
const stage08Save = savedBattleV2('STAGE_08', 'hash-stage-08', 888);
saveStore.save(stage01Save);
saveStore.save(stage02Save);
saveStore.save(stage03Save);
saveStore.save(stage04Save);
saveStore.save(stage05Save);
saveStore.save(stage06Save);
saveStore.save(stage07Save);
saveStore.save(stage08Save);
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.deepEqual(saveStore.load('STAGE_02', 'hash-stage-02'), stage02Save);
assert.deepEqual(saveStore.load('STAGE_03', 'hash-stage-03'), stage03Save);
assert.deepEqual(saveStore.load('STAGE_04', 'hash-stage-04'), stage04Save);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);
assert.equal(saveStore.load('STAGE_01', 'hash-stage-02'), undefined);
assert.equal(saveStore.load('STAGE_02', 'hash-stage-01'), undefined);
assert.equal(saveStore.load('STAGE_03', 'hash-stage-02'), undefined);
assert.equal(saveStore.load('STAGE_04', 'hash-stage-03'), undefined);
assert.equal(saveStore.load('STAGE_05', 'hash-stage-04'), undefined);
assert.equal(saveStore.load('STAGE_04', 'hash-stage-05'), undefined);
assert.equal(saveStore.load('STAGE_06', 'hash-stage-05'), undefined);
assert.equal(saveStore.load('STAGE_05', 'hash-stage-06'), undefined);
assert.equal(saveStore.load('STAGE_07', 'hash-stage-06'), undefined);
assert.equal(saveStore.load('STAGE_06', 'hash-stage-07'), undefined);
assert.equal(saveStore.load('STAGE_08', 'hash-stage-07'), undefined);
assert.equal(saveStore.load('STAGE_07', 'hash-stage-08'), undefined);

saveStore.clear('STAGE_02');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_02', 'hash-stage-02'), undefined);
assert.deepEqual(saveStore.load('STAGE_03', 'hash-stage-03'), stage03Save);
assert.deepEqual(saveStore.load('STAGE_04', 'hash-stage-04'), stage04Save);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);

saveStore.clear('STAGE_03');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_03', 'hash-stage-03'), undefined);
assert.deepEqual(saveStore.load('STAGE_04', 'hash-stage-04'), stage04Save);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);

saveStore.clear('STAGE_04');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_04', 'hash-stage-04'), undefined);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);

saveStore.clear('STAGE_06');
assert.equal(saveStore.load('STAGE_06', 'hash-stage-06'), undefined);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);
saveStore.save(stage06Save);
saveStore.clear('STAGE_05');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_05', 'hash-stage-05'), undefined);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);
saveStore.clear('STAGE_06');
assert.equal(saveStore.load('STAGE_06', 'hash-stage-06'), undefined);
assert.deepEqual(saveStore.load('STAGE_07', 'hash-stage-07'), stage07Save);
saveStore.clear('STAGE_07');
assert.equal(saveStore.load('STAGE_07', 'hash-stage-07'), undefined);
assert.deepEqual(saveStore.load('STAGE_08', 'hash-stage-08'), stage08Save);
saveStore.clear('STAGE_08');
assert.equal(saveStore.load('STAGE_08', 'hash-stage-08'), undefined);

storage.set('guardian-gate:minigame:battle:STAGE_02:confirmed:v2', {
  ...stage02Save,
  checkpointChecksum: 'corrupted',
});
assert.equal(saveStore.load('STAGE_02', 'hash-stage-02'), undefined);
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
storage.set('guardian-gate:minigame:battle:STAGE_02:confirmed:v2', {
  ...stage02Save,
  authoritySnapshot: { schemaVersion: 1 },
});
assert.equal(saveStore.load('STAGE_02', 'hash-stage-02'), undefined);

saveStore.clear('STAGE_01');
const legacy = savedBattleV1('legacy-stage-01-hash', 333);
saveStore.save(legacy);
assert.deepEqual(saveStore.load('legacy-stage-01-hash'), legacy);
assert.equal(saveStore.load('STAGE_02', 'legacy-stage-01-hash'), undefined);
assert.ok(storage.has('guardian-gate:minigame:practice:confirmed:v1'));

const migrated = saveStore.load('STAGE_01', 'legacy-stage-01-hash');
assert.equal(migrated?.schemaVersion, 2);
assert.equal(migrated?.stageId, 'STAGE_01');
assert.equal(migrated?.tick, legacy.tick);
assert.ok(storage.has('guardian-gate:minigame:battle:STAGE_01:confirmed:v2'));
assert.equal(storage.has('guardian-gate:minigame:practice:confirmed:v1'), false);

saveStore.clear('STAGE_02');
assert.equal(saveStore.load('STAGE_01', 'legacy-stage-01-hash')?.tick, legacy.tick);
saveStore.clear('STAGE_01');
assert.equal(saveStore.load('STAGE_01', 'legacy-stage-01-hash'), undefined);

console.log('✓ 战役默认、选关、通关解锁与持久化通过');
console.log('✓ Stage 01/02/03/04/05/06/07/08 存档分槽、校验与 clear 隔离通过');
console.log('✓ V1 旧存档仅迁移到 Stage 01 且 V1 API 保持兼容');
console.log('✓ 无尽挑战记录按路线比较、版本隔离、损坏忽略与幂等写入通过');
console.log('✓ 无尽结算只处理一次、清理 checkpoint 且不推进 campaign/胜利状态');
console.log('✓ 无尽待复活存档、三种结算原因恢复与落盘失败保留 checkpoint 通过');
console.log('✓ Controller 原样传递 OFFER 封顶后的 eligibleEffectIds 通过');
console.log('✓ 恢复存档后命令序列继续递增，首次继续守关不再被判重复');
console.log('✓ 固定关待复活面板的“结束试炼”会放弃本局且不再回存');
console.log('✓ 无尽失守面板的“结束试炼”显式发送 FORFEIT 结算命令');
