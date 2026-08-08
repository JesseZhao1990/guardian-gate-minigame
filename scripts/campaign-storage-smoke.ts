import {
  completeCampaignStage,
  createDefaultCampaignProgress,
  nextStageId,
  normalizeCampaignProgress,
  selectCampaignStage,
} from '../src/core/campaign';
import type { BattleStageId } from '../src/core/contracts';
import type { LocalAuthoritySnapshotV1 } from '../src/core/local-authority';
import {
  checkpointChecksum,
  MiniGameCampaignStore,
  MiniGameSaveStore,
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
Object.assign(globalThis, {
  wx: {
    getStorageSync(key: string): unknown {
      const value = storage.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    setStorageSync(key: string, value: unknown): void {
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
assert.deepEqual(afterStage06.unlockedStageIds, afterStage05.unlockedStageIds);
assert.deepEqual(afterStage06.completedStageIds, [
  'STAGE_01',
  'STAGE_02',
  'STAGE_03',
  'STAGE_04',
  'STAGE_05',
  'STAGE_06',
]);
assert.equal(nextStageId('STAGE_01'), 'STAGE_02');
assert.equal(nextStageId('STAGE_02'), 'STAGE_03');
assert.equal(nextStageId('STAGE_03'), 'STAGE_04');
assert.equal(nextStageId('STAGE_04'), 'STAGE_05');
assert.equal(nextStageId('STAGE_05'), 'STAGE_06');
assert.equal(nextStageId('STAGE_06'), undefined);

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

const saveStore = new MiniGameSaveStore();
const stage01Save = savedBattleV2('STAGE_01', 'hash-stage-01', 111);
const stage02Save = savedBattleV2('STAGE_02', 'hash-stage-02', 222);
const stage03Save = savedBattleV2('STAGE_03', 'hash-stage-03', 333);
const stage04Save = savedBattleV2('STAGE_04', 'hash-stage-04', 444);
const stage05Save = savedBattleV2('STAGE_05', 'hash-stage-05', 555);
const stage06Save = savedBattleV2('STAGE_06', 'hash-stage-06', 666);
saveStore.save(stage01Save);
saveStore.save(stage02Save);
saveStore.save(stage03Save);
saveStore.save(stage04Save);
saveStore.save(stage05Save);
saveStore.save(stage06Save);
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.deepEqual(saveStore.load('STAGE_02', 'hash-stage-02'), stage02Save);
assert.deepEqual(saveStore.load('STAGE_03', 'hash-stage-03'), stage03Save);
assert.deepEqual(saveStore.load('STAGE_04', 'hash-stage-04'), stage04Save);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
assert.equal(saveStore.load('STAGE_01', 'hash-stage-02'), undefined);
assert.equal(saveStore.load('STAGE_02', 'hash-stage-01'), undefined);
assert.equal(saveStore.load('STAGE_03', 'hash-stage-02'), undefined);
assert.equal(saveStore.load('STAGE_04', 'hash-stage-03'), undefined);
assert.equal(saveStore.load('STAGE_05', 'hash-stage-04'), undefined);
assert.equal(saveStore.load('STAGE_04', 'hash-stage-05'), undefined);
assert.equal(saveStore.load('STAGE_06', 'hash-stage-05'), undefined);
assert.equal(saveStore.load('STAGE_05', 'hash-stage-06'), undefined);

saveStore.clear('STAGE_02');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_02', 'hash-stage-02'), undefined);
assert.deepEqual(saveStore.load('STAGE_03', 'hash-stage-03'), stage03Save);
assert.deepEqual(saveStore.load('STAGE_04', 'hash-stage-04'), stage04Save);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);

saveStore.clear('STAGE_03');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_03', 'hash-stage-03'), undefined);
assert.deepEqual(saveStore.load('STAGE_04', 'hash-stage-04'), stage04Save);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);

saveStore.clear('STAGE_04');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_04', 'hash-stage-04'), undefined);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);

saveStore.clear('STAGE_06');
assert.equal(saveStore.load('STAGE_06', 'hash-stage-06'), undefined);
assert.deepEqual(saveStore.load('STAGE_05', 'hash-stage-05'), stage05Save);
saveStore.save(stage06Save);
saveStore.clear('STAGE_05');
assert.deepEqual(saveStore.load('STAGE_01', 'hash-stage-01'), stage01Save);
assert.equal(saveStore.load('STAGE_05', 'hash-stage-05'), undefined);
assert.deepEqual(saveStore.load('STAGE_06', 'hash-stage-06'), stage06Save);
saveStore.clear('STAGE_06');
assert.equal(saveStore.load('STAGE_06', 'hash-stage-06'), undefined);

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
console.log('✓ Stage 01/02/03/04/05/06 存档分槽、校验与 clear 隔离通过');
console.log('✓ V1 旧存档仅迁移到 Stage 01 且 V1 API 保持兼容');
