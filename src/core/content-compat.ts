import type { BattleStageId } from './contracts';

export interface LegacyWarlessWaveDerivationV1 {
  readonly hpMultiplierBp: number;
  readonly expMultiplierBp: number;
  readonly speedMultiplierBp: number;
}

function legacyWave(
  hpMultiplierBp: number,
  expMultiplierBp: number,
  speedMultiplierBp = 10_000,
): LegacyWarlessWaveDerivationV1 {
  return { hpMultiplierBp, expMultiplierBp, speedMultiplierBp };
}

/**
 * Fixed-stage hashes shipped immediately before the run-local war-point economy.
 * Only these exact releases may cross the V5 -> V6 boundary. Enemy definitions,
 * routes, group composition, and spawn timing stayed compatible; the immutable
 * wave derivations below validate old live enemies before their derived values
 * are converted to the current fixed-stage rules.
 */
export const LEGACY_WARLESS_CONFIG_HASH_BY_STAGE: Readonly<
  Partial<Record<BattleStageId, string>>
> = {
  STAGE_01: 'sha256:4f52178c96e24300b9136d8e23453f32ab63d16d924fc514b69ec837fab0aa6e',
  STAGE_02: 'sha256:1a080eb280c11d6a9ba27a7ac779c0e9a32b2bf7d40cc6185d840308819109a9',
  STAGE_03: 'sha256:6b22bcb0c565b5b3545172a51574e13aff9fc685a9b4d63904981ee29456bf03',
  STAGE_04: 'sha256:8d86fb92c643506828eda3d46affe43c3c75555ff5bd9ebcbe6f8cc968deb60e',
  STAGE_05: 'sha256:ca2d5e8a169c2d1c291acc158b873e4a38c38e22aab9fc7ca6212bff9a4a097d',
  STAGE_06: 'sha256:a5d9dc6ddbfea467cf0b6fe250aa958e4c9cb3c6b48c8a2d0c5a519b4c4989bb',
  STAGE_07: 'sha256:e7e5da7ff7d8e12d803a3430b944a3f577acc4c005e1f7f31b94bd84e71985d5',
};

const LEGACY_WARLESS_WAVES_BY_STAGE: Readonly<
  Partial<Record<BattleStageId, readonly LegacyWarlessWaveDerivationV1[]>>
> = {
  STAGE_01: [
    legacyWave(6_000, 6_000),
    legacyWave(9_000, 6_000),
    legacyWave(11_650, 6_000),
    legacyWave(20_000, 6_000, 13_000),
    legacyWave(25_000, 6_000, 15_000),
  ],
  STAGE_02: [
    legacyWave(8_000, 7_000),
    legacyWave(14_000, 7_000),
    legacyWave(20_000, 6_800),
    legacyWave(38_000, 6_500, 12_000),
    legacyWave(46_000, 6_500, 14_000),
  ],
  STAGE_03: [
    legacyWave(7_000, 7_600),
    legacyWave(15_000, 7_505, 10_700),
    legacyWave(30_000, 7_410, 11_400),
    legacyWave(46_350, 7_220, 12_688),
    legacyWave(68_250, 7_220, 14_040),
  ],
  STAGE_04: [
    legacyWave(7_000, 5_625),
    legacyWave(17_000, 5_313, 10_500),
    legacyWave(26_000, 5_125, 11_000),
    legacyWave(36_000, 5_000, 12_064),
    legacyWave(51_500, 5_000, 13_176),
  ],
  STAGE_05: [
    legacyWave(8_500, 9_000),
    legacyWave(19_000, 8_500, 10_400),
    legacyWave(30_000, 8_000, 10_800),
    legacyWave(44_000, 7_800, 11_424),
    legacyWave(56_000, 7_800, 12_180),
  ],
  STAGE_06: [
    legacyWave(6_500, 5_625),
    legacyWave(15_000, 5_125, 10_500),
    legacyWave(27_000, 4_875, 11_000),
    legacyWave(36_000, 4_625, 11_500),
    legacyWave(58_000, 4_625, 12_000),
  ],
  STAGE_07: [
    legacyWave(4_000, 9_000),
    legacyWave(18_000, 8_200, 10_500),
    legacyWave(35_000, 7_600, 11_000),
    legacyWave(52_000, 7_000, 16_500),
    legacyWave(60_000, 7_000, 22_500),
  ],
};

export function isLegacyWarlessConfigHash(stageId: BattleStageId, configHash: string): boolean {
  return LEGACY_WARLESS_CONFIG_HASH_BY_STAGE[stageId] === configHash;
}

export function legacyWarlessWaveDerivation(
  stageId: BattleStageId,
  configHash: string,
  waveIndex: number,
): LegacyWarlessWaveDerivationV1 | undefined {
  if (
    !isLegacyWarlessConfigHash(stageId, configHash) ||
    !Number.isSafeInteger(waveIndex) ||
    waveIndex < 0
  ) {
    return undefined;
  }
  const wave = LEGACY_WARLESS_WAVES_BY_STAGE[stageId]?.[waveIndex];
  return wave === undefined ? undefined : { ...wave };
}
