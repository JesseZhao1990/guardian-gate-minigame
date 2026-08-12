import {
  createDefaultCampaignProgress,
  isBattleStageId,
  normalizeCampaignProgress,
  type CampaignProgressV1,
} from '../core/campaign';
import type { BattleEvent, BattleStageId } from '../core/contracts';
import type { LocalAuthoritySnapshotV1 } from '../core/local-authority';

export interface RuntimeSize {
  width: number;
  height: number;
  pixelRatio: number;
  safeArea: RuntimeRect;
  menuButtonRect?: RuntimeRect;
}

export interface RuntimeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface MiniGameRuntime {
  canvas: any;
  context: any;
  createCanvas?(): any;
  resize(): RuntimeSize;
  size(): RuntimeSize;
  requestFrame(callback: (time: number) => void): number;
  cancelFrame(frameId: number): void;
}

export interface SavedBattleV1 {
  schemaVersion: 1;
  configHash: string;
  seed: number;
  tick: number;
  savedAt: number;
  checkpointText: string;
  checkpointChecksum: string;
  authoritySnapshot: LocalAuthoritySnapshotV1;
}

export interface SavedBattleV2 {
  schemaVersion: 2;
  stageId: BattleStageId;
  configHash: string;
  seed: number;
  tick: number;
  savedAt: number;
  checkpointText: string;
  checkpointChecksum: string;
  authoritySnapshot: LocalAuthoritySnapshotV1;
}

export interface EndlessRecordV1 {
  schemaVersion: 1;
  stageId: 'STAGE_08';
  routeId: string;
  releaseId: string;
  configHash: string;
  reachedBoss: boolean;
  bossDamageMilli: number;
  bossLayer: number;
  scoreReachedTick: number;
  survivalTick: number;
  achievedAt: number;
}

interface EndlessRecordEnvelopeV1 {
  schemaVersion: 1;
  recordsByRoute: Record<string, EndlessRecordV1>;
}

const LEGACY_SAVE_PENDING_KEY = 'guardian-gate:minigame:practice:pending:v1';
const LEGACY_SAVE_CONFIRMED_KEY = 'guardian-gate:minigame:practice:confirmed:v1';
const CAMPAIGN_PROGRESS_KEY = 'guardian-gate:minigame:campaign:v1';
const ENDLESS_RECORD_PENDING_KEY = 'guardian-gate:minigame:endless-records:pending:v1';
const ENDLESS_RECORD_CONFIRMED_KEY = 'guardian-gate:minigame:endless-records:confirmed:v1';

function stageSavePendingKey(stageId: BattleStageId): string {
  return `guardian-gate:minigame:battle:${stageId}:pending:v2`;
}

function stageSaveConfirmedKey(stageId: BattleStageId): string {
  return `guardian-gate:minigame:battle:${stageId}:confirmed:v2`;
}

export function checkpointChecksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    hash ^= code & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= code >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

class Utf8Encoder {
  encode(input = ''): Uint8Array {
    const bytes: number[] = [];
    for (let index = 0; index < input.length; index += 1) {
      let codePoint = input.codePointAt(index) ?? 0;
      if (codePoint > 0xffff) index += 1;
      if (codePoint <= 0x7f) {
        bytes.push(codePoint);
      } else if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint <= 0xffff) {
        bytes.push(
          0xe0 | (codePoint >> 12),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      } else {
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f),
        );
      }
    }
    return new Uint8Array(bytes);
  }
}

class Utf8Decoder {
  decode(input: ArrayBufferView | ArrayBuffer = new Uint8Array()): string {
    const bytes = input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const codePoints: number[] = [];
    for (let index = 0; index < bytes.length; index += 1) {
      const first = bytes[index] ?? 0;
      if (first < 0x80) {
        codePoints.push(first);
      } else if ((first & 0xe0) === 0xc0) {
        const second = bytes[index + 1] ?? 0;
        codePoints.push(((first & 0x1f) << 6) | (second & 0x3f));
        index += 1;
      } else if ((first & 0xf0) === 0xe0) {
        const second = bytes[index + 1] ?? 0;
        const third = bytes[index + 2] ?? 0;
        codePoints.push(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
        index += 2;
      } else {
        const second = bytes[index + 1] ?? 0;
        const third = bytes[index + 2] ?? 0;
        const fourth = bytes[index + 3] ?? 0;
        codePoints.push(
          ((first & 0x07) << 18) |
          ((second & 0x3f) << 12) |
          ((third & 0x3f) << 6) |
          (fourth & 0x3f),
        );
        index += 3;
      }
    }

    let output = '';
    for (const codePoint of codePoints) output += String.fromCodePoint(codePoint);
    return output;
  }
}

export function installEncodingPolyfills(): void {
  const globals = globalThis as typeof globalThis & {
    TextEncoder?: typeof TextEncoder;
    TextDecoder?: typeof TextDecoder;
  };
  if (typeof globals.TextEncoder !== 'function') {
    globals.TextEncoder = Utf8Encoder as unknown as typeof TextEncoder;
  }
  if (typeof globals.TextDecoder !== 'function') {
    globals.TextDecoder = Utf8Decoder as unknown as typeof TextDecoder;
  }
}

export function encodeText(value: string): Uint8Array {
  return new Utf8Encoder().encode(value);
}

export function decodeText(value: Uint8Array): string {
  return new Utf8Decoder().decode(value);
}

function normalizeRuntimeRect(value: unknown, fallback?: RuntimeRect): RuntimeRect | undefined {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<RuntimeRect>;
  if (
    typeof candidate.left !== 'number' ||
    typeof candidate.top !== 'number' ||
    typeof candidate.right !== 'number' ||
    typeof candidate.bottom !== 'number'
  ) {
    return fallback;
  }
  return {
    left: candidate.left,
    top: candidate.top,
    right: candidate.right,
    bottom: candidate.bottom,
    width: typeof candidate.width === 'number' ? candidate.width : candidate.right - candidate.left,
    height: typeof candidate.height === 'number' ? candidate.height : candidate.bottom - candidate.top,
  };
}

function readWindowInfo(): RuntimeSize {
  const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const width = Math.max(1, info.windowWidth);
  const height = Math.max(1, info.windowHeight);
  const fullWindow = { left: 0, top: 0, right: width, bottom: height, width, height };
  let menuButtonRect: RuntimeRect | undefined;
  try {
    menuButtonRect = typeof wx.getMenuButtonBoundingClientRect === 'function'
      ? normalizeRuntimeRect(wx.getMenuButtonBoundingClientRect())
      : undefined;
  } catch {
    menuButtonRect = undefined;
  }
  return {
    width,
    height,
    pixelRatio: Math.max(1, Math.min(info.pixelRatio || 1, 3)),
    safeArea: normalizeRuntimeRect(info.safeArea, fullWindow) ?? fullWindow,
    ...(menuButtonRect ? { menuButtonRect } : {}),
  };
}

export function createMiniGameRuntime(): MiniGameRuntime {
  const canvas = wx.createCanvas();
  const context = canvas.getContext('2d');
  let currentSize = readWindowInfo();

  const resize = (): RuntimeSize => {
    currentSize = readWindowInfo();
    canvas.width = Math.round(currentSize.width * currentSize.pixelRatio);
    canvas.height = Math.round(currentSize.height * currentSize.pixelRatio);
    return currentSize;
  };

  resize();
  const request = typeof canvas.requestAnimationFrame === 'function'
    ? canvas.requestAnimationFrame.bind(canvas)
    : globalThis.requestAnimationFrame.bind(globalThis);
  const cancel = typeof canvas.cancelAnimationFrame === 'function'
    ? canvas.cancelAnimationFrame.bind(canvas)
    : globalThis.cancelAnimationFrame.bind(globalThis);

  return {
    canvas,
    context,
    createCanvas: () => wx.createCanvas(),
    resize,
    size: () => currentSize,
    requestFrame: request,
    cancelFrame: cancel,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isStorageIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isVersionIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function parseEndlessRecord(value: unknown): EndlessRecordV1 | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.stageId !== 'STAGE_08' ||
    !isStorageIdentifier(value.routeId) ||
    !isVersionIdentifier(value.releaseId) ||
    !isVersionIdentifier(value.configHash) ||
    typeof value.reachedBoss !== 'boolean' ||
    !isSafeNonNegativeInteger(value.bossDamageMilli) ||
    !isSafeNonNegativeInteger(value.bossLayer) ||
    !isSafeNonNegativeInteger(value.scoreReachedTick) ||
    !isSafeNonNegativeInteger(value.survivalTick) ||
    !isSafeNonNegativeInteger(value.achievedAt)
  ) {
    return undefined;
  }
  return value as unknown as EndlessRecordV1;
}

function parseEndlessRecordEnvelope(value: unknown): EndlessRecordEnvelopeV1 {
  const recordsByRoute: Record<string, EndlessRecordV1> = {};
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.recordsByRoute)) {
    return { schemaVersion: 1, recordsByRoute };
  }
  for (const [routeId, candidate] of Object.entries(value.recordsByRoute)) {
    const record = parseEndlessRecord(candidate);
    if (!record || record.routeId !== routeId) continue;
    recordsByRoute[routeId] = record;
  }
  return { schemaVersion: 1, recordsByRoute };
}

/** Positive means left ranks ahead of right; zero means the two scores tie. */
export function compareEndlessRecords(left: EndlessRecordV1, right: EndlessRecordV1): number {
  if (left.reachedBoss !== right.reachedBoss) return left.reachedBoss ? 1 : -1;
  if (left.reachedBoss) {
    if (left.bossDamageMilli !== right.bossDamageMilli) {
      return left.bossDamageMilli > right.bossDamageMilli ? 1 : -1;
    }
    if (left.scoreReachedTick !== right.scoreReachedTick) {
      return left.scoreReachedTick < right.scoreReachedTick ? 1 : -1;
    }
  } else if (left.survivalTick !== right.survivalTick) {
    return left.survivalTick > right.survivalTick ? 1 : -1;
  }
  if (left.achievedAt !== right.achievedAt) return left.achievedAt < right.achievedAt ? 1 : -1;
  return 0;
}

function isAuthorityEntryList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => (
    Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === 'string' &&
    isRecord(entry[1])
  ));
}

function isPositiveIntegerList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((entry) => (
      typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 1
    ))
  );
}

function isLocalAuthoritySnapshotV1(value: unknown): value is LocalAuthoritySnapshotV1 {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isSafeNonNegativeInteger(value.rngState) &&
    isSafeNonNegativeInteger(value.authoritySeq) &&
    isSafeNonNegativeInteger(value.offerSerial) &&
    isSafeNonNegativeInteger(value.offersSincePurple) &&
    (value.purplePityAdvancedOnChoice === undefined || value.purplePityAdvancedOnChoice === true) &&
    isSafeNonNegativeInteger(value.consecutiveGreenSlots) &&
    (value.rerolledOfferOrdinals === undefined || isPositiveIntegerList(value.rerolledOfferOrdinals)) &&
    isAuthorityEntryList(value.acceptedChoices) &&
    isAuthorityEntryList(value.offers)
  );
}

function hasValidBattlePayload(value: Record<string, unknown>, configHash: string): boolean {
  return (
    value.configHash === configHash &&
    isSafeNonNegativeInteger(value.seed) &&
    isSafeNonNegativeInteger(value.tick) &&
    isSafeNonNegativeInteger(value.savedAt) &&
    typeof value.checkpointText === 'string' &&
    value.checkpointChecksum === checkpointChecksum(value.checkpointText) &&
    isLocalAuthoritySnapshotV1(value.authoritySnapshot)
  );
}

function parseSavedBattleV1(value: unknown, configHash: string): SavedBattleV1 | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !hasValidBattlePayload(value, configHash)) {
    return undefined;
  }
  return value as unknown as SavedBattleV1;
}

function parseSavedBattleV2(
  value: unknown,
  stageId: BattleStageId,
  configHash: string,
): SavedBattleV2 | undefined {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.stageId !== stageId ||
    !isBattleStageId(value.stageId) ||
    !hasValidBattlePayload(value, configHash)
  ) {
    return undefined;
  }
  return value as unknown as SavedBattleV2;
}

function persistBattle(
  pendingKey: string,
  confirmedKey: string,
  value: SavedBattleV1 | SavedBattleV2,
): boolean {
  try {
    wx.setStorageSync(pendingKey, value);
    wx.setStorageSync(confirmedKey, value);
    wx.removeStorageSync(pendingKey);
    return true;
  } catch (error) {
    console.warn('练习局存档写入失败', error);
    return false;
  }
}

export class MiniGameCampaignStore {
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  load(): CampaignProgressV1 {
    const loadedAt = this.now();
    try {
      return normalizeCampaignProgress(wx.getStorageSync(CAMPAIGN_PROGRESS_KEY), loadedAt);
    } catch {
      return createDefaultCampaignProgress(loadedAt);
    }
  }

  save(value: CampaignProgressV1): CampaignProgressV1 {
    const normalized = normalizeCampaignProgress(value, this.now());
    try {
      wx.setStorageSync(CAMPAIGN_PROGRESS_KEY, normalized);
    } catch (error) {
      console.warn('战役进度写入失败', error);
    }
    return normalized;
  }

  clear(): void {
    try {
      wx.removeStorageSync(CAMPAIGN_PROGRESS_KEY);
    } catch {
      // Storage may be unavailable in very early simulator startup.
    }
  }
}

export class MiniGameEndlessRecordStore {
  load(
    routeId: string,
    releaseId: string,
    configHash: string,
  ): EndlessRecordV1 | undefined {
    if (
      !isStorageIdentifier(routeId) ||
      !isVersionIdentifier(releaseId) ||
      !isVersionIdentifier(configHash)
    ) {
      return undefined;
    }
    const record = this.readEnvelope().recordsByRoute[routeId];
    return record?.releaseId === releaseId && record.configHash === configHash
      ? record
      : undefined;
  }

  loadAll(releaseId: string, configHash: string): EndlessRecordV1[] {
    if (!isVersionIdentifier(releaseId) || !isVersionIdentifier(configHash)) return [];
    return Object.values(this.readEnvelope().recordsByRoute)
      .filter((record) => record.releaseId === releaseId && record.configHash === configHash)
      .sort((left, right) => left.routeId.localeCompare(right.routeId));
  }

  save(value: EndlessRecordV1): EndlessRecordV1 | undefined {
    const candidate = parseEndlessRecord(value);
    if (!candidate) return undefined;

    const envelope = this.readEnvelope();
    const stored = envelope.recordsByRoute[candidate.routeId];
    const current = stored?.releaseId === candidate.releaseId && stored.configHash === candidate.configHash
      ? stored
      : undefined;
    if (current && compareEndlessRecords(current, candidate) >= 0) return current;

    envelope.recordsByRoute[candidate.routeId] = candidate;
    try {
      wx.setStorageSync(ENDLESS_RECORD_PENDING_KEY, envelope);
      wx.setStorageSync(ENDLESS_RECORD_CONFIRMED_KEY, envelope);
      try {
        wx.removeStorageSync(ENDLESS_RECORD_PENDING_KEY);
      } catch {
        // The confirmed record is already durable; a stale pending copy is harmless.
      }
      return candidate;
    } catch (error) {
      console.warn('无尽挑战记录写入失败', error);
      return current;
    }
  }

  clear(): void {
    try {
      wx.removeStorageSync(ENDLESS_RECORD_PENDING_KEY);
      wx.removeStorageSync(ENDLESS_RECORD_CONFIRMED_KEY);
    } catch {
      // Storage may be unavailable in very early simulator startup.
    }
  }

  private readEnvelope(): EndlessRecordEnvelopeV1 {
    try {
      return parseEndlessRecordEnvelope(wx.getStorageSync(ENDLESS_RECORD_CONFIRMED_KEY));
    } catch {
      return { schemaVersion: 1, recordsByRoute: {} };
    }
  }
}

export class MiniGameSaveStore {
  load(stageId: BattleStageId, configHash: string): SavedBattleV2 | undefined;
  /** @deprecated Use the stage-aware overload. Kept so V1 callers remain source-compatible. */
  load(configHash: string): SavedBattleV1 | undefined;
  load(
    stageIdOrConfigHash: BattleStageId | string,
    maybeConfigHash?: string,
  ): SavedBattleV1 | SavedBattleV2 | undefined {
    if (maybeConfigHash === undefined) {
      try {
        return parseSavedBattleV1(
          wx.getStorageSync(LEGACY_SAVE_CONFIRMED_KEY),
          stageIdOrConfigHash,
        );
      } catch {
        return undefined;
      }
    }

    if (!isBattleStageId(stageIdOrConfigHash)) return undefined;
    const stageId = stageIdOrConfigHash;
    try {
      const saved = parseSavedBattleV2(
        wx.getStorageSync(stageSaveConfirmedKey(stageId)),
        stageId,
        maybeConfigHash,
      );
      if (saved) return saved;

      // The single-slot V1 save always belonged to Stage 01. Never expose or
      // migrate it to Stage 02, even if both stages happen to share a hash.
      if (stageId !== 'STAGE_01') return undefined;
      const legacy = parseSavedBattleV1(
        wx.getStorageSync(LEGACY_SAVE_CONFIRMED_KEY),
        maybeConfigHash,
      );
      if (!legacy) return undefined;

      const migrated: SavedBattleV2 = {
        ...legacy,
        schemaVersion: 2,
        stageId: 'STAGE_01',
      };
      if (
        persistBattle(
          stageSavePendingKey('STAGE_01'),
          stageSaveConfirmedKey('STAGE_01'),
          migrated,
        )
      ) {
        try {
          wx.removeStorageSync(LEGACY_SAVE_PENDING_KEY);
          wx.removeStorageSync(LEGACY_SAVE_CONFIRMED_KEY);
        } catch {
          // The V2 confirmed copy is already durable; stale V1 data is harmless.
        }
      }
      return migrated;
    } catch {
      return undefined;
    }
  }

  save(value: SavedBattleV2): void;
  /** @deprecated Use SavedBattleV2. Kept so V1 callers remain source-compatible. */
  save(value: SavedBattleV1): void;
  save(value: SavedBattleV1 | SavedBattleV2): void {
    if (value.schemaVersion === 1) {
      persistBattle(LEGACY_SAVE_PENDING_KEY, LEGACY_SAVE_CONFIRMED_KEY, value);
      return;
    }
    if (!isBattleStageId(value.stageId)) return;
    persistBattle(
      stageSavePendingKey(value.stageId),
      stageSaveConfirmedKey(value.stageId),
      value,
    );
  }

  clear(stageId: BattleStageId): void;
  /** @deprecated Pass a stage id. Kept so V1 callers remain source-compatible. */
  clear(): void;
  clear(stageId?: BattleStageId): void {
    try {
      if (stageId) {
        wx.removeStorageSync(stageSavePendingKey(stageId));
        wx.removeStorageSync(stageSaveConfirmedKey(stageId));
        if (stageId !== 'STAGE_01') return;
      }
      wx.removeStorageSync(LEGACY_SAVE_PENDING_KEY);
      wx.removeStorageSync(LEGACY_SAVE_CONFIRMED_KEY);
    } catch {
      // Storage may be unavailable in very early simulator startup.
    }
  }
}

const AUDIO_ROOT = 'assets/stage-01/audio';

type AudioClusterKey =
  | 'ATTACK_RELEASE'
  | 'HIT'
  | 'CRITICAL_HIT'
  | 'DEATH'
  | 'LEVEL_UP'
  | 'BREACH'
  | 'DEFEAT'
  | 'REVIVED'
  | 'VICTORY'
  | 'OVERDRIVE_READY'
  | 'OVERDRIVE_ACTIVATED'
  | 'BOSS_PHASE'
  | 'BOSS_LAYER';

interface AudioClusterProfile {
  file: string;
  volume: number;
  minimumGapMs: number;
  priority: number;
  layerThreshold?: number;
}

interface AudioVoice {
  sound: any;
  busy: boolean;
  priority: number;
}

const AUDIO_VOICE_LIMIT = 6;
const EVENT_AUDIO: Record<AudioClusterKey, AudioClusterProfile> = {
  ATTACK_RELEASE: {
    file: 'SFX_BATTLE_01.m4a',
    volume: .24,
    minimumGapMs: 55,
    priority: 1,
    layerThreshold: 2,
  },
  HIT: {
    file: 'SFX_BATTLE_03.m4a',
    volume: .16,
    minimumGapMs: 42,
    priority: 1,
  },
  CRITICAL_HIT: {
    file: 'SFX_BATTLE_04.m4a',
    volume: .28,
    minimumGapMs: 48,
    priority: 3,
    layerThreshold: 2,
  },
  DEATH: {
    file: 'SFX_BATTLE_07.m4a',
    volume: .23,
    minimumGapMs: 68,
    priority: 2,
    layerThreshold: 3,
  },
  LEVEL_UP: {
    file: 'SFX_UI_11.m4a',
    volume: .34,
    minimumGapMs: 180,
    priority: 4,
  },
  BREACH: {
    file: 'SFX_BATTLE_07.m4a',
    volume: .32,
    minimumGapMs: 180,
    priority: 4,
  },
  DEFEAT: {
    file: 'STG_DEFEAT.m4a',
    volume: .62,
    minimumGapMs: 600,
    priority: 6,
  },
  REVIVED: {
    file: 'SFX_BATTLE_12.m4a',
    volume: .4,
    minimumGapMs: 260,
    priority: 5,
  },
  VICTORY: {
    file: 'STG_VICTORY.m4a',
    volume: .58,
    minimumGapMs: 600,
    priority: 6,
  },
  OVERDRIVE_READY: {
    file: 'SFX_UI_11.m4a',
    volume: .38,
    minimumGapMs: 500,
    priority: 4,
  },
  OVERDRIVE_ACTIVATED: {
    file: 'SFX_BATTLE_12.m4a',
    volume: .48,
    minimumGapMs: 260,
    priority: 5,
    layerThreshold: 2,
  },
  BOSS_PHASE: {
    file: 'SFX_BATTLE_12.m4a',
    volume: .44,
    minimumGapMs: 500,
    priority: 5,
    layerThreshold: 2,
  },
  BOSS_LAYER: {
    file: 'SFX_BATTLE_12.m4a',
    volume: .42,
    minimumGapMs: 320,
    priority: 5,
    layerThreshold: 2,
  },
};

export class MiniGameAudio {
  private muted = false;
  private active = false;
  private readonly lastPlayedAt = new Map<string, number>();
  private readonly voices: AudioVoice[] = [];
  private lastHapticAt = 0;

  start(): void {
    this.active = true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.stopVoices();
  }

  isMuted(): boolean {
    return this.muted;
  }

  suspend(): void {
    this.stopVoices();
  }

  resume(): void {
    // Intentionally empty: returning to the game must not start background audio.
  }

  playEvents(events: BattleEvent[]): void {
    if (!this.active) return;
    this.playRareHaptic(events);
    if (this.muted) return;
    const clusters = new Map<AudioClusterKey, number>();
    for (const event of events) {
      const key = this.audioClusterKey(event);
      if (!key) continue;
      clusters.set(key, (clusters.get(key) ?? 0) + 1);
    }

    const now = Date.now();
    const ordered = [...clusters.entries()].sort(
      (left, right) => EVENT_AUDIO[right[0]].priority - EVENT_AUDIO[left[0]].priority,
    );
    for (const [key, count] of ordered) {
      const profile = EVENT_AUDIO[key];
      const lastPlayed = this.lastPlayedAt.get(key) ?? 0;
      if (now - lastPlayed < profile.minimumGapMs) continue;
      this.lastPlayedAt.set(key, now);
      const volume = Math.min(.72, profile.volume + Math.min(.14, Math.log2(Math.max(1, count)) * .055));
      this.playOne(profile.file, volume, .98, profile.priority);
      if (profile.layerThreshold !== undefined && count >= profile.layerThreshold) {
        this.playOne(profile.file, volume * .48, key === 'ATTACK_RELEASE' ? 1.08 : .91, profile.priority);
      }
    }
  }

  private audioClusterKey(event: BattleEvent): AudioClusterKey | undefined {
    if (event.type === 'HIT') return event.critical ? 'CRITICAL_HIT' : 'HIT';
    if (event.type === 'ENDLESS_PHASE_CHANGED') {
      return event.phase === 'boss' ? 'BOSS_PHASE' : undefined;
    }
    if (event.type === 'BOSS_LAYER_ADVANCED') return 'BOSS_LAYER';
    if (
      event.type === 'ATTACK_RELEASE' ||
      event.type === 'DEATH' ||
      event.type === 'LEVEL_UP' ||
      event.type === 'BREACH' ||
      event.type === 'DEFEAT' ||
      event.type === 'REVIVED' ||
      event.type === 'VICTORY' ||
      event.type === 'OVERDRIVE_READY' ||
      event.type === 'OVERDRIVE_ACTIVATED'
    ) {
      return event.type;
    }
    return undefined;
  }

  private playRareHaptic(events: BattleEvent[]): void {
    const now = Date.now();
    if (now - this.lastHapticAt < 420) return;
    const deathCount = events.filter((event) => event.type === 'DEATH').length;
    const criticalCount = events.filter((event) => event.type === 'HIT' && event.critical).length;
    const heavy = events.some(
      (event) => event.type === 'DEFEAT' || event.type === 'BOSS_LAYER_ADVANCED',
    );
    const medium = events.some(
      (event) =>
        event.type === 'VICTORY' ||
        event.type === 'BREACH' ||
        event.type === 'OVERDRIVE_ACTIVATED' ||
        (event.type === 'ENDLESS_PHASE_CHANGED' && event.phase === 'boss'),
    ) || deathCount >= 4 || criticalCount >= 4;
    if (!heavy && !medium) return;
    this.lastHapticAt = now;
    try {
      wx.vibrateShort?.({ type: heavy ? 'heavy' : 'medium' });
    } catch {
      // Haptics are optional and may be unavailable in the simulator.
    }
  }

  private playOne(file: string, volume: number, playbackRate: number, priority: number): void {
    const voice = this.acquireVoice(priority);
    if (!voice) return;
    const sound = voice.sound;
    voice.busy = true;
    voice.priority = priority;
    try {
      sound.autoplay = false;
      sound.src = `${AUDIO_ROOT}/${file}`;
      sound.volume = Math.max(0, Math.min(1, volume));
      if ('playbackRate' in sound) sound.playbackRate = playbackRate;
      sound.play();
    } catch {
      voice.busy = false;
      voice.priority = 0;
    }
  }

  private acquireVoice(priority: number): AudioVoice | undefined {
    const idle = this.voices.find((voice) => !voice.busy);
    if (idle) return idle;
    if (this.voices.length < AUDIO_VOICE_LIMIT) return this.createVoice();
    const weakest = [...this.voices].sort(
      (left, right) => left.priority - right.priority,
    )[0];
    if (!weakest || weakest.priority >= priority) return undefined;
    const index = this.voices.indexOf(weakest);
    try {
      weakest.sound.stop?.();
      weakest.sound.destroy?.();
    } catch {
      // Replacing a lower-priority one-shot must not interrupt gameplay.
    }
    if (index >= 0) this.voices.splice(index, 1);
    return this.createVoice();
  }

  private createVoice(): AudioVoice | undefined {
    try {
      const sound = wx.createInnerAudioContext();
      const voice: AudioVoice = { sound, busy: false, priority: 0 };
      const release = () => {
        voice.busy = false;
        voice.priority = 0;
      };
      sound.onEnded?.(release);
      sound.onError?.(release);
      this.voices.push(voice);
      return voice;
    } catch {
      return undefined;
    }
  }

  private stopVoices(): void {
    for (const voice of this.voices) {
      try {
        voice.sound.stop?.();
      } catch {
        // One-shot cleanup is best effort across WeChat host versions.
      }
      voice.busy = false;
      voice.priority = 0;
    }
  }
}

export type SubpackageProgressListener = (progress: number) => void;

function subpackageError(action: string, name: string, result: WxSubpackageResult): Error {
  const detail = typeof result?.errMsg === 'string' && result.errMsg.length > 0
    ? `：${result.errMsg}`
    : '';
  return new Error(`${action}分包 ${name} 失败${detail}`);
}

export function loadMiniGameSubpackage(
  name: string,
  onProgress?: SubpackageProgressListener,
): Promise<void> {
  if (typeof wx.loadSubpackage !== 'function') {
    return Promise.reject(new Error(`当前微信运行环境不支持加载分包 ${name}`));
  }

  onProgress?.(0);
  return new Promise((resolve, reject) => {
    try {
      const task = wx.loadSubpackage?.({
        name,
        success: () => {
          onProgress?.(1);
          resolve();
        },
        fail: (result) => reject(subpackageError('加载', name, result)),
      });
      task?.onProgressUpdate((update) => {
        const progress = Number.isFinite(update.progress)
          ? Math.max(0, Math.min(1, update.progress / 100))
          : 0;
        onProgress?.(progress);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function preDownloadMiniGameSubpackage(name: string): Promise<void> {
  if (typeof wx.preDownloadSubpackage !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    try {
      wx.preDownloadSubpackage?.({
        name,
        packageType: 'normal',
        success: () => resolve(),
        fail: () => resolve(),
      });
    } catch {
      resolve();
    }
  });
}

interface ImageResource {
  readonly ids: Set<string>;
  image?: any;
  pending?: Promise<any>;
}

export class ImageCatalog {
  private readonly canvas: any;
  private readonly images = new Map<string, any>();
  private readonly pathsById = new Map<string, string>();
  private readonly resourcesByPath = new Map<string, ImageResource>();

  constructor(canvas: any) {
    this.canvas = canvas;
  }

  async load(entries: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(entries).map(([id, path]) => this.loadOne(id, path)));
  }

  get(id: string): any | undefined {
    return this.images.get(id);
  }

  has(id: string): boolean {
    return this.images.has(id);
  }

  hasAll(ids: Iterable<string>): boolean {
    for (const id of ids) {
      if (!this.images.has(id)) return false;
    }
    return true;
  }

  unload(ids: Iterable<string>): void {
    for (const id of ids) {
      const path = this.pathsById.get(id);
      this.pathsById.delete(id);
      this.images.delete(id);
      if (!path) continue;
      const resource = this.resourcesByPath.get(path);
      if (!resource) continue;
      resource.ids.delete(id);
      if (resource.ids.size === 0 && !resource.pending) {
        this.resourcesByPath.delete(path);
      }
    }
  }

  private async loadOne(id: string, path: string): Promise<void> {
    const previousPath = this.pathsById.get(id);
    if (previousPath && previousPath !== path) this.unload([id]);

    this.pathsById.set(id, path);
    let resource = this.resourcesByPath.get(path);
    if (!resource) {
      resource = { ids: new Set<string>() };
      this.resourcesByPath.set(path, resource);
    }
    resource.ids.add(id);

    try {
      const image = await this.loadPath(path, resource);
      if (this.pathsById.get(id) === path) this.images.set(id, image);
    } catch (error) {
      if (this.pathsById.get(id) === path) {
        this.pathsById.delete(id);
        this.images.delete(id);
      }
      resource.ids.delete(id);
      if (resource.ids.size === 0 && this.resourcesByPath.get(path) === resource) {
        this.resourcesByPath.delete(path);
      }
      throw error;
    }
  }

  private loadPath(path: string, resource: ImageResource): Promise<any> {
    if (resource.image) return Promise.resolve(resource.image);
    if (resource.pending) return resource.pending;

    const image = typeof this.canvas.createImage === 'function'
      ? this.canvas.createImage()
      : (wx as typeof wx & { createImage?: () => any }).createImage?.();
    if (!image) return Promise.reject(new Error(`当前微信运行环境无法创建图片：${path}`));

    resource.pending = new Promise((resolve, reject) => {
      const cleanup = () => {
        image.onload = null;
        image.onerror = null;
        resource.pending = undefined;
      };
      image.onload = () => {
        cleanup();
        resource.image = image;
        if (resource.ids.size === 0 && this.resourcesByPath.get(path) === resource) {
          this.resourcesByPath.delete(path);
        }
        resolve(image);
      };
      image.onerror = (event: unknown) => {
        cleanup();
        if (this.resourcesByPath.get(path) === resource) this.resourcesByPath.delete(path);
        const detail = event && typeof event === 'object' && 'errMsg' in event
          ? `：${String((event as { errMsg?: unknown }).errMsg ?? '')}`
          : '';
        reject(new Error(`必需图片加载失败：${path}${detail}`));
      };
      try {
        image.src = path;
      } catch (error) {
        cleanup();
        if (this.resourcesByPath.get(path) === resource) this.resourcesByPath.delete(path);
        reject(error instanceof Error ? error : new Error(`必需图片加载失败：${path}`));
      }
    });
    return resource.pending;
  }
}
