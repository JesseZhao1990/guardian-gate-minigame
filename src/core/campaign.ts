import { BATTLE_STAGE_ORDER, type BattleStageId } from './contracts';

export const STAGE_ORDER = BATTLE_STAGE_ORDER;

export interface CampaignProgressV1 {
  schemaVersion: 1;
  unlockedStageIds: BattleStageId[];
  completedStageIds: BattleStageId[];
  selectedStageId: BattleStageId;
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isBattleStageId(value: unknown): value is BattleStageId {
  return typeof value === 'string' && STAGE_ORDER.some((stageId) => stageId === value);
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function contiguousCompletedStages(value: unknown): BattleStageId[] {
  if (!Array.isArray(value)) return [];
  const requested = new Set(value.filter(isBattleStageId));
  const completed: BattleStageId[] = [];
  for (const stageId of STAGE_ORDER) {
    if (stageId === 'STAGE_08') break;
    if (!requested.has(stageId)) break;
    completed.push(stageId);
  }
  return completed;
}

function unlockedFromCompleted(completedStageIds: readonly BattleStageId[]): BattleStageId[] {
  const unlockedCount = Math.min(STAGE_ORDER.length, completedStageIds.length + 1);
  return STAGE_ORDER.slice(0, unlockedCount);
}

export function createDefaultCampaignProgress(updatedAt = 0): CampaignProgressV1 {
  return {
    schemaVersion: 1,
    unlockedStageIds: ['STAGE_01'],
    completedStageIds: [],
    selectedStageId: 'STAGE_01',
    updatedAt: finiteTimestamp(updatedAt, 0),
  };
}

/**
 * Turns untrusted storage data into a coherent campaign state. Progression is a
 * strict prefix: each stage can only unlock after every earlier stage is complete.
 */
export function normalizeCampaignProgress(
  value: unknown,
  fallbackUpdatedAt = 0,
): CampaignProgressV1 {
  const fallback = createDefaultCampaignProgress(fallbackUpdatedAt);
  if (!isRecord(value) || value.schemaVersion !== 1) return fallback;

  const completedStageIds = contiguousCompletedStages(value.completedStageIds);
  const unlockedStageIds = unlockedFromCompleted(completedStageIds);
  const requestedSelection = value.selectedStageId;
  const selectedStageId = isBattleStageId(requestedSelection) && unlockedStageIds.includes(requestedSelection)
    ? requestedSelection
    : 'STAGE_01';

  return {
    schemaVersion: 1,
    unlockedStageIds,
    completedStageIds,
    selectedStageId,
    updatedAt: finiteTimestamp(value.updatedAt, fallback.updatedAt),
  };
}

export function isStageUnlocked(
  progress: CampaignProgressV1,
  stageId: BattleStageId,
): boolean {
  return normalizeCampaignProgress(progress).unlockedStageIds.includes(stageId);
}

export function nextStageId(stageId: BattleStageId): BattleStageId | undefined {
  const index = STAGE_ORDER.indexOf(stageId);
  return index >= 0 ? STAGE_ORDER[index + 1] : undefined;
}

export function selectCampaignStage(
  progress: CampaignProgressV1,
  stageId: BattleStageId,
  updatedAt = progress.updatedAt,
): CampaignProgressV1 {
  const normalized = normalizeCampaignProgress(progress, updatedAt);
  if (!normalized.unlockedStageIds.includes(stageId)) return normalized;
  return {
    ...normalized,
    selectedStageId: stageId,
    updatedAt: finiteTimestamp(updatedAt, normalized.updatedAt),
  };
}

export function completeCampaignStage(
  progress: CampaignProgressV1,
  stageId: BattleStageId,
  updatedAt = progress.updatedAt,
): CampaignProgressV1 {
  const normalized = normalizeCampaignProgress(progress, updatedAt);
  // The terminal endless challenge settles to a score instead of being completed.
  // Keep it as the one unlocked stage after the finite campaign prefix.
  if (stageId === 'STAGE_08') return normalized;
  if (!normalized.unlockedStageIds.includes(stageId)) return normalized;
  const completedStageIds = [...normalized.completedStageIds];
  if (!completedStageIds.includes(stageId)) completedStageIds.push(stageId);
  return normalizeCampaignProgress({
    ...normalized,
    completedStageIds,
    updatedAt: finiteTimestamp(updatedAt, normalized.updatedAt),
  }, normalized.updatedAt);
}
