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
}

export interface MiniGameRuntime {
  canvas: any;
  context: any;
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

const LEGACY_SAVE_PENDING_KEY = 'guardian-gate:minigame:practice:pending:v1';
const LEGACY_SAVE_CONFIRMED_KEY = 'guardian-gate:minigame:practice:confirmed:v1';
const CAMPAIGN_PROGRESS_KEY = 'guardian-gate:minigame:campaign:v1';

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

function readWindowInfo(): RuntimeSize {
  const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
  return {
    width: Math.max(1, info.windowWidth),
    height: Math.max(1, info.windowHeight),
    pixelRatio: Math.max(1, Math.min(info.pixelRatio || 1, 3)),
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

function isAuthorityEntryList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => (
    Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === 'string' &&
    isRecord(entry[1])
  ));
}

function isLocalAuthoritySnapshotV1(value: unknown): value is LocalAuthoritySnapshotV1 {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isSafeNonNegativeInteger(value.rngState) &&
    isSafeNonNegativeInteger(value.authoritySeq) &&
    isSafeNonNegativeInteger(value.offerSerial) &&
    isSafeNonNegativeInteger(value.offersSincePurple) &&
    isSafeNonNegativeInteger(value.consecutiveGreenSlots) &&
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

const EVENT_AUDIO: Partial<Record<BattleEvent['type'], string>> = {
  ATTACK_RELEASE: 'SFX_BATTLE_01.m4a',
  HIT: 'SFX_BATTLE_03.m4a',
  DEATH: 'SFX_BATTLE_07.m4a',
  LEVEL_UP: 'SFX_UI_11.m4a',
  BREACH: 'STG_DEFEAT.m4a',
  REVIVED: 'SFX_BATTLE_12.m4a',
  VICTORY: 'STG_VICTORY.m4a',
};

export class MiniGameAudio {
  private muted = false;
  private active = false;
  private readonly lastPlayedAt = new Map<string, number>();

  start(): void {
    this.active = true;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  suspend(): void {
    // Event sounds are one-shot; there is no background track to pause.
  }

  resume(): void {
    // Intentionally empty: returning to the game must not start background audio.
  }

  playEvents(events: BattleEvent[]): void {
    if (!this.active || this.muted) return;
    const now = Date.now();
    for (const event of events) {
      const file = event.type === 'HIT' && event.critical
        ? 'SFX_BATTLE_04.m4a'
        : EVENT_AUDIO[event.type];
      if (!file) continue;
      const minimumGap = event.type === 'ATTACK_RELEASE' ? 90 : event.type === 'HIT' ? 70 : 0;
      const lastPlayed = this.lastPlayedAt.get(file) ?? 0;
      if (now - lastPlayed < minimumGap) continue;
      this.lastPlayedAt.set(file, now);
      this.playOne(file, event.type === 'VICTORY' ? 0.55 : 0.2);
    }
  }

  private playOne(file: string, volume: number): void {
    const sound = wx.createInnerAudioContext();
    sound.src = `${AUDIO_ROOT}/${file}`;
    sound.volume = volume;
    sound.autoplay = true;
    const destroy = () => {
      try {
        sound.destroy();
      } catch {
        // Ignore host audio cleanup errors.
      }
    };
    sound.onEnded?.(destroy);
    sound.onError?.(destroy);
    try {
      sound.play();
    } catch {
      destroy();
    }
  }
}

export class ImageCatalog {
  private readonly canvas: any;
  private readonly images = new Map<string, any>();

  constructor(canvas: any) {
    this.canvas = canvas;
  }

  async load(entries: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(entries).map(([id, path]) => this.loadOne(id, path)));
  }

  get(id: string): any | undefined {
    return this.images.get(id);
  }

  private loadOne(id: string, path: string): Promise<void> {
    return new Promise((resolve) => {
      const image = typeof this.canvas.createImage === 'function'
        ? this.canvas.createImage()
        : (wx as typeof wx & { createImage?: () => any }).createImage?.();
      if (!image) {
        resolve();
        return;
      }
      image.onload = () => {
        this.images.set(id, image);
        resolve();
      };
      image.onerror = () => resolve();
      image.src = path;
    });
  }
}
