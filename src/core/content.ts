import type {
  BattleBundleV1,
  BattleStageId,
  CardDefinition,
  CardEffectId,
  EnemyDefinition,
  Point,
  WaveDefinition,
} from './contracts';
import { BATTLE_STAGE_ORDER } from './contracts';

const STAGE_01_RELEASE_ID = 'GG_S01_ALPHA_V0';
const STAGE_01_CONFIG_HASH = 'sha256:8ffd84988e6fd2749c1167ee20965560d5c4b370f1202f3db00359d8427ae1b7';
const STAGE_02_RELEASE_ID = 'GG_S02_ALPHA_V2';
const STAGE_02_CONFIG_HASH = 'sha256:2eaf59e722d0ea3bd0b14b1b0bcffc6681d493e2986b8b8315daeedbc9acc483';
const STAGE_03_RELEASE_ID = 'GG_S03_ALPHA_V1';
const STAGE_03_CONFIG_HASH = 'sha256:4d30d0cc4fbb6b6b9f180573bcc6cfc254846ca04d4eafd47256a905238681b3';
const STAGE_04_RELEASE_ID = 'GG_S04_ALPHA_V1';
const STAGE_04_CONFIG_HASH = 'sha256:70fec9ca0b9dae293129eeb51257b775b13ca3dc29619a26cd3cbbdbd1bf067f';
const STAGE_05_RELEASE_ID = 'GG_S05_ALPHA_V1';
const STAGE_05_CONFIG_HASH = 'sha256:5f6575958517f4a9624ca8f304a26658a3f7eae86a07a62379d39524a5042b7a';
const STAGE_06_RELEASE_ID = 'GG_S06_ALPHA_V1';
const STAGE_06_CONFIG_HASH = 'sha256:506f6515dd1308161d46a28f7a2769aa9ea89fe4ec479b0a21e26fd984771add';

const stage01RoutePoints: Point[] = [
  { x: 1100, y: -60 },
  { x: 1120, y: 120 },
  { x: 1060, y: 280 },
  { x: 1220, y: 440 },
  { x: 1320, y: 590 },
  { x: 1240, y: 740 },
  { x: 1060, y: 870 },
  { x: 820, y: 1010 },
  { x: 680, y: 1140 },
];

const stage01TowerAnchors: [Point, Point, Point] = [
  { x: 1430, y: 180 },
  { x: 1570, y: 560 },
  { x: 1180, y: 970 },
];

const enemies: Record<string, EnemyDefinition> = {
  MON_TIDE_IMP: {
    id: 'MON_TIDE_IMP',
    name: '潮汐小妖',
    maxHpMilli: 100_000,
    speedPxPerSecond: 96,
    radiusPx: 24,
    exp: 8,
    armorBp: 0,
    controlResistanceBp: 0,
    movement: 'ground',
    renderAssetId: 'MON_TIDE_IMP',
  },
  MON_SWIFT_EEL: {
    id: 'MON_SWIFT_EEL',
    name: '迅潮鳗',
    maxHpMilli: 75_000,
    speedPxPerSecond: 130,
    radiusPx: 22,
    exp: 8,
    armorBp: 0,
    controlResistanceBp: 0,
    movement: 'ground',
    renderAssetId: 'MON_SWIFT_EEL',
  },
  MON_SHELL_CRAB: {
    id: 'MON_SHELL_CRAB',
    name: '甲壳蟹',
    maxHpMilli: 210_000,
    speedPxPerSecond: 69,
    radiusPx: 36,
    exp: 13,
    armorBp: 2_000,
    controlResistanceBp: 1_000,
    movement: 'ground',
    renderAssetId: 'MON_SHELL_CRAB',
  },
  MON_REEF_GUARD: {
    id: 'MON_REEF_GUARD',
    name: '礁甲卫',
    maxHpMilli: 270_000,
    speedPxPerSecond: 61,
    radiusPx: 42,
    exp: 20,
    armorBp: 2_800,
    controlResistanceBp: 1_500,
    movement: 'ground',
    renderAssetId: 'MON_REEF_GUARD',
    renderScaleBp: 11_500,
  },
  MON_DRAGON_TORTOISE: {
    id: 'MON_DRAGON_TORTOISE',
    name: '玄甲龙鳌',
    maxHpMilli: 700_000,
    speedPxPerSecond: 52,
    radiusPx: 72,
    exp: 70,
    armorBp: 3_200,
    controlResistanceBp: 4_000,
    movement: 'ground',
    renderAssetId: 'MON_DRAGON_TORTOISE',
    renderScaleBp: 11_000,
  },
};

const stage04Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_ABYSS_SCALE_GUARD: {
    id: 'MON_ABYSS_SCALE_GUARD',
    name: '噬潮鳞卫',
    maxHpMilli: 260_000,
    speedPxPerSecond: 72,
    radiusPx: 40,
    exp: 18,
    armorBp: 2_200,
    controlResistanceBp: 1_800,
    movement: 'ground',
    renderAssetId: 'MON_ABYSS_SCALE_GUARD',
    renderScaleBp: 11_200,
    enrageBelowHpBp: 4_000,
    enrageSpeedMultiplierBp: 14_500,
  },
  MON_ABYSS_WYRM: {
    id: 'MON_ABYSS_WYRM',
    name: '噬潮魔蛟',
    maxHpMilli: 1_100_000,
    speedPxPerSecond: 46,
    radiusPx: 76,
    exp: 80,
    armorBp: 2_600,
    controlResistanceBp: 4_500,
    movement: 'ground',
    renderAssetId: 'MON_ABYSS_WYRM',
    renderScaleBp: 11_200,
    enrageBelowHpBp: 5_000,
    enrageSpeedMultiplierBp: 16_000,
  },
};

const stage05Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_SOLAR_FORMATION_PRIEST: {
    id: 'MON_SOLAR_FORMATION_PRIEST',
    name: '曜阵祭司',
    maxHpMilli: 70_000,
    speedPxPerSecond: 60,
    radiusPx: 34,
    exp: 20,
    armorBp: 0,
    controlResistanceBp: 2_300,
    movement: 'ground',
    renderAssetId: 'MON_SOLAR_FORMATION_PRIEST',
    renderScaleBp: 10_500,
    guardAuraArmorBp: 5_000,
    guardAuraRadiusPx: 300,
  },
  MON_ECLIPSE_KUN_EMPEROR: {
    id: 'MON_ECLIPSE_KUN_EMPEROR',
    name: '蚀日鲲皇',
    maxHpMilli: 1_250_000,
    speedPxPerSecond: 45,
    radiusPx: 82,
    exp: 152,
    armorBp: 2_600,
    controlResistanceBp: 5_000,
    movement: 'ground',
    renderAssetId: 'MON_ECLIPSE_KUN_EMPEROR',
    renderScaleBp: 10_000,
    guardAuraArmorBp: 2_500,
    guardAuraRadiusPx: 400,
  },
};

const stage06Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_PHASE_SHELL_WEAVER: {
    id: 'MON_PHASE_SHELL_WEAVER',
    name: '蜃壳镜卫',
    maxHpMilli: 165_000,
    speedPxPerSecond: 66,
    radiusPx: 38,
    exp: 22,
    armorBp: 1_400,
    controlResistanceBp: 2_500,
    movement: 'ground',
    renderAssetId: 'MON_PHASE_SHELL_WEAVER',
    renderScaleBp: 10_800,
    phaseShellAboveHpBp: 6_000,
    phaseShellMaxHitDamageBp: 250,
  },
  MON_MIRAGE_MOTHER: {
    id: 'MON_MIRAGE_MOTHER',
    name: '万相蜃母',
    maxHpMilli: 1_900_000,
    speedPxPerSecond: 43,
    radiusPx: 86,
    exp: 174,
    armorBp: 3_000,
    controlResistanceBp: 5_200,
    movement: 'ground',
    renderAssetId: 'MON_MIRAGE_MOTHER',
    renderScaleBp: 10_000,
    phaseShellAboveHpBp: 7_000,
    phaseShellMaxHitDamageBp: 15,
  },
};

const stage01Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N01_01',
    index: 1,
    hpMultiplierBp: 10_550,
    expMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 5, intervalTicks: 33 },
      { enemyId: 'MON_SWIFT_EEL', count: 2, intervalTicks: 38 },
    ],
  },
  {
    id: 'WAVE_N01_02',
    index: 2,
    hpMultiplierBp: 11_100,
    expMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 33 },
      { enemyId: 'MON_TIDE_IMP', count: 2, intervalTicks: 38 },
    ],
  },
  {
    id: 'WAVE_N01_03',
    index: 3,
    hpMultiplierBp: 11_650,
    expMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 33 },
      { enemyId: 'MON_SWIFT_EEL', count: 2, intervalTicks: 38 },
    ],
  },
  {
    id: 'WAVE_N01_04',
    index: 4,
    hpMultiplierBp: 12_200,
    expMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 8, intervalTicks: 33 },
      { enemyId: 'MON_TIDE_IMP', count: 2, intervalTicks: 38 },
    ],
  },
  {
    id: 'WAVE_N01_05',
    index: 5,
    hpMultiplierBp: 12_750,
    expMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 9, intervalTicks: 33 },
      { enemyId: 'MON_SWIFT_EEL', count: 2, intervalTicks: 38 },
    ],
  },
];

const cardSource: Array<{
  suffix: string;
  name: string;
  effectId: CardEffectId;
  values: [number, number, number];
  integer: boolean;
  icon: string;
}> = [
  {
    suffix: 'DAMAGE',
    name: '攻击伤害',
    effectId: 'tower-damage',
    values: [800, 1_320, 2_000],
    integer: false,
    icon: 'MOD_DAMAGE',
  },
  {
    suffix: 'FREQUENCY',
    name: '攻击频率',
    effectId: 'tower-frequency',
    values: [600, 990, 1_500],
    integer: false,
    icon: 'MOD_FREQUENCY',
  },
  {
    suffix: 'ARROW_COUNT',
    name: '箭矢数量',
    effectId: 'arrow-count',
    values: [1, 2, 3],
    integer: true,
    icon: 'MOD_ARROW_COUNT',
  },
  {
    suffix: 'PENETRATION',
    name: '穿透次数',
    effectId: 'penetration',
    values: [1, 2, 3],
    integer: true,
    icon: 'MOD_PENETRATION',
  },
  {
    suffix: 'CRIT_RATE',
    name: '暴击率',
    effectId: 'crit-rate',
    values: [400, 660, 1_000],
    integer: false,
    icon: 'MOD_CRIT_RATE',
  },
  {
    suffix: 'CRIT_DAMAGE',
    name: '暴击伤害',
    effectId: 'crit-damage',
    values: [1_200, 1_980, 3_000],
    integer: false,
    icon: 'MOD_CRIT_DAMAGE',
  },
];

const qualities = ['G', 'B', 'P'] as const;
const cards: CardDefinition[] = cardSource.flatMap((source) =>
  qualities.map((quality, qualityIndex) => {
    const shared = {
      id: `CARD_BASIC_${source.suffix}_${quality}`,
      name: source.name,
      quality,
      effectId: source.effectId,
      iconAssetId: source.icon,
    };

    return source.integer
      ? { ...shared, valueInt: source.values[qualityIndex] ?? 0 }
      : { ...shared, valueBp: source.values[qualityIndex] ?? 0 };
  }),
);

const stage02RoutePoints: Point[] = [
  { x: 720, y: -70 },
  { x: 760, y: 100 },
  { x: 920, y: 240 },
  { x: 770, y: 390 },
  { x: 980, y: 540 },
  { x: 780, y: 690 },
  { x: 930, y: 840 },
  { x: 700, y: 990 },
  { x: 620, y: 1150 },
];

const stage02TowerAnchors: [Point, Point, Point] = [
  { x: 1100, y: 245 },
  { x: 1160, y: 540 },
  { x: 1050, y: 880 },
];

const stage02Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N02_01',
    index: 1,
    hpMultiplierBp: 17_550,
    expMultiplierBp: 11_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 21 },
      { enemyId: 'MON_SWIFT_EEL', count: 4, intervalTicks: 19 },
    ],
  },
  {
    id: 'WAVE_N02_02',
    index: 2,
    hpMultiplierBp: 19_240,
    expMultiplierBp: 11_500,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 7, intervalTicks: 20 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 25 },
      { enemyId: 'MON_SWIFT_EEL', count: 2, intervalTicks: 18 },
    ],
  },
  {
    id: 'WAVE_N02_03',
    index: 3,
    hpMultiplierBp: 21_060,
    expMultiplierBp: 11_800,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 15 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 22 },
    ],
  },
  {
    id: 'WAVE_N02_04',
    index: 4,
    hpMultiplierBp: 23_140,
    expMultiplierBp: 12_200,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 19 },
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 24 },
      { enemyId: 'MON_SWIFT_EEL', count: 3, intervalTicks: 17 },
    ],
  },
  {
    id: 'WAVE_N02_05',
    index: 5,
    hpMultiplierBp: 25_740,
    expMultiplierBp: 12_500,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 8, intervalTicks: 22 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 16 },
      { enemyId: 'MON_TIDE_IMP', count: 4, intervalTicks: 18 },
    ],
  },
];

const stage03RoutePoints: Point[] = [
  { x: 650, y: -70 },
  { x: 650, y: 135 },
  { x: 820, y: 255 },
  { x: 1130, y: 330 },
  { x: 1260, y: 480 },
  { x: 1120, y: 610 },
  { x: 780, y: 700 },
  { x: 840, y: 850 },
  { x: 1230, y: 930 },
];

const stage03TowerAnchors: [Point, Point, Point] = [
  { x: 1060, y: 190 },
  { x: 510, y: 470 },
  { x: 1390, y: 660 },
];

const stage03Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N03_01',
    index: 1,
    hpMultiplierBp: 15_000,
    expMultiplierBp: 12_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 19 },
      { enemyId: 'MON_SWIFT_EEL', count: 4, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 24 },
    ],
  },
  {
    id: 'WAVE_N03_02',
    index: 2,
    hpMultiplierBp: 21_000,
    expMultiplierBp: 12_800,
    speedMultiplierBp: 10_250,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 16 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 18 },
      { enemyId: 'MON_SHELL_CRAB', count: 4, intervalTicks: 23 },
    ],
  },
  {
    id: 'WAVE_N03_03',
    index: 3,
    hpMultiplierBp: 30_000,
    expMultiplierBp: 13_100,
    speedMultiplierBp: 10_500,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 3, intervalTicks: 27 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 15 },
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 22 },
    ],
  },
  {
    id: 'WAVE_N03_04',
    index: 4,
    hpMultiplierBp: 45_000,
    expMultiplierBp: 13_400,
    speedMultiplierBp: 10_750,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 2, intervalTicks: 26 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 16 },
      { enemyId: 'MON_SHELL_CRAB', count: 4, intervalTicks: 21 },
    ],
  },
  {
    id: 'WAVE_N03_05',
    index: 5,
    hpMultiplierBp: 65_000,
    expMultiplierBp: 13_800,
    speedMultiplierBp: 11_000,
    groups: [
      { enemyId: 'MON_DRAGON_TORTOISE', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 4, intervalTicks: 16 },
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 20 },
      { enemyId: 'MON_REEF_GUARD', count: 4, intervalTicks: 25 },
    ],
  },
];

const stage04RoutePoints: Point[] = [
  { x: 1320, y: -70 },
  { x: 1320, y: 140 },
  { x: 1430, y: 300 },
  { x: 1350, y: 500 },
  { x: 1120, y: 690 },
  { x: 800, y: 720 },
  { x: 600, y: 760 },
  { x: 820, y: 850 },
  { x: 980, y: 1120 },
];

const stage04TowerAnchors: [Point, Point, Point] = [
  { x: 600, y: 260 },
  { x: 1710, y: 450 },
  { x: 1300, y: 800 },
];

const stage04Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N04_01',
    index: 1,
    hpMultiplierBp: 10_000,
    expMultiplierBp: 15_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 19 },
      { enemyId: 'MON_SWIFT_EEL', count: 3, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 23 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 1, intervalTicks: 22 },
    ],
  },
  {
    id: 'WAVE_N04_02',
    index: 2,
    hpMultiplierBp: 17_000,
    expMultiplierBp: 13_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 22 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 17 },
      { enemyId: 'MON_SWIFT_EEL', count: 4, intervalTicks: 15 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 4, intervalTicks: 20 },
    ],
  },
  {
    id: 'WAVE_N04_03',
    index: 3,
    hpMultiplierBp: 26_000,
    expMultiplierBp: 12_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 3, intervalTicks: 23 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 5, intervalTicks: 18 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 16 },
    ],
  },
  {
    id: 'WAVE_N04_04',
    index: 4,
    hpMultiplierBp: 36_000,
    expMultiplierBp: 12_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 6, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 20 },
      { enemyId: 'MON_REEF_GUARD', count: 3, intervalTicks: 22 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 4, intervalTicks: 16 },
    ],
  },
  {
    id: 'WAVE_N04_05',
    index: 5,
    hpMultiplierBp: 50_000,
    expMultiplierBp: 13_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 4, intervalTicks: 14 },
      { enemyId: 'MON_ABYSS_WYRM', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 4, intervalTicks: 18 },
      { enemyId: 'MON_REEF_GUARD', count: 4, intervalTicks: 22 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 13 },
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 20 },
    ],
  },
];

const stage05RoutePoints: Point[] = [
  { x: 960, y: -70 },
  { x: 960, y: 160 },
  { x: 1120, y: 230 },
  { x: 1170, y: 400 },
  { x: 1190, y: 560 },
  { x: 1050, y: 670 },
  { x: 830, y: 720 },
  { x: 690, y: 770 },
  { x: 770, y: 850 },
  { x: 930, y: 1120 },
];

const stage05TowerAnchors: [Point, Point, Point] = [
  { x: 570, y: 355 },
  { x: 1382, y: 354 },
  { x: 463, y: 620 },
];

const stage05Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N05_01',
    index: 1,
    hpMultiplierBp: 10_000,
    expMultiplierBp: 15_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 20 },
      { enemyId: 'MON_SWIFT_EEL', count: 3, intervalTicks: 18 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 23 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 1, intervalTicks: 22 },
    ],
  },
  {
    id: 'WAVE_N05_02',
    index: 2,
    hpMultiplierBp: 15_500,
    expMultiplierBp: 14_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 22 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 1, intervalTicks: 20 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 18 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 16 },
    ],
  },
  {
    id: 'WAVE_N05_03',
    index: 3,
    hpMultiplierBp: 24_000,
    expMultiplierBp: 13_200,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 4, intervalTicks: 23 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 1, intervalTicks: 19 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 15 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 22 },
    ],
  },
  {
    id: 'WAVE_N05_04',
    index: 4,
    hpMultiplierBp: 34_000,
    expMultiplierBp: 13_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 20 },
      { enemyId: 'MON_REEF_GUARD', count: 4, intervalTicks: 22 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 1, intervalTicks: 18 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 7, intervalTicks: 16 },
    ],
  },
  {
    id: 'WAVE_N05_05',
    index: 5,
    hpMultiplierBp: 48_000,
    expMultiplierBp: 14_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 1, intervalTicks: 20 },
      { enemyId: 'MON_ECLIPSE_KUN_EMPEROR', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 3, intervalTicks: 18 },
      { enemyId: 'MON_REEF_GUARD', count: 5, intervalTicks: 21 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 13 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 19 },
      { enemyId: 'MON_TIDE_IMP', count: 3, intervalTicks: 16 },
    ],
  },
];

const stage06RoutePoints: Point[] = [
  { x: 960, y: -70 },
  { x: 960, y: 150 },
  { x: 1100, y: 220 },
  { x: 1162, y: 381 },
  { x: 1210, y: 520 },
  { x: 1280, y: 650 },
  { x: 1450, y: 720 },
  { x: 1360, y: 800 },
  { x: 1250, y: 850 },
  { x: 1270, y: 930 },
  { x: 980, y: 1120 },
];

const stage06TowerAnchors: [Point, Point, Point] = [
  { x: 650, y: 292 },
  { x: 1348, y: 292 },
  { x: 978, y: 805 },
];

const stage06Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N06_01',
    index: 1,
    hpMultiplierBp: 10_000,
    expMultiplierBp: 15_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 19 },
      { enemyId: 'MON_SWIFT_EEL', count: 4, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 22 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 1, intervalTicks: 20 },
    ],
  },
  {
    id: 'WAVE_N06_02',
    index: 2,
    hpMultiplierBp: 18_500,
    expMultiplierBp: 13_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 3, intervalTicks: 21 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 2, intervalTicks: 19 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 17 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 15 },
    ],
  },
  {
    id: 'WAVE_N06_03',
    index: 3,
    hpMultiplierBp: 30_000,
    expMultiplierBp: 12_500,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 4, intervalTicks: 22 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 3, intervalTicks: 18 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 16 },
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 21 },
    ],
  },
  {
    id: 'WAVE_N06_04',
    index: 4,
    hpMultiplierBp: 47_000,
    expMultiplierBp: 12_300,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 19 },
      { enemyId: 'MON_REEF_GUARD', count: 4, intervalTicks: 21 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 4, intervalTicks: 17 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 13 },
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 15 },
    ],
  },
  {
    id: 'WAVE_N06_05',
    index: 5,
    hpMultiplierBp: 68_000,
    expMultiplierBp: 13_200,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 1, intervalTicks: 18 },
      { enemyId: 'MON_MIRAGE_MOTHER', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 4, intervalTicks: 17 },
      { enemyId: 'MON_REEF_GUARD', count: 5, intervalTicks: 20 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB', count: 4, intervalTicks: 18 },
      { enemyId: 'MON_TIDE_IMP', count: 4, intervalTicks: 15 },
    ],
  },
];

const stage01SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_01_RELEASE_ID,
  configHash: STAGE_01_CONFIG_HASH,
  stage: {
    id: 'STAGE_01',
    name: '关外练兵场',
    backgroundAssetId: 'STAGE_01_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_01',
    points: stage01RoutePoints,
    towerAnchors: stage01TowerAnchors,
    breachPoint: stage01RoutePoints[stage01RoutePoints.length - 1] ?? { x: 680, y: 1140 },
  },
  tower: {
    baseDamageMilli: 24_000,
    attackIntervalTicks: 24,
    rangePx: 360,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 8_500,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies,
  waves: stage01Waves,
  cards,
  rules: {
    maxLevel: 50,
    groupGapTicks: 45,
    waveGapTicks: 90,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 2,
  },
};

const stage02SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_02_RELEASE_ID,
  configHash: STAGE_02_CONFIG_HASH,
  stage: {
    id: 'STAGE_02',
    name: '东海礁港',
    backgroundAssetId: 'STAGE_02_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_02_REEF',
    points: stage02RoutePoints,
    towerAnchors: stage02TowerAnchors,
    breachPoint: stage02RoutePoints[stage02RoutePoints.length - 1] ?? { x: 620, y: 1150 },
  },
  tower: {
    baseDamageMilli: 24_000,
    attackIntervalTicks: 24,
    rangePx: 900,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 8_500,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies,
  waves: stage02Waves,
  cards,
  rules: {
    maxLevel: 50,
    groupGapTicks: 24,
    waveGapTicks: 75,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 2,
  },
};

const stage03SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_03_RELEASE_ID,
  configHash: STAGE_03_CONFIG_HASH,
  stage: {
    id: 'STAGE_03',
    name: '镇海龙门',
    backgroundAssetId: 'STAGE_03_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_03_DRAGON_GATE',
    points: stage03RoutePoints,
    towerAnchors: stage03TowerAnchors,
    breachPoint: stage03RoutePoints[stage03RoutePoints.length - 1] ?? { x: 1230, y: 930 },
  },
  tower: {
    baseDamageMilli: 24_000,
    attackIntervalTicks: 24,
    rangePx: 900,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 8_500,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies,
  waves: stage03Waves,
  cards,
  rules: {
    maxLevel: 50,
    groupGapTicks: 20,
    waveGapTicks: 60,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 2,
  },
};

const stage04SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_04_RELEASE_ID,
  configHash: STAGE_04_CONFIG_HASH,
  stage: {
    id: 'STAGE_04',
    name: '归墟潮眼',
    backgroundAssetId: 'STAGE_04_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_04_GUIXU',
    points: stage04RoutePoints,
    towerAnchors: stage04TowerAnchors,
    breachPoint: stage04RoutePoints[stage04RoutePoints.length - 1] ?? { x: 980, y: 1120 },
  },
  tower: {
    baseDamageMilli: 24_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 8_500,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage04Enemies,
  waves: stage04Waves,
  cards,
  rules: {
    maxLevel: 50,
    groupGapTicks: 18,
    waveGapTicks: 55,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 2,
  },
};

const stage05SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_05_RELEASE_ID,
  configHash: STAGE_05_CONFIG_HASH,
  stage: {
    id: 'STAGE_05',
    name: '扶桑天阙',
    backgroundAssetId: 'STAGE_05_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_05_FUSANG',
    points: stage05RoutePoints,
    towerAnchors: stage05TowerAnchors,
    breachPoint: stage05RoutePoints[stage05RoutePoints.length - 1] ?? { x: 930, y: 1120 },
  },
  tower: {
    baseDamageMilli: 24_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 8_500,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage05Enemies,
  waves: stage05Waves,
  cards,
  rules: {
    maxLevel: 50,
    groupGapTicks: 18,
    waveGapTicks: 52,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 2,
  },
};

const stage06SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_06_RELEASE_ID,
  configHash: STAGE_06_CONFIG_HASH,
  stage: {
    id: 'STAGE_06',
    name: '太初蜃庭',
    backgroundAssetId: 'STAGE_06_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_06_MIRAGE_COURT',
    points: stage06RoutePoints,
    towerAnchors: stage06TowerAnchors,
    breachPoint: stage06RoutePoints[stage06RoutePoints.length - 1] ?? { x: 980, y: 1120 },
  },
  tower: {
    baseDamageMilli: 24_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 8_500,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage06Enemies,
  waves: stage06Waves,
  cards,
  rules: {
    maxLevel: 50,
    groupGapTicks: 14,
    waveGapTicks: 45,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 2,
  },
};

function cloneBundle(source: BattleBundleV1): BattleBundleV1 {
  return JSON.parse(JSON.stringify(source)) as BattleBundleV1;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

export const STAGE_01_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage01SourceBundle));
export const STAGE_02_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage02SourceBundle));
export const STAGE_03_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage03SourceBundle));
export const STAGE_04_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage04SourceBundle));
export const STAGE_05_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage05SourceBundle));
export const STAGE_06_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage06SourceBundle));
export const STAGE_ORDER = BATTLE_STAGE_ORDER;
export const STAGE_BUNDLES: Record<BattleStageId, BattleBundleV1> = {
  STAGE_01: STAGE_01_BATTLE_BUNDLE,
  STAGE_02: STAGE_02_BATTLE_BUNDLE,
  STAGE_03: STAGE_03_BATTLE_BUNDLE,
  STAGE_04: STAGE_04_BATTLE_BUNDLE,
  STAGE_05: STAGE_05_BATTLE_BUNDLE,
  STAGE_06: STAGE_06_BATTLE_BUNDLE,
};

export function createStage01Bundle(): BattleBundleV1 {
  return cloneBundle(stage01SourceBundle);
}

export function createStage02Bundle(): BattleBundleV1 {
  return cloneBundle(stage02SourceBundle);
}

export function createStage03Bundle(): BattleBundleV1 {
  return cloneBundle(stage03SourceBundle);
}

export function createStage04Bundle(): BattleBundleV1 {
  return cloneBundle(stage04SourceBundle);
}

export function createStage05Bundle(): BattleBundleV1 {
  return cloneBundle(stage05SourceBundle);
}

export function createStage06Bundle(): BattleBundleV1 {
  return cloneBundle(stage06SourceBundle);
}
