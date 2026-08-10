import type {
  BattleBundleV1,
  BattleStageId,
  CardDefinition,
  CardEffectId,
  EnemyDefinition,
  Point,
  RouteDefinition,
  WaveDefinition,
} from './contracts';
import { BATTLE_STAGE_ORDER } from './contracts';

const STAGE_01_RELEASE_ID = 'GG_S01_ALPHA_V2';
const STAGE_01_CONFIG_HASH = 'sha256:625f721bee82c5e1a4013c313d91e49325fa905bc09e32b59e6dd3327f47e022';
const STAGE_02_RELEASE_ID = 'GG_S02_ALPHA_V4';
const STAGE_02_CONFIG_HASH = 'sha256:cd35b88bfed572e3b2614a05427f5934e7b3460e547d6def51561b6ef00a060c';
const STAGE_03_RELEASE_ID = 'GG_S03_ALPHA_V3';
const STAGE_03_CONFIG_HASH = 'sha256:f499da5202c13130917d478bfc803c7e5861d88f652d469d148b94b13c47ff88';
const STAGE_04_RELEASE_ID = 'GG_S04_ALPHA_V3';
const STAGE_04_CONFIG_HASH = 'sha256:50f9d6d347498b96e9fb11a9de7f0e672b1f5b0d59d879ac87dad174cba1689c';
const STAGE_05_RELEASE_ID = 'GG_S05_ALPHA_V3';
const STAGE_05_CONFIG_HASH = 'sha256:f5e89e97765a33cc222809e4b9f2e31db09df8750f79f74b58487c2de763098a';
const STAGE_06_RELEASE_ID = 'GG_S06_ALPHA_V2';
const STAGE_06_CONFIG_HASH = 'sha256:e73d0601162822ad2623a946a4a377e4ff465304c646f7ff21824d64b2618f97';
const STAGE_07_RELEASE_ID = 'GG_S07_ALPHA_V2';
const STAGE_07_CONFIG_HASH = 'sha256:63ee858fe072a9fae6c39a7903d81e3ed30b6464442c7ed574c5b6686acbd90a';
const STAGE_08_RELEASE_ID = 'GG_S08_ENDLESS_V2';
const STAGE_08_CONFIG_HASH = 'sha256:2a02b1bc3bcccfc34b8ed396fab71e4beedad8cbcf9cf918ea87ccccf6fd06db';

// Quantized offline from: 1 + 0.11 * minute + 0.018 * minute^1.35.
// Index is elapsed whole seconds (0...1200); battle ticks only perform integer lookup.
// Seconds 900...1200 apply round(base * (300 + 30 * (second - 900)) / 300).
const stage08ThreatLutBp: number[] = [
  10_000, 10_019, 10_038, 10_058, 10_078, 10_098, 10_118, 10_138, 10_159, 10_179, 10_199, 10_220,
  10_240, 10_261, 10_282, 10_303, 10_324, 10_344, 10_365, 10_386, 10_408, 10_429, 10_450, 10_471,
  10_492, 10_514, 10_535, 10_556, 10_578, 10_599, 10_621, 10_642, 10_664, 10_685, 10_707, 10_729,
  10_750, 10_772, 10_794, 10_816, 10_837, 10_859, 10_881, 10_903, 10_925, 10_947, 10_969, 10_991,
  11_013, 11_035, 11_057, 11_080, 11_102, 11_124, 11_146, 11_168, 11_191, 11_213, 11_235, 11_258,
  11_280, 11_302, 11_325, 11_347, 11_370, 11_392, 11_415, 11_437, 11_460, 11_482, 11_505, 11_528,
  11_550, 11_573, 11_596, 11_618, 11_641, 11_664, 11_687, 11_709, 11_732, 11_755, 11_778, 11_801,
  11_823, 11_846, 11_869, 11_892, 11_915, 11_938, 11_961, 11_984, 12_007, 12_030, 12_053, 12_076,
  12_099, 12_123, 12_146, 12_169, 12_192, 12_215, 12_238, 12_262, 12_285, 12_308, 12_331, 12_355,
  12_378, 12_401, 12_425, 12_448, 12_471, 12_495, 12_518, 12_542, 12_565, 12_588, 12_612, 12_635,
  12_659, 12_682, 12_706, 12_729, 12_753, 12_777, 12_800, 12_824, 12_847, 12_871, 12_895, 12_918,
  12_942, 12_966, 12_989, 13_013, 13_037, 13_060, 13_084, 13_108, 13_132, 13_155, 13_179, 13_203,
  13_227, 13_251, 13_275, 13_298, 13_322, 13_346, 13_370, 13_394, 13_418, 13_442, 13_466, 13_490,
  13_514, 13_538, 13_562, 13_586, 13_610, 13_634, 13_658, 13_682, 13_706, 13_730, 13_754, 13_779,
  13_803, 13_827, 13_851, 13_875, 13_899, 13_924, 13_948, 13_972, 13_996, 14_020, 14_045, 14_069,
  14_093, 14_117, 14_142, 14_166, 14_190, 14_215, 14_239, 14_263, 14_288, 14_312, 14_337, 14_361,
  14_385, 14_410, 14_434, 14_459, 14_483, 14_508, 14_532, 14_557, 14_581, 14_606, 14_630, 14_655,
  14_679, 14_704, 14_728, 14_753, 14_778, 14_802, 14_827, 14_851, 14_876, 14_901, 14_925, 14_950,
  14_975, 14_999, 15_024, 15_049, 15_073, 15_098, 15_123, 15_148, 15_172, 15_197, 15_222, 15_247,
  15_271, 15_296, 15_321, 15_346, 15_371, 15_395, 15_420, 15_445, 15_470, 15_495, 15_520, 15_545,
  15_570, 15_595, 15_619, 15_644, 15_669, 15_694, 15_719, 15_744, 15_769, 15_794, 15_819, 15_844,
  15_869, 15_894, 15_919, 15_944, 15_969, 15_995, 16_020, 16_045, 16_070, 16_095, 16_120, 16_145,
  16_170, 16_195, 16_221, 16_246, 16_271, 16_296, 16_321, 16_346, 16_372, 16_397, 16_422, 16_447,
  16_473, 16_498, 16_523, 16_548, 16_574, 16_599, 16_624, 16_649, 16_675, 16_700, 16_725, 16_751,
  16_776, 16_801, 16_827, 16_852, 16_878, 16_903, 16_928, 16_954, 16_979, 17_005, 17_030, 17_055,
  17_081, 17_106, 17_132, 17_157, 17_183, 17_208, 17_234, 17_259, 17_285, 17_310, 17_336, 17_361,
  17_387, 17_412, 17_438, 17_463, 17_489, 17_515, 17_540, 17_566, 17_591, 17_617, 17_643, 17_668,
  17_694, 17_720, 17_745, 17_771, 17_797, 17_822, 17_848, 17_874, 17_899, 17_925, 17_951, 17_976,
  18_002, 18_028, 18_054, 18_079, 18_105, 18_131, 18_157, 18_182, 18_208, 18_234, 18_260, 18_286,
  18_312, 18_337, 18_363, 18_389, 18_415, 18_441, 18_467, 18_492, 18_518, 18_544, 18_570, 18_596,
  18_622, 18_648, 18_674, 18_700, 18_726, 18_752, 18_778, 18_804, 18_830, 18_856, 18_882, 18_907,
  18_933, 18_960, 18_986, 19_012, 19_038, 19_064, 19_090, 19_116, 19_142, 19_168, 19_194, 19_220,
  19_246, 19_272, 19_298, 19_324, 19_350, 19_377, 19_403, 19_429, 19_455, 19_481, 19_507, 19_533,
  19_560, 19_586, 19_612, 19_638, 19_664, 19_691, 19_717, 19_743, 19_769, 19_795, 19_822, 19_848,
  19_874, 19_900, 19_927, 19_953, 19_979, 20_006, 20_032, 20_058, 20_084, 20_111, 20_137, 20_163,
  20_190, 20_216, 20_242, 20_269, 20_295, 20_322, 20_348, 20_374, 20_401, 20_427, 20_453, 20_480,
  20_506, 20_533, 20_559, 20_586, 20_612, 20_638, 20_665, 20_691, 20_718, 20_744, 20_771, 20_797,
  20_824, 20_850, 20_877, 20_903, 20_930, 20_956, 20_983, 21_009, 21_036, 21_062, 21_089, 21_116,
  21_142, 21_169, 21_195, 21_222, 21_248, 21_275, 21_302, 21_328, 21_355, 21_381, 21_408, 21_435,
  21_461, 21_488, 21_515, 21_541, 21_568, 21_595, 21_621, 21_648, 21_675, 21_701, 21_728, 21_755,
  21_782, 21_808, 21_835, 21_862, 21_888, 21_915, 21_942, 21_969, 21_996, 22_022, 22_049, 22_076,
  22_103, 22_129, 22_156, 22_183, 22_210, 22_237, 22_263, 22_290, 22_317, 22_344, 22_371, 22_398,
  22_425, 22_451, 22_478, 22_505, 22_532, 22_559, 22_586, 22_613, 22_640, 22_667, 22_693, 22_720,
  22_747, 22_774, 22_801, 22_828, 22_855, 22_882, 22_909, 22_936, 22_963, 22_990, 23_017, 23_044,
  23_071, 23_098, 23_125, 23_152, 23_179, 23_206, 23_233, 23_260, 23_287, 23_314, 23_341, 23_368,
  23_395, 23_422, 23_450, 23_477, 23_504, 23_531, 23_558, 23_585, 23_612, 23_639, 23_666, 23_694,
  23_721, 23_748, 23_775, 23_802, 23_829, 23_856, 23_884, 23_911, 23_938, 23_965, 23_992, 24_020,
  24_047, 24_074, 24_101, 24_128, 24_156, 24_183, 24_210, 24_237, 24_265, 24_292, 24_319, 24_346,
  24_374, 24_401, 24_428, 24_455, 24_483, 24_510, 24_537, 24_565, 24_592, 24_619, 24_647, 24_674,
  24_701, 24_729, 24_756, 24_783, 24_811, 24_838, 24_865, 24_893, 24_920, 24_948, 24_975, 25_002,
  25_030, 25_057, 25_085, 25_112, 25_139, 25_167, 25_194, 25_222, 25_249, 25_277, 25_304, 25_331,
  25_359, 25_386, 25_414, 25_441, 25_469, 25_496, 25_524, 25_551, 25_579, 25_606, 25_634, 25_661,
  25_689, 25_716, 25_744, 25_771, 25_799, 25_827, 25_854, 25_882, 25_909, 25_937, 25_964, 25_992,
  26_019, 26_047, 26_075, 26_102, 26_130, 26_157, 26_185, 26_213, 26_240, 26_268, 26_296, 26_323,
  26_351, 26_379, 26_406, 26_434, 26_462, 26_489, 26_517, 26_545, 26_572, 26_600, 26_628, 26_655,
  26_683, 26_711, 26_738, 26_766, 26_794, 26_822, 26_849, 26_877, 26_905, 26_933, 26_960, 26_988,
  27_016, 27_044, 27_071, 27_099, 27_127, 27_155, 27_183, 27_210, 27_238, 27_266, 27_294, 27_322,
  27_349, 27_377, 27_405, 27_433, 27_461, 27_489, 27_516, 27_544, 27_572, 27_600, 27_628, 27_656,
  27_684, 27_712, 27_739, 27_767, 27_795, 27_823, 27_851, 27_879, 27_907, 27_935, 27_963, 27_991,
  28_019, 28_047, 28_075, 28_102, 28_130, 28_158, 28_186, 28_214, 28_242, 28_270, 28_298, 28_326,
  28_354, 28_382, 28_410, 28_438, 28_466, 28_494, 28_522, 28_550, 28_578, 28_606, 28_634, 28_663,
  28_691, 28_719, 28_747, 28_775, 28_803, 28_831, 28_859, 28_887, 28_915, 28_943, 28_971, 28_999,
  29_028, 29_056, 29_084, 29_112, 29_140, 29_168, 29_196, 29_224, 29_253, 29_281, 29_309, 29_337,
  29_365, 29_393, 29_422, 29_450, 29_478, 29_506, 29_534, 29_562, 29_591, 29_619, 29_647, 29_675,
  29_703, 29_732, 29_760, 29_788, 29_816, 29_845, 29_873, 29_901, 29_929, 29_958, 29_986, 30_014,
  30_042, 30_071, 30_099, 30_127, 30_156, 30_184, 30_212, 30_240, 30_269, 30_297, 30_325, 30_354,
  30_382, 30_410, 30_439, 30_467, 30_495, 30_524, 30_552, 30_580, 30_609, 30_637, 30_665, 30_694,
  30_722, 30_751, 30_779, 30_807, 30_836, 30_864, 30_893, 30_921, 30_949, 30_978, 31_006, 31_035,
  31_063, 31_092, 31_120, 31_148, 31_177, 31_205, 31_234, 31_262, 31_291, 31_319, 31_348, 31_376,
  31_405, 31_433, 31_462, 31_490, 31_519, 31_547, 31_576, 31_604, 31_633, 31_661, 31_690, 31_718,
  31_747, 31_775, 31_804, 31_832, 31_861, 31_889, 31_918, 31_946, 31_975, 32_004, 32_032, 32_061,
  32_089, 32_118, 32_147, 32_175, 32_204, 32_232, 32_261, 32_290, 32_318, 32_347, 32_375, 32_404,
  32_433, 32_461, 32_490, 32_519, 32_547, 32_576, 32_605, 32_633, 32_662, 32_691, 32_719, 32_748,
  32_777, 32_805, 32_834, 32_863, 32_891, 32_920, 32_949, 32_977, 33_006, 33_035, 33_064, 33_092,
  33_121, 33_150, 33_179, 33_207, 33_236, 33_265, 33_294, 33_322, 33_351, 33_380, 33_409, 33_437,
  33_466, 36_845, 40_229, 43_619, 47_013, 50_415, 53_822, 57_236, 60_655, 64_078, 67_508, 70_944,
  74_386, 77_834, 81_288, 84_745, 88_210, 91_681, 95_158, 98_641, 102_129, 105_623, 109_120, 112_626,
  116_137, 119_655, 123_178, 126_707, 130_241, 133_782, 137_324, 140_876, 144_434, 147_997, 151_567, 155_142,
  158_723, 162_310, 165_902, 169_501, 173_105, 176_715, 180_331, 183_952, 187_580, 191_208, 194_846, 198_491,
  202_142, 205_798, 209_460, 213_128, 216_802, 220_481, 224_166, 227_858, 231_554, 235_257, 238_966, 242_680,
  246_400, 250_126, 253_858, 257_595, 261_338, 265_095, 268_850, 272_611, 276_377, 280_150, 283_928, 287_712,
  291_502, 295_297, 299_099, 302_906, 306_719, 310_538, 314_362, 318_193, 322_038, 325_880, 329_728, 333_582,
  337_441, 341_307, 345_178, 349_055, 352_937, 356_836, 360_730, 364_630, 368_536, 372_448, 376_366, 380_289,
  384_229, 388_164, 392_105, 396_052, 400_004, 403_962, 407_938, 411_908, 415_883, 419_865, 423_852, 427_857,
  431_856, 435_861, 439_872, 443_889, 447_923, 451_951, 455_985, 460_025, 464_083, 468_135, 472_192, 476_255,
  480_337, 484_412, 488_492, 492_579, 496_684, 500_783, 504_886, 508_996, 513_125, 517_247, 521_374, 525_521,
  529_660, 533_805, 537_955, 542_126, 546_288, 550_456, 554_645, 558_825, 563_010, 567_216, 571_414, 575_617,
  579_841, 584_056, 588_276, 592_518, 596_750, 600_988, 605_248, 609_498, 613_753, 618_031, 622_298, 626_588,
  630_866, 635_151, 639_458, 643_755, 648_074, 652_382, 656_696, 661_033, 665_359, 669_708, 674_045, 678_388,
  682_755, 687_109, 691_488, 695_855, 700_245, 704_623, 709_007, 713_416, 717_811, 722_231, 726_639, 731_071,
  735_490, 739_934, 744_365, 748_821, 753_263, 757_731, 762_185, 766_665, 771_131, 775_622, 780_100, 784_604,
  789_093, 793_608, 798_109, 802_637, 807_149, 811_688, 816_213, 820_764, 825_300, 829_863, 834_411, 838_986,
  843_567, 848_132, 852_725, 857_302, 861_907, 866_495, 871_112, 875_735, 880_341, 884_976, 889_594, 894_240,
  898_892, 903_528, 908_192, 912_840, 917_516, 922_198, 926_863, 931_557, 936_234, 940_940, 945_652, 950_346,
  955_070, 959_800, 964_512, 969_254, 974_002, 978_731, 983_491, 988_257, 993_004, 997_781, 1_002_565, 1_007_330,
  1_012_125, 1_016_927, 1_021_709, 1_026_522, 1_031_342, 1_036_142, 1_040_973, 1_045_810, 1_050_653, 1_055_477, 1_060_332, 1_065_193,
  1_070_034, 1_074_907, 1_079_786, 1_084_672, 1_089_536, 1_094_433, 1_099_336, 1_104_245, 1_109_133, 1_114_054, 1_118_981, 1_123_914,
  1_128_825, 1_133_770, 1_138_721, 1_143_678, 1_148_613, 1_153_581, 1_158_556, 1_163_537, 1_168_523, 1_173_488, 1_178_486, 1_183_491,
  1_188_502, 1_193_518, 1_198_512, 1_203_541, 1_208_575, 1_213_616, 1_218_662, 1_223_715, 1_228_744, 1_233_808, 1_238_878, 1_243_955,
  1_249_037, 1_254_126, 1_259_190, 1_264_290, 1_269_397, 1_274_509, 1_279_627, 1_284_752, 1_289_882, 1_295_018, 1_300_130, 1_305_278,
  1_310_432,
];

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
    breachDamage: 12,
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
    breachDamage: 18,
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
    breachDamage: 30,
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
    breachDamage: 36,
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
    breachDamage: 60,
    armorBp: 3_200,
    controlResistanceBp: 4_000,
    movement: 'ground',
    renderAssetId: 'MON_DRAGON_TORTOISE',
    renderScaleBp: 11_000,
  },
};

function createEnemyVariant(
  source: EnemyDefinition,
  id: string,
  maxHpMilli: number,
  overrides: Partial<EnemyDefinition> = {},
): EnemyDefinition {
  return {
    ...source,
    ...overrides,
    id,
    maxHpMilli,
  };
}

const stage03Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_TIDE_IMP_S03_LATE: createEnemyVariant(
    enemies.MON_TIDE_IMP,
    'MON_TIDE_IMP_S03_LATE',
    27_000,
  ),
  MON_SWIFT_EEL_S03_LATE: createEnemyVariant(
    enemies.MON_SWIFT_EEL,
    'MON_SWIFT_EEL_S03_LATE',
    20_250,
  ),
  MON_SHELL_CRAB_S03_LATE: createEnemyVariant(
    enemies.MON_SHELL_CRAB,
    'MON_SHELL_CRAB_S03_LATE',
    134_400,
  ),
};

const stage04Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_TIDE_IMP_S04_LATE: createEnemyVariant(
    enemies.MON_TIDE_IMP,
    'MON_TIDE_IMP_S04_LATE',
    17_000,
  ),
  MON_SWIFT_EEL_S04_LATE: createEnemyVariant(
    enemies.MON_SWIFT_EEL,
    'MON_SWIFT_EEL_S04_LATE',
    12_750,
  ),
  MON_SHELL_CRAB_S04_LATE: createEnemyVariant(
    enemies.MON_SHELL_CRAB,
    'MON_SHELL_CRAB_S04_LATE',
    92_400,
  ),
  MON_ABYSS_SCALE_GUARD: {
    id: 'MON_ABYSS_SCALE_GUARD',
    name: '噬潮鳞卫',
    maxHpMilli: 260_000,
    speedPxPerSecond: 72,
    radiusPx: 40,
    exp: 18,
    breachDamage: 34,
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
    breachDamage: 62,
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
  MON_TIDE_IMP_S05_LATE: createEnemyVariant(
    enemies.MON_TIDE_IMP,
    'MON_TIDE_IMP_S05_LATE',
    15_000,
  ),
  MON_SWIFT_EEL_S05_LATE: createEnemyVariant(
    enemies.MON_SWIFT_EEL,
    'MON_SWIFT_EEL_S05_LATE',
    11_250,
  ),
  MON_SHELL_CRAB_S05_LATE: createEnemyVariant(
    enemies.MON_SHELL_CRAB,
    'MON_SHELL_CRAB_S05_LATE',
    84_000,
  ),
  MON_SOLAR_FORMATION_PRIEST: {
    id: 'MON_SOLAR_FORMATION_PRIEST',
    name: '曜阵祭司',
    maxHpMilli: 70_000,
    speedPxPerSecond: 60,
    radiusPx: 34,
    exp: 20,
    breachDamage: 30,
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
    maxHpMilli: 1_428_571,
    speedPxPerSecond: 45,
    radiusPx: 82,
    exp: 152,
    breachDamage: 64,
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
  MON_TIDE_IMP_S06_LATE: createEnemyVariant(
    enemies.MON_TIDE_IMP,
    'MON_TIDE_IMP_S06_LATE',
    15_000,
  ),
  MON_SWIFT_EEL_S06_LATE: createEnemyVariant(
    enemies.MON_SWIFT_EEL,
    'MON_SWIFT_EEL_S06_LATE',
    11_250,
  ),
  MON_SHELL_CRAB_S06_LATE: createEnemyVariant(
    enemies.MON_SHELL_CRAB,
    'MON_SHELL_CRAB_S06_LATE',
    84_000,
  ),
  MON_REEF_GUARD_S06_LATE: createEnemyVariant(
    enemies.MON_REEF_GUARD,
    'MON_REEF_GUARD_S06_LATE',
    243_000,
  ),
  MON_PHASE_SHELL_WEAVER: {
    id: 'MON_PHASE_SHELL_WEAVER',
    name: '蜃壳镜卫',
    maxHpMilli: 165_000,
    speedPxPerSecond: 66,
    radiusPx: 38,
    exp: 22,
    breachDamage: 34,
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
    maxHpMilli: 2_555_172,
    speedPxPerSecond: 43,
    radiusPx: 86,
    exp: 174,
    breachDamage: 66,
    armorBp: 3_000,
    controlResistanceBp: 5_200,
    movement: 'ground',
    renderAssetId: 'MON_MIRAGE_MOTHER',
    renderScaleBp: 10_000,
    phaseShellAboveHpBp: 7_000,
    phaseShellMaxHitDamageBp: 15,
  },
};

stage06Enemies.MON_PHASE_SHELL_WEAVER_S06_LATE = createEnemyVariant(
  stage06Enemies.MON_PHASE_SHELL_WEAVER,
  'MON_PHASE_SHELL_WEAVER_S06_LATE',
  132_000,
  { phaseShellMaxHitDamageBp: 1_000 },
);

const stage07Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_TIDE_IMP_S07_LATE: createEnemyVariant(
    enemies.MON_TIDE_IMP,
    'MON_TIDE_IMP_S07_LATE',
    12_000,
  ),
  MON_SWIFT_EEL_S07_LATE: createEnemyVariant(
    enemies.MON_SWIFT_EEL,
    'MON_SWIFT_EEL_S07_LATE',
    9_000,
  ),
  MON_SHELL_CRAB_S07_LATE: createEnemyVariant(
    enemies.MON_SHELL_CRAB,
    'MON_SHELL_CRAB_S07_LATE',
    67_200,
  ),
  MON_REEF_GUARD_S07_LATE: createEnemyVariant(
    enemies.MON_REEF_GUARD,
    'MON_REEF_GUARD_S07_LATE',
    243_000,
  ),
  MON_ETHEREAL_WALKER: {
    id: 'MON_ETHEREAL_WALKER',
    name: '虚相行者',
    maxHpMilli: 200_000,
    speedPxPerSecond: 70,
    radiusPx: 36,
    exp: 23,
    breachDamage: 32,
    armorBp: 800,
    controlResistanceBp: 2_600,
    movement: 'ground',
    renderAssetId: 'MON_ETHEREAL_WALKER',
    renderScaleBp: 10_800,
    etherealCycleTicks: 150,
    etherealSolidTicks: 90,
    etherealDamageTakenBp: 3_000,
  },
  MON_DUAL_PHASE_BOOK_MOTH: {
    id: 'MON_DUAL_PHASE_BOOK_MOTH',
    name: '双相天蠹',
    maxHpMilli: 2_450_000,
    speedPxPerSecond: 41,
    radiusPx: 90,
    exp: 193,
    breachDamage: 68,
    armorBp: 2_600,
    controlResistanceBp: 5_500,
    movement: 'ground',
    renderAssetId: 'MON_DUAL_PHASE_BOOK_MOTH',
    renderScaleBp: 9_000,
    etherealCycleTicks: 210,
    etherealSolidTicks: 105,
    etherealDamageTakenBp: 2_000,
  },
};

stage07Enemies.MON_ETHEREAL_WALKER_S07_LATE = createEnemyVariant(
  stage07Enemies.MON_ETHEREAL_WALKER,
  'MON_ETHEREAL_WALKER_S07_LATE',
  140_000,
);

const stage08Enemies: Record<string, EnemyDefinition> = {
  ...enemies,
  MON_TIDE_IMP: { ...enemies.MON_TIDE_IMP, exp: 20, breachDamage: undefined },
  MON_SWIFT_EEL: { ...enemies.MON_SWIFT_EEL, exp: 20, breachDamage: undefined },
  MON_SHELL_CRAB: { ...enemies.MON_SHELL_CRAB, exp: 33, breachDamage: undefined },
  MON_REEF_GUARD: { ...enemies.MON_REEF_GUARD, exp: 50, breachDamage: undefined },
  MON_DRAGON_TORTOISE: { ...enemies.MON_DRAGON_TORTOISE, breachDamage: undefined },
  MON_ABYSS_SCALE_GUARD: {
    ...stage04Enemies.MON_ABYSS_SCALE_GUARD,
    exp: 45,
    breachDamage: undefined,
  },
  MON_SOLAR_FORMATION_PRIEST: {
    ...stage05Enemies.MON_SOLAR_FORMATION_PRIEST,
    exp: 50,
    breachDamage: undefined,
  },
  MON_PHASE_SHELL_WEAVER: {
    ...stage06Enemies.MON_PHASE_SHELL_WEAVER,
    exp: 55,
    breachDamage: undefined,
  },
  MON_ETHEREAL_WALKER: {
    ...stage07Enemies.MON_ETHEREAL_WALKER,
    exp: 58,
    breachDamage: undefined,
  },
  MON_ABYSS_FLYING_EEL: {
    id: 'MON_ABYSS_FLYING_EEL',
    name: '渊翼飞鳗',
    maxHpMilli: 135_000,
    speedPxPerSecond: 118,
    radiusPx: 25,
    exp: 0,
    armorBp: 800,
    controlResistanceBp: 2_500,
    movement: 'flying',
    renderAssetId: 'MON_SWIFT_EEL',
    renderScaleBp: 11_000,
  },
  BOSS_ABYSS_DRAGON: {
    id: 'BOSS_ABYSS_DRAGON',
    name: '深渊龙王',
    maxHpMilli: 96_000_000,
    speedPxPerSecond: 34,
    radiusPx: 96,
    exp: 0,
    armorBp: 3_000,
    controlResistanceBp: 6_000,
    movement: 'ground',
    renderAssetId: 'BOSS_ABYSS_DRAGON',
    renderScaleBp: 13_500,
    enrageBelowHpBp: 4_000,
    enrageSpeedMultiplierBp: 13_000,
  },
};

const stage01Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N01_01',
    index: 1,
    hpMultiplierBp: 6_000,
    expMultiplierBp: 6_000,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 18 },
      { enemyId: 'MON_TIDE_IMP', count: 5, intervalTicks: 18 },
    ],
  },
  {
    id: 'WAVE_N01_02',
    index: 2,
    hpMultiplierBp: 9_000,
    expMultiplierBp: 6_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 17 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 15 },
    ],
  },
  {
    id: 'WAVE_N01_03',
    index: 3,
    hpMultiplierBp: 11_650,
    expMultiplierBp: 6_000,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 10, intervalTicks: 14 },
      { enemyId: 'MON_TIDE_IMP', count: 6, intervalTicks: 15 },
    ],
  },
  {
    id: 'WAVE_N01_04',
    index: 4,
    hpMultiplierBp: 20_000,
    expMultiplierBp: 6_000,
    speedMultiplierBp: 13_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 10, intervalTicks: 14 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 20 },
    ],
  },
  {
    id: 'WAVE_N01_05',
    index: 5,
    hpMultiplierBp: 25_000,
    expMultiplierBp: 6_000,
    speedMultiplierBp: 15_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 18 },
      { enemyId: 'MON_SWIFT_EEL', count: 10, intervalTicks: 11 },
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB', count: 2, intervalTicks: 17 },
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
const endlessCards: CardDefinition[] = cardSource.flatMap((source) =>
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

const campaignWarPointCosts: Record<
  Extract<CardEffectId, 'tower-damage' | 'tower-frequency' | 'arrow-count' | 'penetration'>,
  [number, number, number]
> = {
  'tower-damage': [18, 30, 48],
  'tower-frequency': [16, 28, 44],
  'arrow-count': [65, 95, 140],
  penetration: [60, 90, 130],
};

const campaignStatCards: CardDefinition[] = endlessCards
  .filter((card) => card.effectId !== 'crit-rate' && card.effectId !== 'crit-damage')
  .map((card) => {
    const costs = campaignWarPointCosts[card.effectId as keyof typeof campaignWarPointCosts];
    const qualityIndex = qualities.indexOf(card.quality);
    return {
      ...card,
      ...(card.effectId === 'arrow-count' || card.effectId === 'penetration'
        ? { valueInt: card.quality === 'P' ? 2 : 1 }
        : {}),
      warPointCost: costs[qualityIndex] ?? costs[0],
    };
  });

const campaignCriticalMasteryCards: CardDefinition[] = qualities.map((quality, qualityIndex) => ({
  id: `CARD_BASIC_CRITICAL_MASTERY_${quality}`,
  name: '会心术',
  quality,
  effectId: 'critical-mastery',
  valueBp: [400, 660, 1_000][qualityIndex] ?? 0,
  secondaryValueBp: [1_200, 1_980, 3_000][qualityIndex] ?? 0,
  warPointCost: [14, 24, 38][qualityIndex] ?? 14,
  iconAssetId: 'MOD_CRIT_RATE',
}));

export const CARD_TOWER_REINFORCEMENT: CardDefinition = {
  id: 'CARD_TOWER_REINFORCEMENT',
  name: '增援箭塔',
  quality: 'G',
  effectId: 'tower-count',
  valueInt: 1,
  iconAssetId: 'MOD_ARROW_COUNT',
};

const campaignCards: CardDefinition[] = [
  ...campaignStatCards,
  ...campaignCriticalMasteryCards,
  CARD_TOWER_REINFORCEMENT,
];

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
    hpMultiplierBp: 8_000,
    expMultiplierBp: 7_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 9, intervalTicks: 14 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 12 },
    ],
  },
  {
    id: 'WAVE_N02_02',
    index: 2,
    hpMultiplierBp: 14_000,
    expMultiplierBp: 7_000,
    groups: [
      { enemyId: 'MON_SHELL_CRAB', count: 4, intervalTicks: 17 },
      { enemyId: 'MON_TIDE_IMP', count: 10, intervalTicks: 13 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 11 },
    ],
  },
  {
    id: 'WAVE_N02_03',
    index: 3,
    hpMultiplierBp: 20_000,
    expMultiplierBp: 6_800,
    groups: [
      { enemyId: 'MON_SWIFT_EEL', count: 10, intervalTicks: 10 },
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 16 },
    ],
  },
  {
    id: 'WAVE_N02_04',
    index: 4,
    hpMultiplierBp: 38_000,
    expMultiplierBp: 6_500,
    speedMultiplierBp: 12_000,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 2, intervalTicks: 17 },
      { enemyId: 'MON_TIDE_IMP', count: 10, intervalTicks: 12 },
      { enemyId: 'MON_SWIFT_EEL', count: 8, intervalTicks: 10 },
      { enemyId: 'MON_SHELL_CRAB', count: 7, intervalTicks: 15 },
    ],
  },
  {
    id: 'WAVE_N02_05',
    index: 5,
    hpMultiplierBp: 42_000,
    expMultiplierBp: 6_500,
    speedMultiplierBp: 13_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 9, intervalTicks: 11 },
      { enemyId: 'MON_SHELL_CRAB', count: 8, intervalTicks: 14 },
      { enemyId: 'MON_REEF_GUARD', count: 3, intervalTicks: 16 },
      { enemyId: 'MON_SWIFT_EEL', count: 12, intervalTicks: 9 },
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
    hpMultiplierBp: 7_000,
    expMultiplierBp: 7_600,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 9, intervalTicks: 12 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 10 },
      { enemyId: 'MON_SHELL_CRAB', count: 4, intervalTicks: 16 },
    ],
  },
  {
    id: 'WAVE_N03_02',
    index: 2,
    hpMultiplierBp: 15_000,
    expMultiplierBp: 7_505,
    speedMultiplierBp: 10_700,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 3, intervalTicks: 17 },
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 15 },
      { enemyId: 'MON_TIDE_IMP', count: 9, intervalTicks: 11 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 9 },
    ],
  },
  {
    id: 'WAVE_N03_03',
    index: 3,
    hpMultiplierBp: 30_000,
    expMultiplierBp: 7_410,
    speedMultiplierBp: 11_400,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 5, intervalTicks: 15 },
      { enemyId: 'MON_SHELL_CRAB_S03_LATE', count: 5, intervalTicks: 14 },
      { enemyId: 'MON_SWIFT_EEL_S03_LATE', count: 9, intervalTicks: 8 },
      { enemyId: 'MON_TIDE_IMP_S03_LATE', count: 8, intervalTicks: 10 },
    ],
  },
  {
    id: 'WAVE_N03_04',
    index: 4,
    hpMultiplierBp: 46_350,
    expMultiplierBp: 7_220,
    speedMultiplierBp: 12_688,
    groups: [
      { enemyId: 'MON_REEF_GUARD', count: 6, intervalTicks: 14 },
      { enemyId: 'MON_SHELL_CRAB_S03_LATE', count: 6, intervalTicks: 13 },
      { enemyId: 'MON_SWIFT_EEL_S03_LATE', count: 10, intervalTicks: 8 },
      { enemyId: 'MON_TIDE_IMP_S03_LATE', count: 8, intervalTicks: 9 },
    ],
  },
  {
    id: 'WAVE_N03_05',
    index: 5,
    hpMultiplierBp: 68_250,
    expMultiplierBp: 7_220,
    speedMultiplierBp: 14_040,
    groups: [
      { enemyId: 'MON_DRAGON_TORTOISE', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_REEF_GUARD', count: 6, intervalTicks: 13 },
      { enemyId: 'MON_SWIFT_EEL_S03_LATE', count: 12, intervalTicks: 7 },
      { enemyId: 'MON_TIDE_IMP_S03_LATE', count: 8, intervalTicks: 9 },
      { enemyId: 'MON_SHELL_CRAB_S03_LATE', count: 8, intervalTicks: 12 },
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
    hpMultiplierBp: 7_000,
    expMultiplierBp: 5_625,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 10 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 9 },
      { enemyId: 'MON_SHELL_CRAB', count: 4, intervalTicks: 14 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 3, intervalTicks: 15 },
    ],
  },
  {
    id: 'WAVE_N04_02',
    index: 2,
    hpMultiplierBp: 17_000,
    expMultiplierBp: 5_313,
    speedMultiplierBp: 10_500,
    groups: [
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 5, intervalTicks: 14 },
      { enemyId: 'MON_SHELL_CRAB', count: 6, intervalTicks: 13 },
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 9 },
      { enemyId: 'MON_SWIFT_EEL', count: 6, intervalTicks: 8 },
    ],
  },
  {
    id: 'WAVE_N04_03',
    index: 3,
    hpMultiplierBp: 26_000,
    expMultiplierBp: 5_125,
    speedMultiplierBp: 11_000,
    groups: [
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 7, intervalTicks: 13 },
      { enemyId: 'MON_REEF_GUARD', count: 6, intervalTicks: 14 },
      { enemyId: 'MON_SWIFT_EEL_S04_LATE', count: 9, intervalTicks: 7 },
      { enemyId: 'MON_TIDE_IMP_S04_LATE', count: 8, intervalTicks: 9 },
    ],
  },
  {
    id: 'WAVE_N04_04',
    index: 4,
    hpMultiplierBp: 36_000,
    expMultiplierBp: 5_000,
    speedMultiplierBp: 12_064,
    groups: [
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 8, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB_S04_LATE', count: 7, intervalTicks: 12 },
      { enemyId: 'MON_REEF_GUARD', count: 6, intervalTicks: 13 },
      { enemyId: 'MON_SWIFT_EEL_S04_LATE', count: 8, intervalTicks: 7 },
      { enemyId: 'MON_TIDE_IMP_S04_LATE', count: 5, intervalTicks: 8 },
    ],
  },
  {
    id: 'WAVE_N04_05',
    index: 5,
    hpMultiplierBp: 51_500,
    expMultiplierBp: 5_000,
    speedMultiplierBp: 13_176,
    groups: [
      { enemyId: 'MON_ABYSS_WYRM', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', count: 6, intervalTicks: 11 },
      { enemyId: 'MON_REEF_GUARD', count: 7, intervalTicks: 12 },
      { enemyId: 'MON_SWIFT_EEL_S04_LATE', count: 12, intervalTicks: 6 },
      { enemyId: 'MON_TIDE_IMP_S04_LATE', count: 7, intervalTicks: 8 },
      { enemyId: 'MON_SHELL_CRAB_S04_LATE', count: 7, intervalTicks: 11 },
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
    hpMultiplierBp: 8_500,
    expMultiplierBp: 9_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 2, intervalTicks: 14 },
      { enemyId: 'MON_SHELL_CRAB', count: 5, intervalTicks: 13 },
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 9 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 8 },
    ],
  },
  {
    id: 'WAVE_N05_02',
    index: 2,
    hpMultiplierBp: 19_000,
    expMultiplierBp: 8_500,
    speedMultiplierBp: 10_400,
    groups: [
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 3, intervalTicks: 13 },
      { enemyId: 'MON_SHELL_CRAB', count: 6, intervalTicks: 12 },
      { enemyId: 'MON_TIDE_IMP', count: 9, intervalTicks: 8 },
      { enemyId: 'MON_SWIFT_EEL', count: 8, intervalTicks: 7 },
    ],
  },
  {
    id: 'WAVE_N05_03',
    index: 3,
    hpMultiplierBp: 30_000,
    expMultiplierBp: 8_000,
    speedMultiplierBp: 10_800,
    groups: [
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 3, intervalTicks: 12 },
      { enemyId: 'MON_REEF_GUARD', count: 6, intervalTicks: 13 },
      { enemyId: 'MON_SHELL_CRAB_S05_LATE', count: 4, intervalTicks: 11 },
      { enemyId: 'MON_SWIFT_EEL_S05_LATE', count: 10, intervalTicks: 7 },
      { enemyId: 'MON_TIDE_IMP_S05_LATE', count: 8, intervalTicks: 8 },
    ],
  },
  {
    id: 'WAVE_N05_04',
    index: 4,
    hpMultiplierBp: 44_000,
    expMultiplierBp: 7_800,
    speedMultiplierBp: 11_424,
    groups: [
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 4, intervalTicks: 11 },
      { enemyId: 'MON_REEF_GUARD', count: 7, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB_S05_LATE', count: 8, intervalTicks: 10 },
      { enemyId: 'MON_SWIFT_EEL_S05_LATE', count: 10, intervalTicks: 6 },
      { enemyId: 'MON_TIDE_IMP_S05_LATE', count: 7, intervalTicks: 8 },
    ],
  },
  {
    id: 'WAVE_N05_05',
    index: 5,
    hpMultiplierBp: 50_000,
    expMultiplierBp: 7_800,
    speedMultiplierBp: 11_600,
    groups: [
      { enemyId: 'MON_ECLIPSE_KUN_EMPEROR', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', count: 4, intervalTicks: 10 },
      { enemyId: 'MON_REEF_GUARD', count: 8, intervalTicks: 11 },
      { enemyId: 'MON_SWIFT_EEL_S05_LATE', count: 12, intervalTicks: 6 },
      { enemyId: 'MON_SHELL_CRAB_S05_LATE', count: 8, intervalTicks: 9 },
      { enemyId: 'MON_TIDE_IMP_S05_LATE', count: 6, intervalTicks: 7 },
      { enemyId: 'MON_REEF_GUARD', count: 3, intervalTicks: 8 },
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
    hpMultiplierBp: 6_500,
    expMultiplierBp: 5_625,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 8, intervalTicks: 8 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 7 },
      { enemyId: 'MON_SHELL_CRAB', count: 6, intervalTicks: 12 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 2, intervalTicks: 13 },
    ],
  },
  {
    id: 'WAVE_N06_02',
    index: 2,
    hpMultiplierBp: 15_000,
    expMultiplierBp: 5_125,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_PHASE_SHELL_WEAVER', count: 4, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB', count: 6, intervalTicks: 11 },
      { enemyId: 'MON_TIDE_IMP', count: 10, intervalTicks: 8 },
      { enemyId: 'MON_SWIFT_EEL', count: 8, intervalTicks: 7 },
    ],
  },
  {
    id: 'WAVE_N06_03',
    index: 3,
    hpMultiplierBp: 27_000,
    expMultiplierBp: 4_875,
    speedMultiplierBp: 11_000,
    groups: [
      { enemyId: 'MON_PHASE_SHELL_WEAVER_S06_LATE', count: 6, intervalTicks: 11 },
      { enemyId: 'MON_REEF_GUARD_S06_LATE', count: 6, intervalTicks: 12 },
      { enemyId: 'MON_SHELL_CRAB_S06_LATE', count: 3, intervalTicks: 10 },
      { enemyId: 'MON_SWIFT_EEL_S06_LATE', count: 10, intervalTicks: 6 },
      { enemyId: 'MON_TIDE_IMP_S06_LATE', count: 8, intervalTicks: 8 },
    ],
  },
  {
    id: 'WAVE_N06_04',
    index: 4,
    hpMultiplierBp: 36_000,
    expMultiplierBp: 4_625,
    speedMultiplierBp: 11_500,
    groups: [
      { enemyId: 'MON_PHASE_SHELL_WEAVER_S06_LATE', count: 8, intervalTicks: 10 },
      { enemyId: 'MON_SHELL_CRAB_S06_LATE', count: 7, intervalTicks: 9 },
      { enemyId: 'MON_REEF_GUARD_S06_LATE', count: 7, intervalTicks: 11 },
      { enemyId: 'MON_SWIFT_EEL_S06_LATE', count: 10, intervalTicks: 6 },
      { enemyId: 'MON_TIDE_IMP_S06_LATE', count: 7, intervalTicks: 7 },
    ],
  },
  {
    id: 'WAVE_N06_05',
    index: 5,
    hpMultiplierBp: 58_000,
    expMultiplierBp: 4_625,
    speedMultiplierBp: 12_000,
    groups: [
      { enemyId: 'MON_MIRAGE_MOTHER', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER_S06_LATE', count: 8, intervalTicks: 9 },
      { enemyId: 'MON_REEF_GUARD_S06_LATE', count: 8, intervalTicks: 10 },
      { enemyId: 'MON_SWIFT_EEL_S06_LATE', count: 12, intervalTicks: 5 },
      { enemyId: 'MON_SHELL_CRAB_S06_LATE', count: 8, intervalTicks: 8 },
      { enemyId: 'MON_TIDE_IMP_S06_LATE', count: 8, intervalTicks: 7 },
    ],
  },
];

const stage07RoutePoints: Point[] = [
  { x: -70, y: 530 },
  { x: 200, y: 530 },
  { x: 440, y: 530 },
  { x: 660, y: 500 },
  { x: 820, y: 390 },
  { x: 970, y: 350 },
  { x: 1130, y: 410 },
  { x: 1270, y: 500 },
  { x: 1360, y: 620 },
  { x: 1400, y: 740 },
  { x: 1340, y: 820 },
  { x: 1270, y: 880 },
  { x: 1290, y: 940 },
  { x: 1180, y: 1120 },
];

const stage07TowerAnchors: [Point, Point, Point] = [
  { x: 589, y: 287 },
  { x: 1406, y: 312 },
  { x: 1034, y: 808 },
];

const stage07Waves: WaveDefinition[] = [
  {
    id: 'WAVE_N07_01',
    index: 1,
    hpMultiplierBp: 4_000,
    expMultiplierBp: 9_000,
    speedMultiplierBp: 10_000,
    groups: [
      { enemyId: 'MON_TIDE_IMP', count: 9, intervalTicks: 8 },
      { enemyId: 'MON_SWIFT_EEL', count: 7, intervalTicks: 7 },
      { enemyId: 'MON_SHELL_CRAB', count: 6, intervalTicks: 11 },
      { enemyId: 'MON_ETHEREAL_WALKER', count: 2, intervalTicks: 12 },
    ],
  },
  {
    id: 'WAVE_N07_02',
    index: 2,
    hpMultiplierBp: 18_000,
    expMultiplierBp: 8_200,
    speedMultiplierBp: 10_500,
    groups: [
      { enemyId: 'MON_ETHEREAL_WALKER', count: 5, intervalTicks: 11 },
      { enemyId: 'MON_SHELL_CRAB', count: 6, intervalTicks: 10 },
      { enemyId: 'MON_TIDE_IMP', count: 10, intervalTicks: 7 },
      { enemyId: 'MON_SWIFT_EEL', count: 8, intervalTicks: 6 },
    ],
  },
  {
    id: 'WAVE_N07_03',
    index: 3,
    hpMultiplierBp: 35_000,
    expMultiplierBp: 7_600,
    speedMultiplierBp: 11_000,
    groups: [
      { enemyId: 'MON_ETHEREAL_WALKER_S07_LATE', count: 7, intervalTicks: 10 },
      { enemyId: 'MON_REEF_GUARD_S07_LATE', count: 7, intervalTicks: 11 },
      { enemyId: 'MON_SHELL_CRAB_S07_LATE', count: 2, intervalTicks: 9 },
      { enemyId: 'MON_SWIFT_EEL_S07_LATE', count: 11, intervalTicks: 6 },
      { enemyId: 'MON_TIDE_IMP_S07_LATE', count: 8, intervalTicks: 7 },
    ],
  },
  {
    id: 'WAVE_N07_04',
    index: 4,
    hpMultiplierBp: 49_000,
    expMultiplierBp: 7_000,
    speedMultiplierBp: 14_500,
    groups: [
      { enemyId: 'MON_ETHEREAL_WALKER_S07_LATE', count: 10, intervalTicks: 9 },
      { enemyId: 'MON_SHELL_CRAB_S07_LATE', count: 8, intervalTicks: 8 },
      { enemyId: 'MON_REEF_GUARD_S07_LATE', count: 8, intervalTicks: 10 },
      { enemyId: 'MON_SWIFT_EEL_S07_LATE', count: 10, intervalTicks: 5 },
      { enemyId: 'MON_TIDE_IMP_S07_LATE', count: 6, intervalTicks: 7 },
    ],
  },
  {
    id: 'WAVE_N07_05',
    index: 5,
    hpMultiplierBp: 55_000,
    expMultiplierBp: 7_000,
    speedMultiplierBp: 18_000,
    groups: [
      { enemyId: 'MON_DUAL_PHASE_BOOK_MOTH', count: 1, intervalTicks: 1 },
      { enemyId: 'MON_ETHEREAL_WALKER_S07_LATE', count: 11, intervalTicks: 8 },
      { enemyId: 'MON_REEF_GUARD_S07_LATE', count: 10, intervalTicks: 9 },
      { enemyId: 'MON_SWIFT_EEL_S07_LATE', count: 13, intervalTicks: 5 },
      { enemyId: 'MON_SHELL_CRAB_S07_LATE', count: 8, intervalTicks: 7 },
      { enemyId: 'MON_TIDE_IMP_S07_LATE', count: 7, intervalTicks: 6 },
    ],
  },
];

const stage08TowerAnchors: [Point, Point, Point] = [
  { x: 720, y: 420 },
  { x: 1080, y: 570 },
  { x: 1350, y: 680 },
];

const stage08Routes: [RouteDefinition, RouteDefinition, RouteDefinition] = [
  {
    id: 'ROUTE_STAGE_08_ABYSS_A',
    points: [
      { x: 300, y: -70 },
      { x: 280, y: 15 },
      { x: 225, y: 100 },
      { x: 195, y: 205 },
      { x: 210, y: 310 },
      { x: 285, y: 410 },
      { x: 405, y: 505 },
      { x: 545, y: 580 },
      { x: 710, y: 655 },
      { x: 890, y: 730 },
      { x: 1080, y: 790 },
      { x: 1280, y: 845 },
      { x: 1480, y: 895 },
      { x: 1680, y: 960 },
      { x: 1885, y: 1035 },
    ],
    towerAnchors: stage08TowerAnchors,
    breachPoint: { x: 1885, y: 1035 },
  },
  {
    id: 'ROUTE_STAGE_08_ABYSS_B',
    points: [
      { x: 330, y: -60 },
      { x: 305, y: 30 },
      { x: 250, y: 110 },
      { x: 225, y: 205 },
      { x: 240, y: 300 },
      { x: 305, y: 390 },
      { x: 420, y: 480 },
      { x: 560, y: 555 },
      { x: 720, y: 625 },
      { x: 900, y: 700 },
      { x: 1090, y: 760 },
      { x: 1290, y: 815 },
      { x: 1490, y: 865 },
      { x: 1690, y: 930 },
      { x: 1900, y: 1030 },
    ],
    towerAnchors: stage08TowerAnchors,
    breachPoint: { x: 1900, y: 1030 },
  },
  {
    id: 'ROUTE_STAGE_08_ABYSS_C',
    points: [
      { x: 360, y: -50 },
      { x: 330, y: 45 },
      { x: 275, y: 120 },
      { x: 255, y: 205 },
      { x: 270, y: 290 },
      { x: 325, y: 370 },
      { x: 435, y: 455 },
      { x: 575, y: 530 },
      { x: 730, y: 595 },
      { x: 910, y: 670 },
      { x: 1100, y: 730 },
      { x: 1300, y: 785 },
      { x: 1500, y: 835 },
      { x: 1700, y: 900 },
      { x: 1915, y: 1005 },
    ],
    towerAnchors: stage08TowerAnchors,
    breachPoint: { x: 1915, y: 1005 },
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
    baseDamageMilli: 32_000,
    attackIntervalTicks: 24,
    rangePx: 360,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies,
  waves: stage01Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_000,
    groupGapTicks: 18,
    waveGapTicks: 55,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 40,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
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
    baseDamageMilli: 32_000,
    attackIntervalTicks: 24,
    rangePx: 600,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies,
  waves: stage02Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_000,
    groupGapTicks: 12,
    waveGapTicks: 45,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 65,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
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
    baseDamageMilli: 32_000,
    attackIntervalTicks: 24,
    rangePx: 600,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage03Enemies,
  waves: stage03Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_000,
    groupGapTicks: 10,
    waveGapTicks: 40,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 95,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
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
    baseDamageMilli: 32_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage04Enemies,
  waves: stage04Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_000,
    groupGapTicks: 8,
    waveGapTicks: 36,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 110,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
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
    baseDamageMilli: 32_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage05Enemies,
  waves: stage05Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_000,
    groupGapTicks: 8,
    waveGapTicks: 34,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 110,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
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
    baseDamageMilli: 32_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage06Enemies,
  waves: stage06Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_300,
    groupGapTicks: 7,
    waveGapTicks: 30,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 125,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
  },
};

const stage07SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_07_RELEASE_ID,
  configHash: STAGE_07_CONFIG_HASH,
  stage: {
    id: 'STAGE_07',
    name: '山河残卷',
    backgroundAssetId: 'STAGE_07_BACKGROUND',
  },
  route: {
    id: 'ROUTE_STAGE_07_BROKEN_SCROLL',
    points: stage07RoutePoints,
    towerAnchors: stage07TowerAnchors,
    breachPoint: stage07RoutePoints[stage07RoutePoints.length - 1] ?? { x: 1180, y: 1120 },
  },
  tower: {
    baseDamageMilli: 40_000,
    attackIntervalTicks: 24,
    rangePx: 750,
    aimHalfAngleU16: 10_923,
    projectileSpeedPxPerSecond: 960,
    projectileRadiusPx: 6,
    baseArrowCount: 1,
    basePenetration: 0,
    penetrationRetentionBp: 7_000,
    critChanceBp: 500,
    critDamageBp: 15_000,
  },
  enemies: stage07Enemies,
  waves: stage07Waves,
  cards: campaignCards,
  rules: {
    maxLevel: 50,
    gateIntegrity: 100,
    reviveGateRestoreBp: 3_000,
    focusDamageBonusBp: 2_500,
    overdriveDurationTicks: 150,
    arrowCountCap: 6,
    penetrationCap: 4,
    volleyDamageFalloffBp: 1_300,
    groupGapTicks: 6,
    waveGapTicks: 26,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 1_000,
    maxRevives: 1,
    initialActiveTowerIds: [0, 1],
    towerBuildCost: 130,
    towerUnlockCompletedWaves: 2,
    shopPurchaseLimitPerWave: 2,
  },
};

const stage08SourceBundle: BattleBundleV1 = {
  schemaVersion: 1,
  releaseId: STAGE_08_RELEASE_ID,
  configHash: STAGE_08_CONFIG_HASH,
  mode: 'endless',
  stage: {
    id: 'STAGE_08',
    name: '无尽潮渊',
    backgroundAssetId: 'STAGE_08_BACKGROUND',
  },
  route: stage08Routes[0],
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
  enemies: stage08Enemies,
  waves: [],
  cards: endlessCards,
  endless: {
    routes: stage08Routes,
    threatEntries: [
      { enemyId: 'MON_TIDE_IMP', unlockTick: 0, threatCost: 3 },
      { enemyId: 'MON_SWIFT_EEL', unlockTick: 0, threatCost: 3 },
      { enemyId: 'MON_SHELL_CRAB', unlockTick: 7_200, threatCost: 6 },
      { enemyId: 'MON_REEF_GUARD', unlockTick: 7_200, threatCost: 9 },
      { enemyId: 'MON_ABYSS_SCALE_GUARD', unlockTick: 14_400, threatCost: 9 },
      { enemyId: 'MON_SOLAR_FORMATION_PRIEST', unlockTick: 14_400, threatCost: 9 },
      { enemyId: 'MON_PHASE_SHELL_WEAVER', unlockTick: 21_600, threatCost: 12 },
      { enemyId: 'MON_ETHEREAL_WALKER', unlockTick: 28_800, threatCost: 12 },
    ],
    miniBossEnemyIds: [
      'MON_ABYSS_SCALE_GUARD',
      'MON_PHASE_SHELL_WEAVER',
      'MON_ETHEREAL_WALKER',
    ],
    bossEnemyId: 'BOSS_ABYSS_DRAGON',
    bossSummonEnemyId: 'MON_ABYSS_FLYING_EEL',
    bossSummonIntervalTicks: 450,
    threatStartTick: 0,
    bossPhaseTick: 36_000,
    settlementTick: 45_000,
    threatPackIntervalTicks: 450,
    unitIntervalTicks: 24,
    maxPackSize: 32,
    maxActiveEnemies: 120,
    miniBossTicks: [14_400, 25_200, 34_200],
    bossLayerGuardTicks: 30,
    bossLayerHpGrowthBp: 12_000,
    bossMaxHpMilli: 2_000_000_000,
    threatLutBp: stage08ThreatLutBp,
  },
  rules: {
    maxLevel: 50,
    groupGapTicks: 24,
    waveGapTicks: 450,
    reviveGuardTicks: 60,
    reviveGroundRollbackBp: 2_500,
    maxRevives: 1,
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
export const STAGE_07_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage07SourceBundle));
export const STAGE_08_BATTLE_BUNDLE: BattleBundleV1 = deepFreeze(cloneBundle(stage08SourceBundle));
export const STAGE_ORDER = BATTLE_STAGE_ORDER;
export const STAGE_BUNDLES: Record<BattleStageId, BattleBundleV1> = {
  STAGE_01: STAGE_01_BATTLE_BUNDLE,
  STAGE_02: STAGE_02_BATTLE_BUNDLE,
  STAGE_03: STAGE_03_BATTLE_BUNDLE,
  STAGE_04: STAGE_04_BATTLE_BUNDLE,
  STAGE_05: STAGE_05_BATTLE_BUNDLE,
  STAGE_06: STAGE_06_BATTLE_BUNDLE,
  STAGE_07: STAGE_07_BATTLE_BUNDLE,
  STAGE_08: STAGE_08_BATTLE_BUNDLE,
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

export function createStage07Bundle(): BattleBundleV1 {
  return cloneBundle(stage07SourceBundle);
}

export function createStage08Bundle(): BattleBundleV1 {
  return cloneBundle(stage08SourceBundle);
}

function routeIndexForSeed(seed: number, routeCount: number): number {
  let mixed = (seed >>> 0) || 0x6d2b79f5;
  mixed ^= 0x8f3d_71b5;
  mixed ^= mixed << 13;
  mixed ^= mixed >>> 17;
  mixed ^= mixed << 5;
  return (mixed >>> 0) % routeCount;
}

export function resolveStageBundleForSeed(stageId: BattleStageId, seed: number): BattleBundleV1 {
  const resolved = cloneBundle(STAGE_BUNDLES[stageId]);
  if ((resolved.mode ?? 'fixed') !== 'endless' || resolved.endless === undefined) {
    return resolved;
  }
  const route = resolved.endless.routes[
    routeIndexForSeed(seed, resolved.endless.routes.length)
  ];
  if (route === undefined) {
    throw new Error(`Endless stage ${stageId} has no route for seed ${seed >>> 0}.`);
  }
  resolved.route = JSON.parse(JSON.stringify(route)) as RouteDefinition;
  return resolved;
}
