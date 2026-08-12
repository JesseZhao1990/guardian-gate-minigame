import { GAME_TITLE_LINES } from '../brand';
import {
  BATTLE_STAGE_ORDER,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  ENEMY_FLAG_ENRAGED,
  ENEMY_FLAG_ETHEREAL,
  ENEMY_FLAG_GUARD_AURA,
  ENEMY_FLAG_GUARDED,
  ENEMY_FLAG_PHASE_SHELL,
  PROJECTILE_FLAG_CRITICAL,
  PROJECTILE_FLAG_FOCUSED,
  PROJECTILE_FLAG_PENETRATION,
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  TICKS_PER_SECOND,
  type BattleBundleV1,
  type BattleEvent,
  type BattleStageId,
  type CardDefinition,
  type EndlessSettlementReason,
  type HitMitigationV1,
  type HudProjectionV1,
  type RenderEntityV1,
  type RenderSnapshotV1,
  type TowerAimAnglesU16,
  type TowerId,
} from '../core/contracts';
import {
  ImageCatalog,
  loadMiniGameSubpackage,
  preDownloadMiniGameSubpackage,
  type EndlessRecordV1,
  type MiniGameRuntime,
} from '../platform/wechat';

export type InteractionId =
  | 'home-start'
  | 'home-continue'
  | 'home-new'
  | `home-stage:${BattleStageId}`
  | 'hud-back'
  | 'hud-speed'
  | 'hud-pause'
  | 'hud-mute'
  | 'hud-strategy'
  | 'hud-overdrive'
  | 'hud-shop'
  | 'shop-close'
  | 'shop-confirm'
  | 'strategy-close'
  | `strategy-tower:${TowerId}`
  | 'overlay-resume'
  | 'overlay-exit'
  | 'overlay-revive'
  | 'overlay-retry'
  | 'overlay-next'
  | 'card-reroll'
  | `card:${string}`;

export interface DesignPoint {
  x: number;
  y: number;
}

export interface HomeStageRenderState {
  id: BattleStageId;
  name: string;
  unlocked: boolean;
  completed: boolean;
  resumeTick?: number;
  best?: readonly EndlessRecordRenderState[];
}

export type EndlessRecordRenderState = EndlessRecordV1;

export interface HomeRenderState {
  selectedStageId: BattleStageId;
  stages: HomeStageRenderState[];
  notice?: string;
  error?: string;
}

export interface BattleRenderState {
  snapshot: RenderSnapshotV1;
  hud: HudProjectionV1;
  muted: boolean;
  selectedTowerId: TowerId;
  aimingTowerId?: TowerId;
  aimPoint?: DesignPoint;
  reviveOrdinal?: number;
  victory: boolean;
  towerMetrics?: TowerMetricRenderState[];
  strategyPanelOpen?: boolean;
  selectedShopCardId?: string;
  rerollsRemaining?: number;
  endlessResult?: EndlessRecordRenderState;
  endlessPreviousBest?: EndlessRecordRenderState;
  endlessIsNewBest?: boolean;
  endlessSettlementReason?: EndlessSettlementReason;
  nextStageName?: string;
  error?: string;
}

export interface TowerMetricRenderState {
  towerId: TowerId;
  damageLast1sMilli: number;
  damageLast3sMilli: number;
}

interface InteractionRegion {
  id: InteractionId;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisualEffect {
  x: number;
  y: number;
  startedAt: number;
  duration: number;
  color: string;
  kind: 'ring' | 'burst' | 'revive' | 'sprite' | 'muzzle';
  assetId?: string;
  size?: number;
  rotationU16?: number;
}

interface HitReaction {
  startedAt: number;
  duration: number;
  critical: boolean;
  hitCount: number;
}

interface DeathGhost {
  entity: RenderEntityV1;
  startedAt: number;
  duration: number;
}

interface CameraImpulse {
  startedAt: number;
  duration: number;
  amplitude: number;
  seed: number;
}

interface CombatCallout {
  text: string;
  x: number;
  y: number;
  startedAt: number;
  duration: number;
  color: string;
}

interface EffectiveTowerStatsLike {
  damagePerArrowMilli: number;
  criticalDamagePerArrowMilli: number;
  attackIntervalTicks: number;
  attackRateMilliPerSecond: number;
  rangePx: number;
  arrowCount: number;
  penetrationCount: number;
  penetrationRetentionBp: number;
  critChanceBp: number;
  critDamageBp: number;
}

interface TowerStatsProjectionLike {
  base: EffectiveTowerStatsLike;
  afterLevel: EffectiveTowerStatsLike;
  current: EffectiveTowerStatsLike;
}

interface TowerCardPreviewLike {
  cardId: string;
  before: EffectiveTowerStatsLike;
  after: EffectiveTowerStatsLike;
  capped: boolean;
  warPointCost?: number;
  towerCountBefore?: number;
  towerCountAfter?: number;
}

interface TowerRuntimeProjectionLike {
  towerId: TowerId;
  active?: boolean;
  currentTargetEntityId?: number;
  currentTargetName?: string;
  enemiesInRange: number;
  preferredEnemiesInRange: number;
}

interface EndlessHudProjectionLike {
  phase: 'survival' | 'boss' | 'settled';
  routeId?: string;
  survivalTick: number;
  survivalEndTick: number;
  hardEndTick: number;
  threatTier: number;
  nextThreatTick?: number;
  nextEliteTick?: number;
  bossLayer: number;
  bossHpMilli?: number;
  bossMaxHpMilli?: number;
  bossHpBp?: number;
  bossDamageMilli: number;
}

type HudProjectionWithTowerData = HudProjectionV1 & {
  mode?: 'fixed' | 'endless';
  endless?: EndlessHudProjectionLike;
  towerStats?: TowerStatsProjectionLike;
  offerPreviews?: TowerCardPreviewLike[];
  activeOfferPreviews?: TowerCardPreviewLike[];
  towerRuntime?: TowerRuntimeProjectionLike[];
};

type HitEventWithRenderData = Extract<BattleEvent, { type: 'HIT' }> & {
  towerId?: TowerId;
  penetrationIndex?: number;
  impactX?: number;
  impactY?: number;
};

interface DamageSample {
  happenedAt: number;
  towerId: TowerId;
  damageMilli: number;
}

interface FloatingDamageText {
  entityId: number;
  towerId: TowerId;
  x: number;
  y: number;
  damageMilli: number;
  hitCount: number;
  critical: boolean;
  penetrating: boolean;
  mitigation: HitMitigationV1;
  startedAt: number;
  duration: number;
}

const FLOATING_DAMAGE_LIMIT = 42;
const FLOATING_DAMAGE_MERGE_MS = 85;
const DAMAGE_SAMPLE_WINDOW_MS = 3_100;
const DAMAGE_SAMPLE_LIMIT = 4_096;
const VISUAL_EFFECT_LIMIT = 48;
const HIT_REACTION_LIMIT = 64;
const DEATH_GHOST_LIMIT = 18;
const CAMERA_IMPULSE_LIMIT = 6;
const COMBAT_CALLOUT_LIMIT = 6;
const PROJECTILE_TRAIL_SPRITE_BUDGET = 18;

const MAIN_PACKAGE_ASSET_PATHS: Record<string, string> = {
  STAGE_01_BACKGROUND: 'assets/stage-01/background/STAGE_01_BACKGROUND.jpg',
  MON_SWIFT_EEL: 'assets/stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  MON_TIDE_IMP: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  MON_SHELL_CRAB: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_REEF_GUARD: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_ABYSS_SCALE_GUARD: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_SOLAR_FORMATION_PRIEST: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  MON_PHASE_SHELL_WEAVER: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_ETHEREAL_WALKER: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  TOWER_SOLAR_BASE: 'assets/stage-01/towers/TOWER_SOLAR_BASE_V2.png',
  TOWER_SOLAR_HEAD: 'assets/stage-01/towers/TOWER_SOLAR_HEAD_V2.png',
  TOWER_FROST_BASE: 'assets/stage-01/towers/TOWER_FROST_BASE_V2.png',
  TOWER_FROST_HEAD: 'assets/stage-01/towers/TOWER_FROST_HEAD_V2.png',
  TOWER_STORM_BASE: 'assets/stage-01/towers/TOWER_STORM_BASE_V2.png',
  TOWER_STORM_HEAD: 'assets/stage-01/towers/TOWER_STORM_HEAD_V2.png',
  MOD_DAMAGE: 'assets/stage-01/ui/icons/MOD_DAMAGE.png',
  MOD_FREQUENCY: 'assets/stage-01/ui/icons/MOD_FREQUENCY.png',
  MOD_ARROW_COUNT: 'assets/stage-01/ui/icons/MOD_ARROW_COUNT.png',
  MOD_PENETRATION: 'assets/stage-01/ui/icons/MOD_PENETRATION.png',
  MOD_CRIT_RATE: 'assets/stage-01/ui/icons/MOD_CRIT_RATE.png',
  MOD_CRIT_DAMAGE: 'assets/stage-01/ui/icons/MOD_CRIT_DAMAGE.png',
  VFX_SPAWN_PORTAL: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__SPAWN_PORTAL.png',
  VFX_NORMAL_HIT: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__NORMAL_HIT.png',
  VFX_CRITICAL_HIT: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__CRITICAL_HIT.png',
  VFX_DEATH_DISSOLVE: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__DEATH_DISSOLVE.png',
  VFX_ARMOR_HIT: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__ARMOR_HIT.png',
  VFX_ARROW_TRAIL: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__ARROW_TRAIL.png',
  VFX_MULTISHOT_VOLLEY: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__MULTISHOT_VOLLEY.png',
  VFX_BREACH: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__BREACH.png',
  VFX_DEFEAT: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__DEFEAT.png',
  VFX_LEVEL_UP: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__LEVEL_UP.png',
  VFX_REVIVE: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__REVIVE.png',
  VFX_VICTORY: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__VICTORY.png',
  VFX_REVIVE_PROTECT: 'assets/stage-01/vfx/VFX_STATUS_SET__REVIVE_PROTECT.png',
};

interface StageAssetManifest {
  packageName?: string;
  entries: Record<string, string>;
}

const STAGE_ASSET_MANIFESTS: Record<BattleStageId, StageAssetManifest> = {
  STAGE_01: {
    entries: {
      STAGE_01_BACKGROUND: MAIN_PACKAGE_ASSET_PATHS.STAGE_01_BACKGROUND!,
    },
  },
  STAGE_02: {
    packageName: 'stage-02',
    entries: {
      STAGE_02_BACKGROUND: 'packages/stage-02/assets/stage-02/background/STAGE_02_BACKGROUND.jpg',
    },
  },
  STAGE_03: {
    packageName: 'stage-03',
    entries: {
      STAGE_03_BACKGROUND: 'packages/stage-03/assets/stage-03/background/STAGE_03_BACKGROUND.jpg',
      MON_DRAGON_TORTOISE: 'packages/stage-03/assets/stage-03/enemies/MON_DRAGON_TORTOISE.png',
    },
  },
  STAGE_04: {
    packageName: 'stage-04',
    entries: {
      STAGE_04_BACKGROUND: 'packages/stage-04/assets/stage-04/background/STAGE_04_BACKGROUND.jpg',
      MON_ABYSS_WYRM: 'packages/stage-04/assets/stage-04/enemies/MON_ABYSS_WYRM.png',
    },
  },
  STAGE_05: {
    packageName: 'stage-05',
    entries: {
      STAGE_05_BACKGROUND: 'packages/stage-05/assets/stage-05/background/STAGE_05_BACKGROUND.jpg',
      MON_ECLIPSE_KUN_EMPEROR: 'packages/stage-05/assets/stage-05/enemies/MON_ECLIPSE_KUN_EMPEROR.png',
    },
  },
  STAGE_06: {
    packageName: 'stage-06',
    entries: {
      STAGE_06_BACKGROUND: 'packages/stage-06/assets/stage-06/background/STAGE_06_BACKGROUND.jpg',
      MON_MIRAGE_MOTHER: 'packages/stage-06/assets/stage-06/enemies/MON_MIRAGE_MOTHER.png',
    },
  },
  STAGE_07: {
    packageName: 'stage-07',
    entries: {
      STAGE_07_BACKGROUND: 'packages/stage-07/assets/stage-07/background/STAGE_07_BACKGROUND.jpg',
      MON_DUAL_PHASE_BOOK_MOTH: 'packages/stage-07/assets/stage-07/enemies/MON_DUAL_PHASE_BOOK_MOTH.png',
    },
  },
  STAGE_08: {
    packageName: 'stage-08',
    entries: {
      STAGE_08_BACKGROUND: 'packages/stage-08/assets/stage-08/background/STAGE_08_BACKGROUND.jpg',
      BOSS_ABYSS_DRAGON: 'packages/stage-08/assets/stage-08/enemies/BOSS_ABYSS_DRAGON.png',
    },
  },
};

const QUALITY_COLOR: Record<CardDefinition['quality'], string> = {
  G: '#63d99b',
  B: '#58aef5',
  P: '#b877f2',
};

const QUALITY_NAME: Record<CardDefinition['quality'], string> = {
  G: '灵品',
  B: '玄品',
  P: '仙品',
};

const CARD_SERIF_FONT = '"Songti SC", STSong, "Noto Serif CJK SC", serif';
const CARD_BODY_FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
const CARD_NUMBER_FONT = '"DIN Alternate", "Arial Narrow", Arial, sans-serif';

interface EnemyVisualDescriptor {
  width: number;
  height: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  followsRoute: boolean;
  role: 'normal' | 'fast' | 'armored' | 'boss';
  armorBadge?: boolean;
  displayName?: string;
  auraInner?: string;
  auraOuter?: string;
}

const ENEMY_VISUALS: Record<string, EnemyVisualDescriptor> = {
  MON_TIDE_IMP: {
    width: 138, height: 112, sx: 28, sy: 30, sw: 238, sh: 194, followsRoute: true, role: 'normal',
  },
  MON_SWIFT_EEL: {
    width: 154, height: 112, sx: 20, sy: 28, sw: 280, sh: 200, followsRoute: true, role: 'fast',
  },
  MON_SHELL_CRAB: {
    width: 142, height: 108, sx: 2, sy: 20, sw: 314, sh: 206, followsRoute: false, role: 'armored',
  },
  MON_REEF_GUARD: {
    width: 158, height: 120, sx: 2, sy: 20, sw: 314, sh: 206, followsRoute: false, role: 'armored', armorBadge: true,
  },
  MON_DRAGON_TORTOISE: {
    width: 250,
    height: 200,
    sx: 0,
    sy: 0,
    sw: 600,
    sh: 480,
    followsRoute: false,
    role: 'boss',
    armorBadge: true,
    displayName: '首领 · 玄甲龙鳌',
    auraInner: 'rgba(85, 235, 225, .18)',
    auraOuter: 'rgba(119, 80, 221, .10)',
  },
  MON_ABYSS_SCALE_GUARD: {
    width: 162,
    height: 124,
    sx: 2,
    sy: 20,
    sw: 314,
    sh: 206,
    followsRoute: false,
    role: 'armored',
    armorBadge: true,
  },
  MON_ABYSS_WYRM: {
    width: 268,
    height: 214,
    sx: 0,
    sy: 0,
    sw: 600,
    sh: 480,
    followsRoute: false,
    role: 'boss',
    armorBadge: true,
    displayName: '首领 · 噬潮魔蛟',
    auraInner: 'rgba(255, 112, 82, .22)',
    auraOuter: 'rgba(75, 228, 210, .12)',
  },
  MON_SOLAR_FORMATION_PRIEST: {
    width: 150,
    height: 122,
    sx: 28,
    sy: 30,
    sw: 238,
    sh: 194,
    followsRoute: true,
    role: 'normal',
  },
  MON_ECLIPSE_KUN_EMPEROR: {
    width: 304,
    height: 244,
    sx: 0,
    sy: 0,
    sw: 600,
    sh: 480,
    followsRoute: false,
    role: 'boss',
    armorBadge: true,
    displayName: '首领 · 蚀日鲲皇',
    auraInner: 'rgba(255, 123, 91, .24)',
    auraOuter: 'rgba(247, 211, 116, .12)',
  },
  MON_PHASE_SHELL_WEAVER: {
    width: 164,
    height: 124,
    sx: 2,
    sy: 20,
    sw: 314,
    sh: 206,
    followsRoute: false,
    role: 'armored',
  },
  MON_MIRAGE_MOTHER: {
    width: 310,
    height: 248,
    sx: 0,
    sy: 0,
    sw: 600,
    sh: 480,
    followsRoute: false,
    role: 'boss',
    armorBadge: true,
    displayName: '首领 · 万相蜃母',
    auraInner: 'rgba(239, 76, 185, .24)',
    auraOuter: 'rgba(92, 226, 166, .13)',
  },
  MON_ETHEREAL_WALKER: {
    width: 150,
    height: 120,
    sx: 28,
    sy: 30,
    sw: 238,
    sh: 194,
    followsRoute: true,
    role: 'normal',
  },
  MON_DUAL_PHASE_BOOK_MOTH: {
    width: 292,
    height: 234,
    sx: 0,
    sy: 0,
    sw: 600,
    sh: 480,
    followsRoute: false,
    role: 'boss',
    armorBadge: true,
    displayName: '首领 · 双相天蠹',
    auraInner: 'rgba(194, 63, 48, .24)',
    auraOuter: 'rgba(229, 211, 173, .13)',
  },
  BOSS_ABYSS_DRAGON: {
    width: 320,
    height: 256,
    sx: 0,
    sy: 0,
    sw: 600,
    sh: 480,
    followsRoute: false,
    role: 'boss',
    armorBadge: true,
    displayName: '无尽首领 · 深渊龙王',
    auraInner: 'rgba(105, 83, 230, .28)',
    auraOuter: 'rgba(65, 229, 217, .15)',
  },
};

const HOME_STAGE_META: Record<BattleStageId, {
  eyebrow: string;
  description: string;
  lockedDescription: string;
  lockedStatus: string;
  shortStatus: string;
  startLabel: string;
  hudLabel: string;
}> = {
  STAGE_01: {
    eyebrow: '首关 · 五波试炼',
    description: '敌军触及关印会扣关门耐久，耐久归零即失守；三塔会自动索敌。',
    lockedDescription: '',
    lockedStatus: '',
    shortStatus: '五波试炼',
    startLabel: '迎战潮军  ›',
    hudLabel: '第一关',
  },
  STAGE_02: {
    eyebrow: '次关 · 夜潮来袭',
    description: '礁港敌潮成群涌入；三塔自动分担火力，拖动可调整优先方向。',
    lockedDescription: '击退第一关五波潮军后，东海夜战将自动解锁。',
    lockedStatus: '通关第一关后解锁',
    shortStatus: '密集夜潮',
    startLabel: '进入礁港  ›',
    hudLabel: '第二关',
  },
  STAGE_03: {
    eyebrow: '险关 · 龙鳌压阵',
    description: '疾潮逐波加速，重甲潮将护送玄甲龙鳌压境。',
    lockedDescription: '击退东海礁港五波潮军后，镇海龙门将自动解锁。',
    lockedStatus: '通关第二关后解锁',
    shortStatus: '高压首领',
    startLabel: '镇守龙门  ›',
    hudLabel: '第三关',
  },
  STAGE_04: {
    eyebrow: '险潮 · 归墟反攻',
    description: '残血潮军会突然加速；噬潮魔蛟半血后进入狂潮阶段。',
    lockedDescription: '镇守镇海龙门后，通往归墟潮眼的道路将自动解锁。',
    lockedStatus: '通关第三关后解锁',
    shortStatus: '归墟反攻',
    startLabel: '踏入归墟  ›',
    hudLabel: '第四关',
  },
  STAGE_05: {
    eyebrow: '天劫 · 扶桑蚀日',
    description: '阵师为潮军披上护甲；优先击破阵眼，再围攻蚀日鲲皇。',
    lockedDescription: '平定归墟潮眼后，扶桑天阙将自动解锁。',
    lockedStatus: '通关第四关后解锁',
    shortStatus: '护阵蚀日',
    startLabel: '登临天阙  ›',
    hudLabel: '第五关',
  },
  STAGE_06: {
    eyebrow: '幻章 · 万潮归梦',
    description: '相壳会限制单支箭伤害；以箭数和攻速击碎蜃境，再终结万相蜃母。',
    lockedDescription: '重燃扶桑晨光后，太初蜃庭将显露在无风镜海之上。',
    lockedStatus: '通关第五关后解锁',
    shortStatus: '太初蜃境',
    startLabel: '踏入蜃庭  ›',
    hudLabel: '第六关',
  },
  STAGE_07: {
    eyebrow: '终章 · 虚实失序',
    description: '虚相会大幅削减来箭；抓住实体窗口集火，终结双相天蠹。',
    lockedDescription: '封住太初蜃庭后，无字天书中的山河残卷将显露真形。',
    lockedStatus: '前关通关解锁',
    shortStatus: '虚实终战',
    startLabel: '展开残卷  ›',
    hudLabel: '第七关',
  },
  STAGE_08: {
    eyebrow: '无尽挑战 · 三路由 Seed 确定',
    description: '守至 20:00 迎战深渊龙王，25:00 自动结算。',
    lockedDescription: '终结山河残卷后，无尽潮渊将从三条潮路中择一路开启。',
    lockedStatus: '通关第七关后解锁',
    shortStatus: '三路无尽潮',
    startLabel: '踏入无尽潮渊  ›',
    hudLabel: '无尽挑战',
  },
};

interface BattleStageTheme {
  accent: string;
  secondary: string;
  surface: string;
  glow: string;
  routeFill: string;
  routeCore: string;
  breachLabel: string;
  breachMotif: 'battlement' | 'tide' | 'dragon' | 'abyss' | 'sun' | 'pearl' | 'scroll';
}

const BATTLE_STAGE_THEME: Record<BattleStageId, BattleStageTheme> = {
  STAGE_01: {
    accent: '#e9c46a',
    secondary: '#70d7d1',
    surface: '#17384a',
    glow: 'rgba(112, 215, 209, .27)',
    routeFill: 'rgba(78, 178, 167, .19)',
    routeCore: 'rgba(239, 203, 118, .56)',
    breachLabel: '陈塘关',
    breachMotif: 'battlement',
  },
  STAGE_02: {
    accent: '#62dcd4',
    secondary: '#d9a85d',
    surface: '#102e43',
    glow: 'rgba(98, 220, 212, .27)',
    routeFill: 'rgba(79, 190, 201, .19)',
    routeCore: 'rgba(217, 168, 93, .54)',
    breachLabel: '东海港',
    breachMotif: 'tide',
  },
  STAGE_03: {
    accent: '#b68cf4',
    secondary: '#e0b65a',
    surface: '#22284a',
    glow: 'rgba(182, 140, 244, .27)',
    routeFill: 'rgba(126, 92, 184, .20)',
    routeCore: 'rgba(224, 182, 90, .56)',
    breachLabel: '镇海门',
    breachMotif: 'dragon',
  },
  STAGE_04: {
    accent: '#ff8e72',
    secondary: '#79e4d6',
    surface: '#3b2138',
    glow: 'rgba(255, 103, 91, .28)',
    routeFill: 'rgba(113, 55, 91, .23)',
    routeCore: 'rgba(118, 231, 211, .62)',
    breachLabel: '归墟印',
    breachMotif: 'abyss',
  },
  STAGE_05: {
    accent: '#ff7867',
    secondary: '#f2cf72',
    surface: '#3a292c',
    glow: 'rgba(255, 120, 103, .28)',
    routeFill: 'rgba(204, 78, 70, .20)',
    routeCore: 'rgba(255, 224, 143, .68)',
    breachLabel: '曜海印',
    breachMotif: 'sun',
  },
  STAGE_06: {
    accent: '#ed5fc0',
    secondary: '#71e2b0',
    surface: '#2a2130',
    glow: 'rgba(237, 95, 192, .30)',
    routeFill: 'rgba(71, 196, 144, .20)',
    routeCore: 'rgba(250, 196, 226, .68)',
    breachLabel: '太初印',
    breachMotif: 'pearl',
  },
  STAGE_07: {
    accent: '#d45a49',
    secondary: '#ead8af',
    surface: '#302725',
    glow: 'rgba(212, 90, 73, .28)',
    routeFill: 'rgba(32, 27, 26, .31)',
    routeCore: 'rgba(234, 216, 175, .68)',
    breachLabel: '山河印',
    breachMotif: 'scroll',
  },
  STAGE_08: {
    accent: '#8f7bf2',
    secondary: '#59e2d5',
    surface: '#171a3c',
    glow: 'rgba(113, 93, 240, .34)',
    routeFill: 'rgba(67, 53, 132, .27)',
    routeCore: 'rgba(91, 230, 216, .68)',
    breachLabel: '潮渊印',
    breachMotif: 'abyss',
  },
};

export interface HomeStageCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  hitY: number;
  hitHeight: number;
}

export interface ViewportLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CardOverlayLayout {
  cardWidth: number;
  cardHeight: number;
  cardY: number;
  starts: [number, number, number];
}

export interface CardOverlayTypography {
  eyebrow: number;
  heading: number;
  subtitle: number;
  meta: number;
  title: number;
  label: number;
  value: number;
  masteryValue: number;
  delta: number;
  action: number;
}

export interface CardOverlayContentLayout {
  typography: CardOverlayTypography;
  metaTop: number;
  metaHeight: number;
  metaSideInset: number;
  costPillWidth: number;
  qualityPillWidth: number;
  iconTop: number;
  iconSize: number;
  titleBaseline: number;
  dividerY: number;
  metricTop: number;
  metricHeight: number;
  metricHeaderBaseline: number;
  singleMetricBaseline: number;
  masteryMetricBaselines: readonly [number, number];
  deltaBaseline: number;
  actionTop: number;
  actionHeight: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveCardOverlayContentLayout(scale: number): CardOverlayContentLayout {
  const safeScale = Math.max(.01, scale);
  return {
    typography: {
      eyebrow: clamp(10 / safeScale, 24, 28),
      heading: clamp(15 / safeScale, 42, 48),
      subtitle: clamp(8 / safeScale, 20, 24),
      meta: clamp(8 / safeScale, 18, 22),
      title: clamp(12 / safeScale, 34, 40),
      label: clamp(7 / safeScale, 15, 20),
      value: clamp(10 / safeScale, 28, 34),
      masteryValue: clamp(8 / safeScale, 20, 24),
      delta: clamp(7 / safeScale, 16, 20),
      action: clamp(9 / safeScale, 20, 28),
    },
    metaTop: 18,
    metaHeight: 40,
    metaSideInset: 24,
    costPillWidth: 132,
    qualityPillWidth: 88,
    iconTop: 76,
    iconSize: 94,
    titleBaseline: 222,
    dividerY: 241,
    metricTop: 254,
    metricHeight: 168,
    metricHeaderBaseline: 280,
    singleMetricBaseline: 334,
    masteryMetricBaselines: [318, 356],
    deltaBaseline: 400,
    actionTop: 478,
    actionHeight: 68,
  };
}

export function resolveViewportLayout(width: number, height: number): ViewportLayout {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(safeWidth / DESIGN_WIDTH, safeHeight / DESIGN_HEIGHT);
  const offsetX = (safeWidth - DESIGN_WIDTH * scale) / 2;
  const offsetY = (safeHeight - DESIGN_HEIGHT * scale) / 2;
  const viewportWidth = safeWidth / scale;
  const viewportHeight = safeHeight / scale;
  const left = -offsetX / scale;
  const top = -offsetY / scale;
  return {
    scale,
    offsetX,
    offsetY,
    left,
    top,
    right: left + viewportWidth,
    bottom: top + viewportHeight,
    width: viewportWidth,
    height: viewportHeight,
  };
}

export function resolveCardOverlayLayout(viewport: ViewportLayout): CardOverlayLayout {
  const extraWidth = Math.max(0, viewport.width - DESIGN_WIDTH);
  const cardWidth = Math.min(500, 420 + extraWidth / 6);
  const gap = Math.min(120, 100 + extraWidth / 24);
  const totalWidth = cardWidth * 3 + gap * 2;
  const firstX = viewport.left + (viewport.width - totalWidth) / 2;
  return {
    cardWidth,
    cardHeight: 570,
    cardY: 252,
    starts: [firstX, firstX + cardWidth + gap, firstX + (cardWidth + gap) * 2],
  };
}

export function resolveCanvasFontWeight(weight: number): 'normal' | 'bold' {
  return weight >= 600 ? 'bold' : 'normal';
}

export function resolveHomeStageCardLayout(stageCount: number, index: number): HomeStageCardLayout {
  if (stageCount >= 8) {
    return {
      x: 446 + index * 172,
      y: 636,
      width: 160,
      height: 100,
      hitY: 622,
      hitHeight: 128,
    };
  }
  if (stageCount >= 7) {
    return {
      x: 618 + index * 172,
      y: 636,
      width: 160,
      height: 100,
      hitY: 622,
      hitHeight: 128,
    };
  }

  const usesSixCardRail = stageCount >= 6;
  return {
    x: (usesSixCardRail ? 690 : 800) + index * (usesSixCardRail ? 189 : 205),
    y: usesSixCardRail ? 636 : 644,
    width: usesSixCardRail ? 175 : 190,
    height: usesSixCardRail ? 100 : 92,
    hitY: usesSixCardRail ? 622 : 644,
    hitHeight: usesSixCardRail ? 128 : 92,
  };
}

export interface BreachSealPlacement extends DesignPoint {
  tangentRadians: number;
}

export const BATTLE_WORLD_SCALE = .75;
export const BATTLE_WORLD_PIVOT: Readonly<DesignPoint> = { x: 960, y: 180 };
export const BATTLE_BOTTOM_HUD_TOP = 918;
export const BATTLE_BOTTOM_HUD_LEFT_RIGHT = 600;
export const BATTLE_BOTTOM_HUD_RIGHT_LEFT = 1_510;
export const BREACH_SEAL_VISUAL_RADIUS = 126;

export function projectBattleWorldPoint(point: DesignPoint): DesignPoint {
  return {
    x: BATTLE_WORLD_PIVOT.x + (point.x - BATTLE_WORLD_PIVOT.x) * BATTLE_WORLD_SCALE,
    y: BATTLE_WORLD_PIVOT.y + (point.y - BATTLE_WORLD_PIVOT.y) * BATTLE_WORLD_SCALE,
  };
}

export function unprojectBattleWorldPoint(point: DesignPoint): DesignPoint {
  return {
    x: BATTLE_WORLD_PIVOT.x + (point.x - BATTLE_WORLD_PIVOT.x) / BATTLE_WORLD_SCALE,
    y: BATTLE_WORLD_PIVOT.y + (point.y - BATTLE_WORLD_PIVOT.y) / BATTLE_WORLD_SCALE,
  };
}

export function resolveBreachSealPlacement(
  route: BattleBundleV1['route'],
): BreachSealPlacement {
  const points = route.points;
  const breachIndex = points.findIndex(
    (point) => point.x === route.breachPoint.x && point.y === route.breachPoint.y,
  );
  const resolvedIndex = breachIndex >= 0 ? breachIndex : points.length - 1;
  const fallbackStart = points[Math.max(0, resolvedIndex - 1)] ?? route.breachPoint;
  return {
    x: route.breachPoint.x,
    y: route.breachPoint.y,
    tangentRadians: Math.atan2(
      route.breachPoint.y - fallbackStart.y,
      route.breachPoint.x - fallbackStart.x,
    ),
  };
}

const PROJECTILE_PALETTES = [
  { feather: '#f0b95a', trail: 'rgba(240,185,90,.30)' },
  { feather: '#53ddd7', trail: 'rgba(83,221,215,.30)' },
  { feather: '#a77aef', trail: 'rgba(167,122,239,.30)' },
] as const;

const TOWER_VISUALS = [
  {
    baseAssetId: 'TOWER_SOLAR_BASE',
    headAssetId: 'TOWER_SOLAR_HEAD',
    baseSize: 224,
    headSize: 178,
    headPivotX: 146,
    headPivotY: 192,
    mountY: -32,
    arrowLength: 96,
    accent: '#f0b95a',
    aura: 'rgba(240,185,90,.18)',
  },
  {
    baseAssetId: 'TOWER_FROST_BASE',
    headAssetId: 'TOWER_FROST_HEAD',
    baseSize: 202,
    headSize: 184,
    headPivotX: 106,
    headPivotY: 192,
    mountY: -32,
    arrowLength: 112,
    accent: '#53ddd7',
    aura: 'rgba(83,221,215,.18)',
  },
  {
    baseAssetId: 'TOWER_STORM_BASE',
    headAssetId: 'TOWER_STORM_HEAD',
    baseSize: 204,
    headSize: 180,
    headPivotX: 114,
    headPivotY: 192,
    mountY: -32,
    arrowLength: 108,
    accent: '#a77aef',
    aura: 'rgba(167,122,239,.18)',
  },
] as const;

function u16ToRadians(angle: number): number {
  return (angle / 65_536) * Math.PI * 2;
}

function compactDamage(valueMilli: number): string {
  const value = valueMilli / 1000;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatTicks(ticks: number): string {
  const totalSeconds = Math.max(0, Math.floor(ticks / TICKS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function endlessRouteCode(routeId: string): string {
  const normalized = routeId.trim().toUpperCase();
  const suffix = normalized.match(/(?:^|[_-])([ABC])$/)?.[1]
    ?? (normalized.length === 1 && /[ABC]/.test(normalized) ? normalized : undefined);
  if (suffix) return suffix;
  if (normalized.includes('RIFT')) return 'A';
  if (normalized.includes('ECLIPSE')) return 'B';
  if (normalized.includes('MAELSTROM')) return 'C';
  return routeId;
}

function formatEndlessRoute(routeId: string): string {
  const code = endlessRouteCode(routeId);
  return code.length === 1 ? `路线 ${code}` : code;
}

function endlessRouteSummary(records?: readonly EndlessRecordRenderState[]): string {
  return (['A', 'B', 'C'] as const).map((route) => {
    const record = records?.find((candidate) => endlessRouteCode(candidate.routeId) === route);
    if (!record) return `${route} --`;
    return record.reachedBoss
      ? `${route} 龙伤${compactDamage(record.bossDamageMilli)}`
      : `${route} ${formatTicks(record.survivalTick)}`;
  }).join(' · ');
}

function endlessRecordScore(record: EndlessRecordRenderState): string {
  return record.reachedBoss
    ? `龙伤 ${compactDamage(record.bossDamageMilli)} · 第 ${Math.max(1, record.bossLayer)} 层`
    : `守卫 ${formatTicks(record.survivalTick)}`;
}

function resolveEndlessHud(hud: HudProjectionV1): EndlessHudProjectionLike | undefined {
  const projected = hud as HudProjectionWithTowerData;
  if (projected.mode !== 'endless') return undefined;
  const detail = projected.endless ?? (projected as unknown as Partial<EndlessHudProjectionLike>);
  const survivalEndTick = detail.survivalEndTick ?? 20 * 60 * TICKS_PER_SECOND;
  const hardEndTick = detail.hardEndTick ?? 25 * 60 * TICKS_PER_SECOND;
  const survivalTick = detail.survivalTick ?? hud.tick;
  return {
    phase: detail.phase ?? (survivalTick >= survivalEndTick ? 'boss' : 'survival'),
    routeId: detail.routeId,
    survivalTick,
    survivalEndTick,
    hardEndTick,
    threatTier: detail.threatTier ?? 1,
    nextThreatTick: detail.nextThreatTick,
    nextEliteTick: detail.nextEliteTick,
    bossLayer: detail.bossLayer ?? 0,
    bossHpMilli: detail.bossHpMilli,
    bossMaxHpMilli: detail.bossMaxHpMilli,
    bossHpBp: detail.bossHpBp,
    bossDamageMilli: detail.bossDamageMilli ?? 0,
  };
}

function preciseDamage(valueMilli: number): string {
  const value = valueMilli / 1_000;
  if (Math.abs(value) >= 1_000) return compactDamage(valueMilli);
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 100) return value.toFixed(1).replace(/\.0$/, '');
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatRate(valueMilliPerSecond: number): string {
  return (valueMilliPerSecond / 1_000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatBp(valueBp: number): string {
  return `${(valueBp / 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function signed(value: number, formatter: (candidate: number) => string): string {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : '-'}${formatter(Math.abs(value))}`;
}

function cloneEffectiveStats(stats: EffectiveTowerStatsLike): EffectiveTowerStatsLike {
  return { ...stats };
}

function fallbackEffectiveStats(bundle: BattleBundleV1): EffectiveTowerStatsLike {
  const damagePerArrowMilli = bundle.tower.baseDamageMilli;
  return {
    damagePerArrowMilli,
    criticalDamagePerArrowMilli: Math.round(
      (damagePerArrowMilli * bundle.tower.critDamageBp) / 10_000,
    ),
    attackIntervalTicks: bundle.tower.attackIntervalTicks,
    attackRateMilliPerSecond: Math.round(
      (TICKS_PER_SECOND * 1_000) / bundle.tower.attackIntervalTicks,
    ),
    rangePx: bundle.tower.rangePx,
    arrowCount: bundle.tower.baseArrowCount,
    penetrationCount: bundle.tower.basePenetration,
    penetrationRetentionBp: bundle.tower.penetrationRetentionBp,
    critChanceBp: bundle.tower.critChanceBp,
    critDamageBp: bundle.tower.critDamageBp,
  };
}

function fallbackCardPreview(
  card: CardDefinition,
  current: EffectiveTowerStatsLike,
): TowerCardPreviewLike {
  const before = cloneEffectiveStats(current);
  const after = cloneEffectiveStats(current);
  switch (card.effectId) {
    case 'tower-damage': {
      const multiplierBp = 10_000 + (card.valueBp ?? 0);
      after.damagePerArrowMilli = Math.round((before.damagePerArrowMilli * multiplierBp) / 10_000);
      after.criticalDamagePerArrowMilli = Math.round(
        (after.damagePerArrowMilli * after.critDamageBp) / 10_000,
      );
      break;
    }
    case 'tower-frequency': {
      const multiplierBp = 10_000 + (card.valueBp ?? 0);
      after.attackIntervalTicks = Math.max(
        6,
        Math.ceil((before.attackIntervalTicks * 10_000) / multiplierBp),
      );
      after.attackRateMilliPerSecond = Math.round(
        (TICKS_PER_SECOND * 1_000) / after.attackIntervalTicks,
      );
      break;
    }
    case 'arrow-count':
      after.arrowCount = Math.min(9, before.arrowCount + (card.valueInt ?? 0));
      break;
    case 'penetration':
      after.penetrationCount = Math.min(6, before.penetrationCount + (card.valueInt ?? 0));
      break;
    case 'crit-rate':
      after.critChanceBp = Math.min(8_000, before.critChanceBp + (card.valueBp ?? 0));
      break;
    case 'crit-damage':
      after.critDamageBp = Math.min(35_000, before.critDamageBp + (card.valueBp ?? 0));
      after.criticalDamagePerArrowMilli = Math.round(
        (after.damagePerArrowMilli * after.critDamageBp) / 10_000,
      );
      break;
    case 'critical-mastery':
      after.critChanceBp = Math.min(8_000, before.critChanceBp + (card.valueBp ?? 0));
      after.critDamageBp = Math.min(
        35_000,
        before.critDamageBp + (card.secondaryValueBp ?? 0),
      );
      after.criticalDamagePerArrowMilli = Math.round(
        (after.damagePerArrowMilli * after.critDamageBp) / 10_000,
      );
      break;
    case 'tower-count':
      break;
  }
  const capped = card.effectId === 'arrow-count'
    ? after.arrowCount - before.arrowCount < (card.valueInt ?? 0)
    : card.effectId === 'penetration'
      ? after.penetrationCount - before.penetrationCount < (card.valueInt ?? 0)
      : card.effectId === 'crit-rate'
        ? after.critChanceBp - before.critChanceBp < (card.valueBp ?? 0)
        : card.effectId === 'crit-damage'
          ? after.critDamageBp - before.critDamageBp < (card.valueBp ?? 0)
          : false;
  return {
    cardId: card.id,
    before,
    after,
    capped,
    warPointCost: card.warPointCost ?? 0,
  };
}

interface CardMetricRow {
  label: string;
  before: string;
  after: string;
}

interface CardMetricPresentation {
  rows: readonly CardMetricRow[];
  delta: string;
}

function cardPreviewIsUnchanged(card: CardDefinition, preview: TowerCardPreviewLike): boolean {
  const { before, after } = preview;
  switch (card.effectId) {
    case 'tower-damage': return after.damagePerArrowMilli === before.damagePerArrowMilli;
    case 'tower-frequency': return after.attackRateMilliPerSecond === before.attackRateMilliPerSecond;
    case 'arrow-count': return after.arrowCount === before.arrowCount;
    case 'penetration': return after.penetrationCount === before.penetrationCount;
    case 'crit-rate': return after.critChanceBp === before.critChanceBp;
    case 'crit-damage': return after.critDamageBp === before.critDamageBp;
    case 'critical-mastery': return after.critChanceBp === before.critChanceBp &&
      after.critDamageBp === before.critDamageBp;
    case 'tower-count': {
      const beforeCount = preview.towerCountBefore ?? 2;
      const afterCount = preview.towerCountAfter ?? Math.min(3, beforeCount + 1);
      return afterCount === beforeCount;
    }
  }
}

function cardMetricPresentation(
  card: CardDefinition,
  preview: TowerCardPreviewLike,
): CardMetricPresentation {
  const { before, after } = preview;
  const capPrefix = preview.capped ? '部分生效 · ' : '';
  const unchangedDelta = preview.capped ? '已达上限' : '本次强化后面板暂不变';
  switch (card.effectId) {
    case 'tower-damage': {
      const delta = after.damagePerArrowMilli - before.damagePerArrowMilli;
      return {
        rows: [{
          label: '单箭伤害',
          before: preciseDamage(before.damagePerArrowMilli),
          after: preciseDamage(after.damagePerArrowMilli),
        }],
        delta: delta === 0 ? unchangedDelta : `${capPrefix}实增 ${signed(delta, preciseDamage)} 单箭`,
      };
    }
    case 'tower-frequency': {
      const delta = after.attackRateMilliPerSecond - before.attackRateMilliPerSecond;
      return {
        rows: [{
          label: '每秒攻击',
          before: formatRate(before.attackRateMilliPerSecond),
          after: formatRate(after.attackRateMilliPerSecond),
        }],
        delta: delta === 0
          ? preview.capped
            ? '已达上限'
            : '攻速按帧取整 · 面板暂不变'
          : `${capPrefix}实增 ${signed(delta, formatRate)} 次/秒`,
      };
    }
    case 'arrow-count': {
      const delta = after.arrowCount - before.arrowCount;
      return {
        rows: [{ label: '每轮箭矢', before: `${before.arrowCount} 支`, after: `${after.arrowCount} 支` }],
        delta: delta === 0 ? unchangedDelta : `${capPrefix}实增 ${signed(delta, String)} 支/轮`,
      };
    }
    case 'penetration': {
      const delta = after.penetrationCount - before.penetrationCount;
      return {
        rows: [{
          label: '额外穿透',
          before: `${before.penetrationCount} 次`,
          after: `${after.penetrationCount} 次`,
        }],
        delta: delta === 0 ? unchangedDelta : `${capPrefix}实增 ${signed(delta, String)} 次穿透`,
      };
    }
    case 'crit-rate': {
      const delta = after.critChanceBp - before.critChanceBp;
      return {
        rows: [{ label: '暴击率', before: formatBp(before.critChanceBp), after: formatBp(after.critChanceBp) }],
        delta: delta === 0 ? unchangedDelta : `${capPrefix}实增 ${signed(delta, (value) => `${value / 100}pp`)}`,
      };
    }
    case 'crit-damage': {
      const delta = after.critDamageBp - before.critDamageBp;
      return {
        rows: [{
          label: '暴击伤害',
          before: formatBp(before.critDamageBp),
          after: formatBp(after.critDamageBp),
        }],
        delta: delta === 0 ? unchangedDelta : `${capPrefix}实增 ${signed(delta, (value) => `${value / 100}pp`)}`,
      };
    }
    case 'critical-mastery': {
      const critRateDelta = after.critChanceBp - before.critChanceBp;
      const critDamageDelta = after.critDamageBp - before.critDamageBp;
      const formatPointDelta = (value: number): string => value === 0
        ? '0pp'
        : signed(value, (candidate) => `${candidate / 100}pp`);
      return {
        rows: [
          { label: '暴击率', before: formatBp(before.critChanceBp), after: formatBp(after.critChanceBp) },
          { label: '暴击伤害', before: formatBp(before.critDamageBp), after: formatBp(after.critDamageBp) },
        ],
        delta: critRateDelta === 0 && critDamageDelta === 0
          ? unchangedDelta
          : `${capPrefix}实增 暴击 ${formatPointDelta(critRateDelta)} · 暴伤 ${formatPointDelta(critDamageDelta)}`,
      };
    }
    case 'tower-count': {
      const beforeCount = preview.towerCountBefore ?? 2;
      const afterCount = preview.towerCountAfter ?? Math.min(3, beforeCount + 1);
      const delta = afterCount - beforeCount;
      return {
        rows: [{ label: '已部署塔', before: `${beforeCount} 座`, after: `${afterCount} 座` }],
        delta: delta === 0 ? '塔位已全部部署' : `增援 ${signed(delta, String)} 座 · 继承全部法门`,
      };
    }
  }
}

export class CanvasRenderer {
  private readonly runtime: MiniGameRuntime;
  private readonly context: any;
  private bundle: BattleBundleV1;
  private readonly images: ImageCatalog;
  private mainAssetsLoad?: Promise<void>;
  private readonly stageAssetLoads = new Map<BattleStageId, Promise<void>>();
  private cardsById: Map<string, CardDefinition>;
  private interactions: InteractionRegion[] = [];
  private effects: VisualEffect[] = [];
  private floatingDamageTexts: FloatingDamageText[] = [];
  private damageSamples: DamageSample[] = [];
  private entityPositions = new Map<number, DesignPoint>();
  private entityRenderCache = new Map<number, RenderEntityV1>();
  private hitReactions = new Map<number, HitReaction>();
  private deathGhosts: DeathGhost[] = [];
  private cameraImpulses: CameraImpulse[] = [];
  private combatCallouts: CombatCallout[] = [];
  private gateDamageFlashStartedAt = 0;
  private warPointsFlashStartedAt = 0;
  private warPointsFlashAmount = 0;
  private activeTowerIds = new Set<TowerId>([0, 1, 2]);
  private displayedTowerFacingsU16: TowerAimAnglesU16 = [0, 0, 0];
  private towerFacingsInitialized = false;
  private lastTowerFacingAt = Date.now();
  private lastSnapshotTick = -1;
  private lastMetricsSnapshotTick = -1;
  private currentArrowCount = 1;
  private currentBattleSpeed: 1 | 2 = 1;
  private projectileTrailSpritesRemaining = PROJECTILE_TRAIL_SPRITE_BUDGET;
  private armoredRenderAssets = new Set<string>();
  private readonly towerRecoilStartedAt = [0, 0, 0];
  private readonly towerReleaseFacingsU16: Array<number | undefined> = [undefined, undefined, undefined];
  private viewport = resolveViewportLayout(DESIGN_WIDTH, DESIGN_HEIGHT);
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  constructor(runtime: MiniGameRuntime, bundle: BattleBundleV1) {
    this.runtime = runtime;
    this.context = runtime.context;
    this.bundle = bundle;
    this.images = new ImageCatalog(runtime.canvas);
    this.cardsById = new Map(bundle.cards.map((card) => [card.id, card]));
    this.refreshEnemyPresentationCaches();
    this.updateViewport();
  }

  async loadAssets(): Promise<void> {
    if (this.images.hasAll(Object.keys(MAIN_PACKAGE_ASSET_PATHS))) return;
    if (this.mainAssetsLoad) return this.mainAssetsLoad;

    const pending = this.images.load(MAIN_PACKAGE_ASSET_PATHS).then(() => {
      if (!this.images.hasAll(Object.keys(MAIN_PACKAGE_ASSET_PATHS))) {
        throw new Error('主包必需图片未完整加载');
      }
    });
    this.mainAssetsLoad = pending;
    try {
      await pending;
    } finally {
      if (this.mainAssetsLoad === pending) this.mainAssetsLoad = undefined;
    }
  }

  async loadStageAssets(
    stageId: BattleStageId,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    if (this.isStageAssetsLoaded(stageId)) {
      onProgress?.(1);
      return;
    }
    const existing = this.stageAssetLoads.get(stageId);
    if (existing) return existing;

    const manifest = STAGE_ASSET_MANIFESTS[stageId];
    const pending = (async () => {
      onProgress?.(0);
      await this.loadAssets();
      if (stageId === 'STAGE_01') {
        if (!this.isStageAssetsLoaded(stageId)) throw new Error('第一关必需图片未完整加载');
        onProgress?.(1);
        return;
      }
      if (!manifest.packageName) throw new Error(`关卡 ${stageId} 缺少分包配置`);
      await loadMiniGameSubpackage(
        manifest.packageName,
        (progress) => onProgress?.(progress * 0.9),
      );
      await this.images.load(manifest.entries);
      if (!this.isStageAssetsLoaded(stageId)) {
        throw new Error(`关卡 ${stageId} 的必需图片未完整加载`);
      }
      onProgress?.(1);
    })();
    this.stageAssetLoads.set(stageId, pending);
    try {
      await pending;
    } finally {
      if (this.stageAssetLoads.get(stageId) === pending) this.stageAssetLoads.delete(stageId);
    }
  }

  isStageAssetsLoaded(stageId: BattleStageId): boolean {
    return (
      this.images.hasAll(Object.keys(MAIN_PACKAGE_ASSET_PATHS)) &&
      this.images.hasAll(Object.keys(STAGE_ASSET_MANIFESTS[stageId].entries))
    );
  }

  releaseStageAssets(stageId: BattleStageId): void {
    if (stageId === 'STAGE_01') return;
    this.images.unload(Object.keys(STAGE_ASSET_MANIFESTS[stageId].entries));
  }

  preloadStageAssets(stageId: BattleStageId): Promise<void> {
    if (stageId === 'STAGE_01' || this.isStageAssetsLoaded(stageId)) return Promise.resolve();
    const packageName = STAGE_ASSET_MANIFESTS[stageId].packageName;
    return packageName ? preDownloadMiniGameSubpackage(packageName) : Promise.resolve();
  }

  setBundle(bundle: BattleBundleV1): void {
    if (this.bundle === bundle) return;
    this.bundle = bundle;
    this.cardsById = new Map(bundle.cards.map((card) => [card.id, card]));
    this.refreshEnemyPresentationCaches();
    this.effects = [];
    this.floatingDamageTexts = [];
    this.damageSamples = [];
    this.entityPositions.clear();
    this.entityRenderCache.clear();
    this.hitReactions.clear();
    this.deathGhosts = [];
    this.cameraImpulses = [];
    this.combatCallouts = [];
    this.gateDamageFlashStartedAt = 0;
    this.warPointsFlashStartedAt = 0;
    this.warPointsFlashAmount = 0;
    this.activeTowerIds = new Set<TowerId>([0, 1, 2]);
    this.displayedTowerFacingsU16 = [0, 0, 0];
    this.towerFacingsInitialized = false;
    this.lastTowerFacingAt = Date.now();
    this.lastSnapshotTick = -1;
    this.lastMetricsSnapshotTick = -1;
    this.currentArrowCount = bundle.tower.baseArrowCount;
    this.currentBattleSpeed = 1;
    this.projectileTrailSpritesRemaining = PROJECTILE_TRAIL_SPRITE_BUDGET;
    this.towerRecoilStartedAt.fill(0);
    this.towerReleaseFacingsU16.fill(undefined);
  }

  resize(): void {
    this.runtime.resize();
    this.updateViewport();
  }

  toDesignPoint(clientX: number, clientY: number): DesignPoint {
    return {
      x: (clientX - this.offsetX) / this.scale,
      y: (clientY - this.offsetY) / this.scale,
    };
  }

  toBattleWorldPoint(point: DesignPoint): DesignPoint {
    return unprojectBattleWorldPoint(point);
  }

  hitTest(point: DesignPoint): InteractionId | undefined {
    for (let index = this.interactions.length - 1; index >= 0; index -= 1) {
      const region = this.interactions[index];
      if (
        region &&
        point.x >= region.x &&
        point.x <= region.x + region.width &&
        point.y >= region.y &&
        point.y <= region.y + region.height
      ) {
        return region.id;
      }
    }
    return undefined;
  }

  containsDesignPoint(point: DesignPoint): boolean {
    return point.x >= 0 && point.x <= DESIGN_WIDTH && point.y >= 0 && point.y <= DESIGN_HEIGHT;
  }

  isBattleHudPoint(point: DesignPoint): boolean {
    return point.y <= 122 || (
      point.y >= BATTLE_BOTTOM_HUD_TOP &&
      (point.x <= BATTLE_BOTTOM_HUD_LEFT_RIGHT || point.x >= BATTLE_BOTTOM_HUD_RIGHT_LEFT)
    );
  }

  hitTestTower(point: DesignPoint): TowerId | undefined {
    const worldPoint = unprojectBattleWorldPoint(point);
    const radius = Math.max(108, Math.min(132, 40 / Math.max(this.scale, 0.01))) /
      BATTLE_WORLD_SCALE;
    let closest: { towerId: TowerId; distanceSquared: number } | undefined;
    this.bundle.route.towerAnchors.forEach((anchor, index) => {
      const towerId = index as TowerId;
      if (!this.activeTowerIds.has(towerId)) return;
      const deltaX = worldPoint.x - anchor.x;
      const deltaY = worldPoint.y - anchor.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared > radius * radius) return;
      if (!closest || distanceSquared < closest.distanceSquared) {
        closest = { towerId, distanceSquared };
      }
    });
    return closest?.towerId;
  }

  pushEvents(events: BattleEvent[], snapshot: RenderSnapshotV1): void {
    const currentEntities = new Map(snapshot.entities.map((entity) => [entity.entityId, entity]));
    const current = new Map(snapshot.entities.map((entity) => [entity.entityId, { x: entity.x, y: entity.y }]));
    const dyingEntityIds = new Set<number>();
    const deathClusters = new Map<number, DesignPoint[]>();
    const warPointsByTick = new Map<number, number>();
    const breachSummaries = new Map<number, {
      initialIntegrity: number;
      remainingIntegrity: number;
      maximumIntegrity: number;
    }>();
    for (const event of events) {
      if (event.type === 'DEATH') dyingEntityIds.add(event.entityId);
      if (event.type === 'WAR_POINTS_GAINED') {
        warPointsByTick.set(event.tick, (warPointsByTick.get(event.tick) ?? 0) + event.amount);
      }
      if (event.type === 'BREACH') {
        const existing = breachSummaries.get(event.tick);
        const initialIntegrity = existing?.initialIntegrity ?? Math.min(
          event.gateIntegrityMax,
          event.gateIntegrityRemaining + event.damage,
        );
        breachSummaries.set(event.tick, {
          initialIntegrity,
          remainingIntegrity: event.gateIntegrityRemaining,
          maximumIntegrity: event.gateIntegrityMax,
        });
      }
    }
    const now = Date.now();
    const warPointsGained = events.reduce(
      (sum, event) => sum + (event.type === 'WAR_POINTS_GAINED' ? event.amount : 0),
      0,
    );
    if (warPointsGained > 0) {
      const age = now - this.warPointsFlashStartedAt;
      this.warPointsFlashAmount = age >= 0 && age < 260
        ? this.warPointsFlashAmount + warPointsGained
        : warPointsGained;
      this.warPointsFlashStartedAt = now;
    }
    const latestTick = events.reduce((maximum, event) => Math.max(maximum, event.tick), 0);
    for (const event of events) {
      const eventAgeMs = Math.min(
        120,
        Math.max(0, latestTick - event.tick) * (1_000 / TICKS_PER_SECOND) / this.currentBattleSpeed,
      );
      const startedAt = now - eventAgeMs;
      if (event.type === 'ATTACK_RELEASE') {
        if (event.towerId >= 0 && event.towerId < this.towerRecoilStartedAt.length) {
          this.towerRecoilStartedAt[event.towerId] = startedAt;
          this.towerReleaseFacingsU16[event.towerId] = event.releaseRotationU16;
          const towerId = event.towerId as TowerId;
          const releaseArrowCount = Number.isSafeInteger(event.arrowCount)
            ? Math.max(1, event.arrowCount)
            : this.currentArrowCount;
          const muzzle = this.towerMuzzlePoint(towerId, event.releaseRotationU16);
          this.effects.push({
            ...muzzle,
            startedAt,
            duration: 145,
            color: event.focused ? '#fff0a8' : PROJECTILE_PALETTES[towerId]?.feather ?? '#72ead5',
            kind: 'muzzle',
            rotationU16: event.releaseRotationU16,
            size: releaseArrowCount > 1 ? 62 : event.focused ? 56 : 48,
          });
          if (releaseArrowCount > 1) {
            this.effects.push({
              ...muzzle,
              startedAt,
              duration: 220,
              color: PROJECTILE_PALETTES[towerId]?.feather ?? '#72ead5',
              kind: 'sprite',
              assetId: 'VFX_MULTISHOT_VOLLEY',
              size: Math.min(142, 92 + releaseArrowCount * 6),
              rotationU16: event.releaseRotationU16,
            });
          }
        }
        continue;
      }
      const eventEntityId = 'entityId' in event && typeof event.entityId === 'number'
        ? event.entityId
        : undefined;
      const position = eventEntityId !== undefined
        ? current.get(eventEntityId) ?? this.entityPositions.get(eventEntityId)
        : undefined;
      const fallback = event.type === 'LEVEL_UP'
        ? this.towerCenter()
        : resolveBreachSealPlacement(this.bundle.route);
      const point = event.type === 'BREACH' ? fallback : position ?? fallback;
      const visualPoint = event.type === 'SPAWN'
        ? { x: point.x, y: Math.max(66, point.y) }
        : point;
      if (event.type === 'HIT') {
        const hit = event as HitEventWithRenderData;
        const hitPoint = {
          x: Number.isFinite(hit.impactX) ? hit.impactX! : visualPoint.x,
          y: Number.isFinite(hit.impactY) ? hit.impactY! : visualPoint.y,
        };
        this.recordDamageHit(hit, hitPoint, startedAt);
        this.recordHitReaction(hit.entityId, hit.critical, startedAt);
        // Keep the actual-damage number for lethal hits, while avoiding a duplicate
        // hit sprite under the death dissolve effect.
        if (dyingEntityIds.has(event.entityId)) continue;
        const mitigated = event.mitigation !== 'none' ||
          this.isArmorLikeHit(event.entityId, currentEntities);
        if (mitigated) {
          this.effects.push({
            ...hitPoint,
            startedAt,
            duration: 230,
            color: '#82e7e3',
            kind: 'sprite',
            assetId: 'VFX_ARMOR_HIT',
            size: hit.critical ? 104 : 88,
          });
        }
        if (hit.critical || !mitigated) {
          this.effects.push({
            ...hitPoint,
            startedAt,
            duration: hit.critical ? 260 : 210,
            color: hit.critical ? '#ffd36d' : '#72ead5',
            kind: 'sprite',
            assetId: hit.critical ? 'VFX_CRITICAL_HIT' : 'VFX_NORMAL_HIT',
            size: hit.critical ? 112 : 84,
          });
        }
        continue;
      }
      if (event.type === 'WAR_POINTS_GAINED') continue;
      if (event.type === 'CARD_PURCHASED') {
        const card = this.cardsById.get(event.cardId);
        if (card?.effectId !== 'tower-count') {
          const center = this.towerCenter();
          this.effects.push({
            ...center,
            startedAt,
            duration: 560,
            color: '#ffd36d',
            kind: 'sprite',
            assetId: 'VFX_LEVEL_UP',
            size: 188,
          });
          this.combatCallouts.push({
            text: `${card?.name ?? '法门'}已兑换 · -${event.cost} 战功`,
            x: center.x,
            y: center.y,
            startedAt,
            duration: 920,
            color: '#ffd36d',
          });
        }
        continue;
      }
      if (event.type === 'TOWER_UNLOCKED') {
        const anchor = this.bundle.route.towerAnchors[event.towerId];
        this.effects.push({
          x: anchor.x,
          y: anchor.y - 26,
          startedAt,
          duration: 760,
          color: PROJECTILE_PALETTES[event.towerId]?.feather ?? '#72ead5',
          kind: 'sprite',
          assetId: 'VFX_REVIVE_PROTECT',
          size: 230,
        });
        this.combatCallouts.push({
          text: `${event.towerId + 1} 号箭塔增援就位`,
          x: anchor.x,
          y: anchor.y - 12,
          startedAt,
          duration: 1_050,
          color: PROJECTILE_PALETTES[event.towerId]?.feather ?? '#72ead5',
        });
        continue;
      }
      if (event.type === 'DEATH') {
        this.hitReactions.delete(event.entityId);
        const cachedEntity = currentEntities.get(event.entityId) ?? this.entityRenderCache.get(event.entityId);
        const deathPoint = Number.isFinite(event.deathX) && Number.isFinite(event.deathY)
          ? { x: event.deathX, y: event.deathY }
          : visualPoint;
        if (cachedEntity) {
          const isBoss = this.isBossRenderAsset(cachedEntity.assetId);
          this.deathGhosts.push({
            entity: {
              ...cachedEntity,
              x: deathPoint.x,
              y: deathPoint.y,
              sortY: deathPoint.y,
            },
            startedAt,
            duration: isBoss ? 520 : 340,
          });
        }
        const cluster = deathClusters.get(event.tick) ?? [];
        cluster.push(deathPoint);
        deathClusters.set(event.tick, cluster);
        this.effects.push({
          ...deathPoint,
          startedAt,
          duration: 340,
          color: '#72ead5',
          kind: 'sprite',
          assetId: 'VFX_DEATH_DISSOLVE',
          size: cachedEntity && this.isBossRenderAsset(cachedEntity.assetId) ? 210 : 126,
        });
        continue;
      }
      if (event.type === 'SPAWN') {
        const definition = this.bundle.enemies[event.enemyId];
        const isBoss = definition ? this.isBossRenderAsset(definition.renderAssetId) : false;
        this.effects.push({
          ...visualPoint,
          startedAt,
          duration: isBoss ? 620 : 360,
          color: isBoss ? '#b79aff' : '#5ce5ed',
          kind: 'sprite',
          assetId: 'VFX_SPAWN_PORTAL',
          size: isBoss ? 260 : 116,
        });
        continue;
      }
      if (event.type === 'LEVEL_UP') {
        this.effects.push({
          ...this.towerCenter(),
          startedAt,
          duration: 620,
          color: '#ffd36d',
          kind: 'sprite',
          assetId: 'VFX_LEVEL_UP',
          size: 210,
        });
        continue;
      }
      if (event.type === 'BREACH') {
        this.gateDamageFlashStartedAt = Math.max(this.gateDamageFlashStartedAt, startedAt);
        this.effects.push({
          ...visualPoint,
          startedAt,
          duration: 520,
          color: '#ff766d',
          kind: 'sprite',
          assetId: 'VFX_BREACH',
          size: 220,
        });
        continue;
      }
      if (event.type === 'DEFEAT') {
        this.effects.push({
          ...this.towerCenter(),
          startedAt,
          duration: 620,
          color: '#ff766d',
          kind: 'sprite',
          assetId: 'VFX_DEFEAT',
          size: 250,
        });
        continue;
      }
      if (event.type === 'REVIVED') {
        const center = this.towerCenter();
        this.effects.push({
          ...center,
          startedAt,
          duration: 680,
          color: '#ffd36d',
          kind: 'sprite',
          assetId: 'VFX_REVIVE',
          size: 230,
        });
        this.effects.push({
          ...resolveBreachSealPlacement(this.bundle.route),
          startedAt: startedAt + 80,
          duration: 860,
          color: '#72ead5',
          kind: 'sprite',
          assetId: 'VFX_REVIVE_PROTECT',
          size: 190,
        });
        continue;
      }
      if (event.type === 'VICTORY') {
        this.effects.push({
          ...this.towerCenter(),
          startedAt,
          duration: 820,
          color: '#ffd36d',
          kind: 'sprite',
          assetId: 'VFX_VICTORY',
          size: 280,
        });
        continue;
      }
      if (event.type === 'OVERDRIVE_READY') {
        const center = this.towerCenter();
        this.effects.push({
          ...center,
          startedAt,
          duration: 560,
          color: '#ffd36d',
          kind: 'sprite',
          assetId: 'VFX_REVIVE_PROTECT',
          size: 190,
        });
        this.combatCallouts.push({
          text: '镇海战意已满',
          x: center.x,
          y: center.y,
          startedAt,
          duration: 920,
          color: '#ffd36d',
        });
        continue;
      }
      if (event.type === 'OVERDRIVE_ACTIVATED') {
        const anchor = this.bundle.route.towerAnchors[event.towerId];
        this.effects.push({
          x: anchor.x,
          y: anchor.y - 34,
          startedAt,
          duration: 680,
          color: PROJECTILE_PALETTES[event.towerId]?.feather ?? '#ffd36d',
          kind: 'sprite',
          assetId: 'VFX_LEVEL_UP',
          size: 230,
        });
        this.effects.push({
          x: anchor.x,
          y: anchor.y - 34,
          startedAt: startedAt + 70,
          duration: 760,
          color: '#ffd36d',
          kind: 'revive',
        });
        this.combatCallouts.push({
          text: `${event.towerId + 1} 号塔 · 镇海爆发`,
          x: anchor.x,
          y: anchor.y - 10,
          startedAt,
          duration: 900,
          color: PROJECTILE_PALETTES[event.towerId]?.feather ?? '#ffd36d',
        });
        continue;
      }
      if (event.type === 'OVERDRIVE_ENDED') continue;
      if (event.type === 'BOSS_LAYER_ADVANCED') {
        this.effects.push({
          ...this.findBossPoint(snapshot.entities),
          startedAt,
          duration: 520,
          color: '#b79aff',
          kind: 'burst',
        });
        continue;
      }
      if (event.type === 'ENDLESS_PHASE_CHANGED' && event.phase === 'boss') {
        this.effects.push({
          ...this.towerCenter(),
          startedAt,
          duration: 620,
          color: '#b79aff',
          kind: 'revive',
        });
        continue;
      }
      this.effects.push({
        ...visualPoint,
        startedAt,
        duration: 360,
        color: '#72ead5',
        kind: 'burst',
      });
    }
    const breachPoint = resolveBreachSealPlacement(this.bundle.route);
    for (const [tick, summary] of breachSummaries) {
      const damage = Math.max(0, summary.initialIntegrity - summary.remainingIntegrity);
      this.combatCallouts.push({
        text: this.bundle.mode === 'endless'
          ? '潮渊印失守'
          : `关门受损 -${damage} · ${summary.remainingIntegrity}/${summary.maximumIntegrity}`,
        x: breachPoint.x,
        y: breachPoint.y - 8,
        startedAt: now - Math.min(
          120,
          Math.max(0, latestTick - tick) * (1_000 / TICKS_PER_SECOND) / this.currentBattleSpeed,
        ),
        duration: 1_050,
        color: '#ff8a72',
      });
    }
    this.enqueueDeathCallouts(deathClusters, warPointsByTick, now);
    this.enqueueCameraFeedback(events, now);
    if (this.effects.length > VISUAL_EFFECT_LIMIT) {
      this.effects.splice(0, this.effects.length - VISUAL_EFFECT_LIMIT);
    }
    if (this.deathGhosts.length > DEATH_GHOST_LIMIT) {
      this.deathGhosts.splice(0, this.deathGhosts.length - DEATH_GHOST_LIMIT);
    }
  }

  private towerMuzzlePoint(towerId: TowerId, rotationU16: number): DesignPoint {
    const anchor = this.bundle.route.towerAnchors[towerId];
    const visual = TOWER_VISUALS[towerId];
    const angle = u16ToRadians(rotationU16);
    const reach = visual.arrowLength * .82;
    return {
      x: anchor.x + Math.cos(angle) * reach,
      y: anchor.y + visual.mountY + Math.sin(angle) * reach,
    };
  }

  private recordHitReaction(entityId: number, critical: boolean, startedAt: number): void {
    const existing = this.hitReactions.get(entityId);
    if (existing && startedAt - existing.startedAt <= 90) {
      existing.startedAt = startedAt;
      existing.duration = critical || existing.critical ? 150 : 105;
      existing.critical ||= critical;
      existing.hitCount += 1;
      return;
    }
    if (this.hitReactions.size >= HIT_REACTION_LIMIT) {
      const oldest = [...this.hitReactions.entries()]
        .sort((left, right) => left[1].startedAt - right[1].startedAt)[0]?.[0];
      if (oldest !== undefined) this.hitReactions.delete(oldest);
    }
    this.hitReactions.set(entityId, {
      startedAt,
      duration: critical ? 150 : 105,
      critical,
      hitCount: 1,
    });
  }

  private isArmorLikeHit(
    entityId: number,
    currentEntities: Map<number, RenderEntityV1>,
  ): boolean {
    const entity = currentEntities.get(entityId) ?? this.entityRenderCache.get(entityId);
    if (!entity) return false;
    if (
      (entity.flags & ENEMY_FLAG_GUARDED) !== 0 ||
      (entity.flags & ENEMY_FLAG_PHASE_SHELL) !== 0 ||
      (entity.flags & ENEMY_FLAG_ETHEREAL) !== 0
    ) {
      return true;
    }
    return this.armoredRenderAssets.has(entity.assetId);
  }

  private refreshEnemyPresentationCaches(): void {
    this.armoredRenderAssets = new Set(
      Object.values(this.bundle.enemies)
        .filter((definition) => definition.armorBp > 0)
        .map((definition) => definition.renderAssetId),
    );
  }

  private isBossRenderAsset(assetId: string): boolean {
    return ENEMY_VISUALS[assetId]?.role === 'boss';
  }

  private findBossPoint(entities: RenderEntityV1[]): DesignPoint {
    const boss = entities.find(
      (entity) => entity.renderKind === 'enemy' && this.isBossRenderAsset(entity.assetId),
    );
    return boss ? { x: boss.x, y: boss.y } : this.towerCenter();
  }

  private enqueueDeathCallouts(
    clusters: Map<number, DesignPoint[]>,
    warPointsByTick: Map<number, number>,
    now: number,
  ): void {
    for (const [tick, points] of clusters) {
      if (points.length < 2) continue;
      const center = points.reduce(
        (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
        { x: 0, y: 0 },
      );
      const warPoints = warPointsByTick.get(tick) ?? 0;
      const streak = points.length >= 4 ? `潮军尽斩 ×${points.length}` : `连斩 ×${points.length}`;
      this.combatCallouts.push({
        text: warPoints > 0 ? `${streak} · +${warPoints} 战功` : streak,
        x: center.x / points.length,
        y: center.y / points.length,
        startedAt: now,
        duration: 760,
        color: points.length >= 4 ? '#ffd36d' : '#72ead5',
      });
    }
    if (this.combatCallouts.length > COMBAT_CALLOUT_LIMIT) {
      this.combatCallouts.splice(0, this.combatCallouts.length - COMBAT_CALLOUT_LIMIT);
    }
  }

  private enqueueCameraFeedback(events: BattleEvent[], now: number): void {
    const criticalHits = events.filter((event) => event.type === 'HIT' && event.critical).length;
    const deaths = events.filter((event) => event.type === 'DEATH').length;
    let amplitude = criticalHits > 0 ? Math.min(3.2, 1.4 + criticalHits * .35) : 0;
    let duration = criticalHits > 0 ? 120 : 0;
    if (deaths >= 3) {
      amplitude = Math.max(amplitude, Math.min(4.2, 2.4 + deaths * .22));
      duration = Math.max(duration, 145);
    }
    if (events.some((event) => event.type === 'BOSS_LAYER_ADVANCED')) {
      amplitude = Math.max(amplitude, 5.2);
      duration = Math.max(duration, 190);
    }
    if (events.some((event) => event.type === 'DEFEAT')) {
      amplitude = 6.5;
      duration = 240;
    } else if (events.some((event) => event.type === 'BREACH')) {
      amplitude = Math.max(amplitude, 4.4);
      duration = Math.max(duration, 175);
    } else if (events.some((event) => event.type === 'OVERDRIVE_ACTIVATED')) {
      amplitude = Math.max(amplitude, 4.8);
      duration = Math.max(duration, 185);
    } else if (events.some((event) => event.type === 'VICTORY')) {
      amplitude = Math.max(amplitude, 4.2);
      duration = Math.max(duration, 180);
    }
    if (amplitude <= 0 || duration <= 0) return;
    const seed = events.reduce(
      (value, event) => (Math.imul(value ^ event.tick, 16_777_619) ^ event.type.length) >>> 0,
      2_166_136_261,
    );
    this.cameraImpulses.push({ startedAt: now, duration, amplitude, seed });
    if (this.cameraImpulses.length > CAMERA_IMPULSE_LIMIT) {
      this.cameraImpulses.splice(0, this.cameraImpulses.length - CAMERA_IMPULSE_LIMIT);
    }
  }

  private recordDamageHit(hit: HitEventWithRenderData, point: DesignPoint, now: number): void {
    const towerId = hit.towerId === 0 || hit.towerId === 1 || hit.towerId === 2
      ? hit.towerId
      : 0;
    const damageMilli = Math.max(0, hit.damageMilli);
    this.damageSamples.push({ happenedAt: now, towerId, damageMilli });
    if (this.damageSamples.length > DAMAGE_SAMPLE_LIMIT) {
      this.damageSamples.splice(0, this.damageSamples.length - DAMAGE_SAMPLE_LIMIT);
    }
    this.pruneDamageSamples(now);

    const penetrating = (hit.penetrationIndex ?? 0) > 0;
    for (let index = this.floatingDamageTexts.length - 1; index >= 0; index -= 1) {
      const existing = this.floatingDamageTexts[index];
      if (!existing || now - existing.startedAt > FLOATING_DAMAGE_MERGE_MS) continue;
      if (
        existing.entityId === hit.entityId &&
        existing.critical === hit.critical &&
        existing.penetrating === penetrating &&
        existing.mitigation === hit.mitigation
      ) {
        existing.damageMilli += damageMilli;
        existing.hitCount += 1;
        existing.x = point.x;
        existing.y = point.y;
        existing.towerId = towerId;
        existing.startedAt = now;
        return;
      }
    }

    if (this.floatingDamageTexts.length >= FLOATING_DAMAGE_LIMIT) {
      const disposable = this.floatingDamageTexts.findIndex(
        (candidate) => !candidate.critical && candidate.penetrating,
      );
      const ordinary = this.floatingDamageTexts.findIndex((candidate) => !candidate.critical);
      this.floatingDamageTexts.splice(disposable >= 0 ? disposable : ordinary >= 0 ? ordinary : 0, 1);
    }
    this.floatingDamageTexts.push({
      entityId: hit.entityId,
      towerId,
      x: point.x,
      y: point.y,
      damageMilli,
      hitCount: 1,
      critical: hit.critical,
      penetrating,
      mitigation: hit.mitigation,
      startedAt: now,
      duration: hit.critical ? 700 : 610,
    });
  }

  private pruneDamageSamples(now = Date.now()): void {
    const firstVisible = this.damageSamples.findIndex(
      (sample) => now - sample.happenedAt <= DAMAGE_SAMPLE_WINDOW_MS,
    );
    if (firstVisible < 0) {
      this.damageSamples = [];
    } else if (firstVisible > 0) {
      this.damageSamples.splice(0, firstVisible);
    }
  }

  private resolveTowerMetrics(
    provided?: TowerMetricRenderState[],
    now = Date.now(),
  ): TowerMetricRenderState[] {
    if (provided && provided.length > 0) {
      return ([0, 1, 2] as const).map((towerId) => {
        const metric = provided.find((candidate) => candidate.towerId === towerId);
        const active = this.activeTowerIds.has(towerId);
        return {
          towerId,
          damageLast1sMilli: active ? Math.max(0, metric?.damageLast1sMilli ?? 0) : 0,
          damageLast3sMilli: active ? Math.max(0, metric?.damageLast3sMilli ?? 0) : 0,
        };
      });
    }

    this.pruneDamageSamples(now);
    return ([0, 1, 2] as const).map((towerId) => ({
      towerId,
      damageLast1sMilli: this.activeTowerIds.has(towerId) ? this.damageSamples.reduce(
        (sum, sample) => sum + (sample.towerId === towerId && now - sample.happenedAt <= 1_000
          ? sample.damageMilli
          : 0),
        0,
      ) : 0,
      damageLast3sMilli: this.activeTowerIds.has(towerId) ? this.damageSamples.reduce(
        (sum, sample) => sum + (sample.towerId === towerId && now - sample.happenedAt <= 3_000
          ? sample.damageMilli
          : 0),
        0,
      ) : 0,
    }));
  }

  drawLoading(message = '正在校验关卡与原创资产…', progress?: number): void {
    this.beginFrame();
    this.drawBackground();
    this.context.fillStyle = 'rgba(3, 10, 25, 0.72)';
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );
    this.drawSeal(DESIGN_WIDTH / 2, 430, 78, '守');
    this.text('布置箭塔', DESIGN_WIDTH / 2, 570, 48, '#f3dfaa', 'center', 700);
    this.text(message, DESIGN_WIDTH / 2, 625, 24, 'rgba(232,245,244,.68)', 'center');
    this.context.fillStyle = 'rgba(255,255,255,.14)';
    this.roundRect(DESIGN_WIDTH / 2 - 180, 675, 360, 8, 4);
    this.context.fill();
    if (progress !== undefined) {
      const normalized = Math.max(0, Math.min(1, progress));
      this.progressBar(DESIGN_WIDTH / 2 - 180, 675, 360, 8, normalized, '#6fded9');
      this.text(`${Math.round(normalized * 100)}%`, DESIGN_WIDTH / 2, 728, 18, 'rgba(232,245,244,.58)', 'center', 600);
    }
  }

  drawHome(state: HomeRenderState): void {
    this.beginFrame();
    this.drawBackground();
    const selectedStage = state.stages.find((stage) => stage.id === state.selectedStageId)
      ?? state.stages[0];
    if (!selectedStage) return;
    const stageNumber = this.stageNumber(selectedStage.id);
    const selectedEndlessRecords = selectedStage.best;
    const gradient = this.context.createLinearGradient(0, 0, DESIGN_WIDTH, 0);
    gradient.addColorStop(0, 'rgba(3,10,23,.88)');
    gradient.addColorStop(0.48, 'rgba(3,10,23,.34)');
    gradient.addColorStop(1, 'rgba(3,10,23,.12)');
    this.context.fillStyle = gradient;
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );

    this.drawSeal(92, 82, 48, '守');
    this.text('原创海防神话 · 七关战役 · 无尽挑战', 165, 58, 20, '#76dfdb', 'left', 600);
    this.text('东海潮生，关城告急', 165, 92, 24, '#f2e6c6', 'left', 700);
    this.pill(1590, 46, 250, 58, '微信小游戏版', '#102b42', '#6fded8');

    this.text('CHENTANG PASS', 118, 260, 24, 'rgba(130,224,219,.84)', 'left', 600);
    this.text(GAME_TITLE_LINES[0], 108, 405, 118, '#f5edda', 'left', 800);
    this.text(GAME_TITLE_LINES[1], 108, 530, 132, '#f0c56e', 'left', 800);
    this.text('三塔同心 · 万箭镇潮', 122, 592, 29, 'rgba(239,245,236,.82)', 'left', 600);
    this.drawGuardianOrb(128, 670, '火', '#e76d4d');
    this.drawGuardianOrb(225, 670, '霜', '#6edbdd');
    this.drawGuardianOrb(322, 670, '岚', '#9c80ef');

    state.stages.forEach((stage, index) => {
      const layout = resolveHomeStageCardLayout(state.stages.length, index);
      const { x, y, width, height } = layout;
      const selected = stage.id === selectedStage.id;
      const usesCompactCardRail = state.stages.length >= 7;
      const endlessRecordCount = new Set(
        stage.best?.map((record) => endlessRouteCode(record.routeId)),
      ).size;
      const status = stage.unlocked
        ? (stage.id === 'STAGE_08'
            ? endlessRecordCount > 0
              ? `A/B/C · 已记录 ${Math.min(3, endlessRecordCount)} 路`
              : '三路待挑战'
            : stage.completed
              ? '已通关 · 可重玩'
              : HOME_STAGE_META[stage.id].shortStatus)
        : HOME_STAGE_META[stage.id].lockedStatus;
      const stageColor = selected ? '#efc56b' : stage.unlocked ? '#5bdad7' : '#536778';
      this.context.fillStyle = selected ? 'rgba(9,29,48,.96)' : 'rgba(5,18,35,.86)';
      this.context.strokeStyle = stageColor;
      this.context.lineWidth = selected ? 3 : 2;
      this.roundRect(x, y, width, height, 20);
      this.context.fill();
      this.context.stroke();
      const nameX = usesCompactCardRail ? x + width / 2 : x + (state.stages.length >= 6 ? 45 : 52);
      const numberY = y + 60;
      this.text(
        this.stageNumber(stage.id),
        x + 11,
        usesCompactCardRail ? y + 23 : numberY,
        usesCompactCardRail ? (stage.id === 'STAGE_08' ? 20 : 13) : 28,
        `${stageColor}80`,
        'left',
        800,
      );
      this.context.save();
      this.context.beginPath();
      this.context.rect(usesCompactCardRail ? x + 8 : nameX - 2, y + 8, usesCompactCardRail ? width - 16 : width - (nameX - x) - 8, height - 16);
      this.context.clip();
      this.text(stage.name, nameX, y + 43, usesCompactCardRail ? 16 : state.stages.length >= 6 ? 17 : 18, stage.unlocked ? '#f3ead6' : '#82909a', usesCompactCardRail ? 'center' : 'left', 700, 10);
      this.text(
        status,
        nameX,
        y + 72,
        usesCompactCardRail ? (stage.id === 'STAGE_08' ? 11 : 12) : 13,
        stageColor,
        usesCompactCardRail ? 'center' : 'left',
        600,
        8,
      );
      this.context.restore();
      if (stage.unlocked) {
        this.interactions.push({
          id: `home-stage:${stage.id}`,
          x,
          y: layout.hitY,
          width,
          height: layout.hitHeight,
        });
      }
    });

    this.context.fillStyle = 'rgba(5, 18, 35, .92)';
    this.context.strokeStyle = 'rgba(224, 185, 99, .72)';
    this.context.lineWidth = 3;
    this.roundRect(800, 758, 1010, 250, 30);
    this.context.fill();
    this.context.stroke();
    this.text(stageNumber, 856, 872, 96, 'rgba(239,198,105,.3)', 'left', 800);
    this.text(
      HOME_STAGE_META[selectedStage.id].eyebrow,
      1090,
      808,
      22,
      '#6edcd8',
      'left',
      600,
    );
    this.text(selectedStage.name, 1090, 862, 44, '#f5ebd4', 'left', 750);
    if (selectedStage.id === 'STAGE_08') {
      this.text('A / B / C 本地纪录', 1740, 835, 14, 'rgba(225,238,234,.54)', 'right', 600, 8);
      this.text(endlessRouteSummary(selectedEndlessRecords), 1740, 872, 16, '#72e2d7', 'right', 720, 9, CARD_NUMBER_FONT);
    }
    this.text(
      !selectedStage.unlocked
        ? HOME_STAGE_META[selectedStage.id].lockedDescription
        : selectedStage.resumeTick === undefined
          ? HOME_STAGE_META[selectedStage.id].description
          : `已保存至第 ${Math.floor(selectedStage.resumeTick / 30)} 秒，可继续本关。`,
      1090,
      900,
      21,
      'rgba(229,241,238,.66)',
      'left',
    );

    const homeStatus = state.error
      ? `加载失败 · 点关卡重试 · ${state.error}`
      : state.notice;
    if (homeStatus) {
      const statusColor = state.error ? '#ff9b8e' : '#72ded9';
      this.context.fillStyle = state.error ? 'rgba(116, 31, 38, .58)' : 'rgba(42, 119, 116, .34)';
      this.roundRect(1390, 780, 380, 42, 14);
      this.context.fill();
      this.wrapText(homeStatus, 1580, 807, 342, 22, 16, statusColor, 650, 10, 1);
    }

    if (selectedStage.unlocked && selectedStage.resumeTick === undefined) {
      this.drawButton(
        'home-start',
        1390,
        924,
        300,
        64,
        HOME_STAGE_META[selectedStage.id].startLabel,
        '#d09b43',
        '#08152b',
      );
    } else if (selectedStage.unlocked) {
      this.drawButton('home-new', 1090, 924, 210, 64, '重新本关', 'rgba(255,255,255,.08)', '#e9eee7', '#536778');
      this.drawButton('home-continue', 1320, 924, 370, 64, '继续守关  ›', '#d09b43', '#08152b');
    }

    const totalStages = String(state.stages.length).padStart(2, '0');
    this.text(`STAGE ${stageNumber} / ${totalStages}`, 118, 1040, 17, 'rgba(230,239,235,.5)', 'left', 600);
    this.text('七关战役逐关解锁 · 无尽三路成绩分存', 1800, 1040, 17, 'rgba(230,239,235,.5)', 'right');
  }

  drawBattle(state: BattleRenderState): void {
    this.beginFrame();
    if (state.snapshot.tick < this.lastMetricsSnapshotTick) {
      this.damageSamples = [];
      this.floatingDamageTexts = [];
      this.hitReactions.clear();
      this.deathGhosts = [];
      this.cameraImpulses = [];
      this.combatCallouts = [];
      this.entityRenderCache.clear();
    }
    this.lastMetricsSnapshotTick = state.snapshot.tick;
    this.currentBattleSpeed = state.hud.speed;
    this.currentArrowCount = this.resolveTowerStats(state.hud).current.arrowCount;
    const projectedActiveTowerIds = Array.isArray(state.hud.activeTowerIds)
      ? state.hud.activeTowerIds.filter(
        (towerId): towerId is TowerId => towerId === 0 || towerId === 1 || towerId === 2,
      )
      : ([0, 1, 2] as TowerId[]);
    this.activeTowerIds = new Set<TowerId>(projectedActiveTowerIds);
    const towerMetrics = this.resolveTowerMetrics(state.towerMetrics);
    const displayedTowerFacings = this.updateTowerFacings(
      state.snapshot.towerFacingsU16,
      state.snapshot.tick,
    );
    const cameraOffset = this.resolveCameraOffset();
    this.drawBattleBackground(cameraOffset);
    this.context.fillStyle = 'rgba(2, 10, 25, .20)';
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );
    this.context.save();
    this.applyBattleWorldTransform(cameraOffset);
    this.drawRoute();
    this.drawAimGuides(
      state.hud.aimAnglesU16,
      state.selectedTowerId,
      state.aimingTowerId,
      state.aimPoint,
    );
    this.drawBreachSeal();
    this.drawTowers(displayedTowerFacings, state.selectedTowerId);
    this.drawEntities(state.snapshot.entities);
    this.drawDeathGhosts();
    this.drawEffects();
    this.drawFloatingDamageTexts();
    this.drawCombatCallouts();
    this.context.restore();
    const cardOverlayVisible = state.hud.flowState === 'offer-pending' && state.hud.activeOffer;
    if (!cardOverlayVisible) {
      this.drawHud(state.hud, state.muted, state.selectedTowerId, towerMetrics);
    }

    const endlessHud = resolveEndlessHud(state.hud);
    const showEndlessSettlement = Boolean(
      endlessHud && (
        state.endlessResult ||
        state.hud.flowState === 'result' ||
        state.hud.outcome === 'settled'
      ),
    );
    const showFixedDefeat = Boolean(
      !endlessHud &&
      state.hud.flowState === 'result' &&
      state.hud.outcome === 'defeat',
    );

    const modalVisible = Boolean(
      state.error ||
      showEndlessSettlement ||
      (state.victory && !endlessHud) ||
      showFixedDefeat ||
      state.strategyPanelOpen ||
      state.hud.flowState === 'offer-pending' ||
      state.hud.flowState === 'defeat-pending' ||
      state.hud.flowState === 'paused' ||
      state.hud.flowState === 'performance-paused'
    );
    if (modalVisible) this.interactions = [];

    if (state.error) {
      this.drawErrorOverlay(state.error);
    } else if (showEndlessSettlement && endlessHud) {
      this.drawEndlessResultOverlay(
        state.endlessResult,
        state.endlessPreviousBest,
        state.endlessIsNewBest,
        state.endlessSettlementReason,
        endlessHud,
        state.hud,
      );
    } else if (state.victory && !endlessHud) {
      this.drawVictoryOverlay(state.hud, state.nextStageName);
    } else if (showFixedDefeat) {
      this.drawDefeatOverlay(undefined, true);
    } else if (state.hud.flowState === 'offer-pending' && state.hud.activeOffer) {
      this.drawCardOverlay(
        state.hud.activeOffer.cards,
        state.hud,
        state.rerollsRemaining,
        state.selectedShopCardId,
      );
    } else if (state.hud.flowState === 'defeat-pending') {
      this.drawDefeatOverlay(state.reviveOrdinal);
    } else if (state.strategyPanelOpen) {
      this.drawTowerStrategyPanel(state, towerMetrics);
    } else if (state.hud.flowState === 'paused' || state.hud.flowState === 'performance-paused') {
      this.drawPauseOverlay();
    }
  }

  private beginFrame(): void {
    const size = this.runtime.size();
    this.context.setTransform(size.pixelRatio, 0, 0, size.pixelRatio, 0, 0);
    this.context.fillStyle = '#020817';
    this.context.fillRect(0, 0, size.width, size.height);
    this.context.setTransform(
      size.pixelRatio * this.scale,
      0,
      0,
      size.pixelRatio * this.scale,
      size.pixelRatio * this.offsetX,
      size.pixelRatio * this.offsetY,
    );
    this.context.imageSmoothingEnabled = true;
    this.interactions = [];
  }

  private updateViewport(): void {
    const { width, height } = this.runtime.size();
    this.viewport = resolveViewportLayout(width, height);
    this.scale = this.viewport.scale;
    this.offsetX = this.viewport.offsetX;
    this.offsetY = this.viewport.offsetY;
  }

  private drawBackground(): void {
    const background = this.images.get(this.bundle.stage.backgroundAssetId);
    if (background) {
      this.context.fillStyle = '#071528';
      this.context.fillRect(
        this.viewport.left,
        this.viewport.top,
        this.viewport.width,
        this.viewport.height,
      );
      this.drawBackgroundExtensions(background);
      this.context.drawImage(background, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
      return;
    }
    const gradient = this.context.createLinearGradient(0, this.viewport.top, 0, this.viewport.bottom);
    gradient.addColorStop(0, '#112b4a');
    gradient.addColorStop(0.58, '#12455c');
    gradient.addColorStop(1, '#07354a');
    this.context.fillStyle = gradient;
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );
  }

  private drawBattleBackground(cameraOffset: DesignPoint): void {
    const background = this.images.get(this.bundle.stage.backgroundAssetId);
    if (!background) {
      this.drawBackground();
      return;
    }

    this.context.fillStyle = '#071528';
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );

    const worldTopLeft = unprojectBattleWorldPoint({
      x: this.viewport.left - cameraOffset.x,
      y: this.viewport.top - cameraOffset.y,
    });
    const worldBottomRight = unprojectBattleWorldPoint({
      x: this.viewport.right - cameraOffset.x,
      y: this.viewport.bottom - cameraOffset.y,
    });

    this.context.save();
    this.applyBattleWorldTransform(cameraOffset);
    this.drawBackgroundExtensions(
      background,
      {
        left: worldTopLeft.x,
        top: worldTopLeft.y,
        right: worldBottomRight.x,
        bottom: worldBottomRight.y,
      },
    );
    this.context.drawImage(background, 0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.context.restore();
  }

  private applyBattleWorldTransform(cameraOffset: DesignPoint): void {
    this.context.translate(cameraOffset.x, cameraOffset.y);
    this.context.translate(BATTLE_WORLD_PIVOT.x, BATTLE_WORLD_PIVOT.y);
    this.context.scale(BATTLE_WORLD_SCALE, BATTLE_WORLD_SCALE);
    this.context.translate(-BATTLE_WORLD_PIVOT.x, -BATTLE_WORLD_PIVOT.y);
  }

  private drawBackgroundExtensions(
    background: any,
    bounds: Pick<ViewportLayout, 'left' | 'top' | 'right' | 'bottom'> = this.viewport,
  ): void {
    const leftWidth = Math.max(0, -bounds.left);
    if (leftWidth > 0) {
      const sourceWidth = Math.min(DESIGN_WIDTH, leftWidth);
      this.drawReflectedBackgroundRegion(
        background,
        0,
        0,
        sourceWidth,
        DESIGN_HEIGHT,
        -leftWidth,
        0,
        leftWidth,
        DESIGN_HEIGHT,
        true,
        false,
      );
    }

    const rightWidth = Math.max(0, bounds.right - DESIGN_WIDTH);
    if (rightWidth > 0) {
      const sourceWidth = Math.min(DESIGN_WIDTH, rightWidth);
      this.drawReflectedBackgroundRegion(
        background,
        DESIGN_WIDTH - sourceWidth,
        0,
        sourceWidth,
        DESIGN_HEIGHT,
        DESIGN_WIDTH,
        0,
        rightWidth,
        DESIGN_HEIGHT,
        true,
        false,
      );
    }

    const topHeight = Math.max(0, -bounds.top);
    if (topHeight > 0) {
      const sourceHeight = Math.min(DESIGN_HEIGHT, topHeight);
      this.drawReflectedBackgroundRegion(
        background,
        0,
        0,
        DESIGN_WIDTH,
        sourceHeight,
        0,
        -topHeight,
        DESIGN_WIDTH,
        topHeight,
        false,
        true,
      );
    }

    const bottomHeight = Math.max(0, bounds.bottom - DESIGN_HEIGHT);
    if (bottomHeight > 0) {
      const sourceHeight = Math.min(DESIGN_HEIGHT, bottomHeight);
      this.drawReflectedBackgroundRegion(
        background,
        0,
        DESIGN_HEIGHT - sourceHeight,
        DESIGN_WIDTH,
        sourceHeight,
        0,
        DESIGN_HEIGHT,
        DESIGN_WIDTH,
        bottomHeight,
        false,
        true,
      );
    }

    const horizontalExtensions = [
      leftWidth > 0
        ? {
          sourceX: 0,
          sourceWidth: Math.min(DESIGN_WIDTH, leftWidth),
          targetX: -leftWidth,
          targetWidth: leftWidth,
        }
        : undefined,
      rightWidth > 0
        ? {
          sourceX: DESIGN_WIDTH - Math.min(DESIGN_WIDTH, rightWidth),
          sourceWidth: Math.min(DESIGN_WIDTH, rightWidth),
          targetX: DESIGN_WIDTH,
          targetWidth: rightWidth,
        }
        : undefined,
    ].filter((extension): extension is {
      sourceX: number;
      sourceWidth: number;
      targetX: number;
      targetWidth: number;
    } => extension !== undefined);
    const verticalExtensions = [
      topHeight > 0
        ? {
          sourceY: 0,
          sourceHeight: Math.min(DESIGN_HEIGHT, topHeight),
          targetY: -topHeight,
          targetHeight: topHeight,
        }
        : undefined,
      bottomHeight > 0
        ? {
          sourceY: DESIGN_HEIGHT - Math.min(DESIGN_HEIGHT, bottomHeight),
          sourceHeight: Math.min(DESIGN_HEIGHT, bottomHeight),
          targetY: DESIGN_HEIGHT,
          targetHeight: bottomHeight,
        }
        : undefined,
    ].filter((extension): extension is {
      sourceY: number;
      sourceHeight: number;
      targetY: number;
      targetHeight: number;
    } => extension !== undefined);
    for (const horizontal of horizontalExtensions) {
      for (const vertical of verticalExtensions) {
        this.drawReflectedBackgroundRegion(
          background,
          horizontal.sourceX,
          vertical.sourceY,
          horizontal.sourceWidth,
          vertical.sourceHeight,
          horizontal.targetX,
          vertical.targetY,
          horizontal.targetWidth,
          vertical.targetHeight,
          true,
          true,
        );
      }
    }
  }

  private drawReflectedBackgroundRegion(
    background: any,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    targetX: number,
    targetY: number,
    targetWidth: number,
    targetHeight: number,
    flipX: boolean,
    flipY: boolean,
  ): void {
    this.context.save();
    this.context.translate(
      targetX + (flipX ? targetWidth : 0),
      targetY + (flipY ? targetHeight : 0),
    );
    this.context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    this.context.drawImage(
      background,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );
    this.context.restore();
  }

  private drawRoute(): void {
    const points = this.bundle.route.points;
    const theme = BATTLE_STAGE_THEME[this.bundle.stage.id];
    const draw = (width: number, color: string) => {
      const first = points[0];
      if (!first) return;
      this.context.beginPath();
      this.context.moveTo(first.x, first.y);
      for (const point of points.slice(1)) this.context.lineTo(point.x, point.y);
      this.context.lineCap = 'round';
      this.context.lineJoin = 'round';
      this.context.lineWidth = width;
      this.context.strokeStyle = color;
      this.context.stroke();
    };
    draw(96, 'rgba(2, 23, 37, .72)');
    draw(68, theme.routeFill);
    draw(4, theme.routeCore);

    const seal = resolveBreachSealPlacement(this.bundle.route);
    this.context.save();
    this.context.translate(seal.x, seal.y);
    this.context.rotate(seal.tangentRadians);
    const intake = this.context.createLinearGradient(-150, 0, 18, 0);
    intake.addColorStop(0, 'rgba(2, 16, 30, 0)');
    intake.addColorStop(.45, 'rgba(2, 16, 30, .10)');
    intake.addColorStop(1, 'rgba(2, 12, 26, .48)');
    this.context.fillStyle = intake;
    this.context.beginPath();
    this.context.moveTo(-150, -31);
    this.context.lineTo(14, -17);
    this.context.lineTo(14, 17);
    this.context.lineTo(-150, 31);
    this.context.closePath();
    this.context.fill();
    this.context.globalAlpha = .42;
    this.context.strokeStyle = theme.secondary;
    this.context.lineWidth = Math.max(2, 1.2 / Math.max(this.scale, .01));
    for (const markX of [-110, -72, -34]) {
      this.context.beginPath();
      this.context.moveTo(markX - 9, -10);
      this.context.lineTo(markX + 3, 0);
      this.context.lineTo(markX - 9, 10);
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawBreachSeal(): void {
    const placement = resolveBreachSealPlacement(this.bundle.route);
    const theme = BATTLE_STAGE_THEME[this.bundle.stage.id];
    const now = Date.now();
    const pulse = .5 + Math.sin(now / 420) * .5;
    const gateFlashAge = now - this.gateDamageFlashStartedAt;
    const gateFlash = gateFlashAge >= 0 && gateFlashAge < 620
      ? (1 - gateFlashAge / 620) * (.78 + Math.sin(gateFlashAge / 42) * .22)
      : 0;
    this.context.save();
    this.context.translate(placement.x, placement.y);

    const aura = this.context.createRadialGradient(0, -10, 8, 0, -10, 126);
    aura.addColorStop(0, theme.glow);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.context.fillStyle = aura;
    this.context.beginPath();
    this.context.ellipse(0, -4, 126, 58, 0, 0, Math.PI * 2);
    this.context.fill();

    if (gateFlash > 0) {
      this.context.save();
      this.context.globalAlpha = gateFlash;
      this.context.strokeStyle = '#ff766d';
      this.context.lineWidth = 8;
      this.context.beginPath();
      this.context.ellipse(0, -4, 118, 52, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }

    this.context.save();
    this.context.rotate(placement.tangentRadians);
    this.context.fillStyle = 'rgba(1, 7, 17, .66)';
    this.context.beginPath();
    this.context.ellipse(0, 8, 102, 34, 0, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = 'rgba(10, 31, 50, .78)';
    this.context.strokeStyle = theme.accent;
    this.context.lineWidth = Math.max(3, 1.6 / Math.max(this.scale, .01));
    this.context.beginPath();
    this.context.ellipse(0, 0, 88, 27, 0, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();

    this.context.globalAlpha = .45 + pulse * .28;
    this.context.strokeStyle = theme.secondary;
    this.context.lineWidth = Math.max(3, 1.5 / Math.max(this.scale, .01));
    for (const [start, end] of [[-.92, -.12], [.08, .88], [2.22, 3.02], [3.22, 4.02]] as const) {
      this.context.beginPath();
      this.context.ellipse(0, 0, 98, 34, 0, start, end);
      this.context.stroke();
    }
    this.context.globalAlpha = 1;

    this.context.strokeStyle = 'rgba(1, 9, 19, .88)';
    this.context.lineWidth = 14;
    this.context.beginPath();
    this.context.moveTo(0, -78);
    this.context.lineTo(0, 78);
    this.context.stroke();
    this.context.strokeStyle = theme.accent;
    this.context.lineWidth = Math.max(4, 2 / Math.max(this.scale, .01));
    this.context.beginPath();
    this.context.moveTo(0, -72);
    this.context.lineTo(0, 72);
    this.context.stroke();

    for (const side of [-1, 1]) {
      this.context.save();
      this.context.translate(0, side * 76);
      this.context.fillStyle = theme.surface;
      this.context.strokeStyle = theme.secondary;
      this.context.lineWidth = Math.max(2, 1.2 / Math.max(this.scale, .01));
      this.context.beginPath();
      this.context.moveTo(0, -12);
      this.context.lineTo(12, 0);
      this.context.lineTo(0, 12);
      this.context.lineTo(-12, 0);
      this.context.closePath();
      this.context.fill();
      this.context.stroke();
      this.context.fillStyle = theme.accent;
      this.context.beginPath();
      this.context.arc(0, 0, 4 + pulse, 0, Math.PI * 2);
      this.context.fill();
      this.context.restore();
    }

    this.drawBreachMotif(theme);
    this.context.restore();

    this.drawBreachCrest(theme, pulse);
    this.pill(
      -83,
      -99,
      166,
      30,
      `关印 · ${theme.breachLabel}`,
      'rgba(3, 14, 29, .90)',
      gateFlash > 0 ? '#ff8a72' : theme.accent,
      15,
      9,
    );
    this.context.restore();
  }

  private drawBreachCrest(theme: BattleStageTheme, pulse: number): void {
    this.context.save();
    this.context.translate(0, -37);
    this.context.globalAlpha = .38 + pulse * .28;
    this.context.strokeStyle = theme.accent;
    this.context.lineWidth = Math.max(3, 1.5 / Math.max(this.scale, .01));
    this.context.beginPath();
    this.context.moveTo(0, -34 - pulse * 2);
    this.context.lineTo(29 + pulse * 2, -16);
    this.context.lineTo(27 + pulse * 2, 18);
    this.context.lineTo(0, 35 + pulse * 2);
    this.context.lineTo(-27 - pulse * 2, 18);
    this.context.lineTo(-29 - pulse * 2, -16);
    this.context.closePath();
    this.context.stroke();
    this.context.globalAlpha = 1;

    const crest = this.context.createLinearGradient(-24, -28, 24, 28);
    crest.addColorStop(0, theme.surface);
    crest.addColorStop(1, '#071426');
    this.context.fillStyle = crest;
    this.context.strokeStyle = theme.secondary;
    this.context.lineWidth = Math.max(3, 1.4 / Math.max(this.scale, .01));
    this.context.beginPath();
    this.context.moveTo(0, -26);
    this.context.lineTo(22, -13);
    this.context.lineTo(20, 14);
    this.context.lineTo(0, 27);
    this.context.lineTo(-20, 14);
    this.context.lineTo(-22, -13);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.context.strokeStyle = theme.accent;
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    this.context.moveTo(-12, -15);
    this.context.lineTo(12, -15);
    this.context.stroke();
    this.text('守', 0, 9, 22, theme.secondary, 'center', 800, 10, CARD_SERIF_FONT);
    this.context.restore();
  }

  private drawBreachMotif(theme: BattleStageTheme): void {
    this.context.save();
    this.context.globalAlpha = .72;
    this.context.strokeStyle = theme.secondary;
    this.context.lineWidth = Math.max(2, 1.1 / Math.max(this.scale, .01));
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    if (theme.breachMotif === 'battlement') {
      this.context.beginPath();
      this.context.moveTo(-30, 8);
      this.context.lineTo(-30, -7);
      this.context.lineTo(-16, -7);
      this.context.lineTo(-16, -15);
      this.context.lineTo(-3, -15);
      this.context.lineTo(-3, -7);
      this.context.lineTo(11, -7);
      this.context.lineTo(11, -15);
      this.context.lineTo(25, -15);
      this.context.lineTo(25, 8);
      this.context.stroke();
    } else if (theme.breachMotif === 'tide') {
      for (const y of [-6, 7]) {
        this.context.beginPath();
        this.context.moveTo(-32, y);
        this.context.quadraticCurveTo(-16, y - 12, 0, y);
        this.context.quadraticCurveTo(16, y + 12, 32, y);
        this.context.stroke();
      }
    } else if (theme.breachMotif === 'dragon') {
      this.context.beginPath();
      this.context.moveTo(-30, 7);
      this.context.lineTo(-16, -11);
      this.context.lineTo(-3, 1);
      this.context.lineTo(10, -15);
      this.context.lineTo(30, 7);
      this.context.lineTo(13, 1);
      this.context.lineTo(0, 15);
      this.context.closePath();
      this.context.stroke();
    } else if (theme.breachMotif === 'sun') {
      this.context.beginPath();
      this.context.arc(0, 0, 12, 0, Math.PI * 2);
      this.context.stroke();
      this.context.fillStyle = theme.accent;
      this.context.beginPath();
      this.context.arc(0, 0, 4, 0, Math.PI * 2);
      this.context.fill();
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = ray * Math.PI / 4;
        this.context.beginPath();
        this.context.moveTo(Math.cos(angle) * 18, Math.sin(angle) * 18);
        this.context.lineTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
        this.context.stroke();
      }
    } else if (theme.breachMotif === 'pearl') {
      this.context.beginPath();
      this.context.arc(0, 1, 6, 0, Math.PI * 2);
      this.context.stroke();
      for (const radius of [13, 21, 29]) {
        this.context.beginPath();
        this.context.arc(0, 1, radius, -.72, Math.PI * 1.55);
        this.context.stroke();
      }
      this.context.fillStyle = theme.accent;
      this.context.beginPath();
      this.context.arc(0, 1, 3.5, 0, Math.PI * 2);
      this.context.fill();
    } else if (theme.breachMotif === 'scroll') {
      this.context.beginPath();
      this.context.moveTo(-25, -16);
      this.context.quadraticCurveTo(-34, -16, -31, -5);
      this.context.lineTo(-25, 17);
      this.context.lineTo(23, 17);
      this.context.quadraticCurveTo(34, 17, 30, 6);
      this.context.lineTo(24, -16);
      this.context.closePath();
      this.context.stroke();
      this.context.beginPath();
      this.context.moveTo(-18, -7);
      this.context.lineTo(17, -7);
      this.context.moveTo(-13, 2);
      this.context.lineTo(12, 2);
      this.context.moveTo(-7, 10);
      this.context.lineTo(18, 10);
      this.context.stroke();
      this.context.fillStyle = theme.accent;
      this.context.beginPath();
      this.context.arc(-23, 17, 3.5, 0, Math.PI * 2);
      this.context.arc(22, -16, 3.5, 0, Math.PI * 2);
      this.context.fill();
    } else {
      for (const direction of [-1, 1]) {
        this.context.beginPath();
        this.context.arc(direction * 7, 0, 21, direction > 0 ? .55 : 3.7, direction > 0 ? 3.55 : 6.7);
        this.context.stroke();
      }
      this.context.beginPath();
      this.context.ellipse(0, 0, 7, 16, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.fillStyle = theme.accent;
      this.context.beginPath();
      this.context.arc(0, 0, 3.5, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.restore();
  }

  private updateTowerFacings(
    targetAngles: TowerAimAnglesU16,
    snapshotTick: number,
  ): TowerAimAnglesU16 {
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(250, now - this.lastTowerFacingAt));
    const reset = !this.towerFacingsInitialized || snapshotTick < this.lastSnapshotTick || elapsed >= 250;
    const blend = reset ? 1 : 1 - Math.exp(-elapsed / 72);
    for (let index = 0; index < targetAngles.length; index += 1) {
      const target = targetAngles[index] ?? 0;
      const current = this.displayedTowerFacingsU16[index] ?? target;
      const shortestDelta = ((target - current + 32_768) & 0xffff) - 32_768;
      this.displayedTowerFacingsU16[index] = Math.round(current + shortestDelta * blend) & 0xffff;
    }
    this.towerFacingsInitialized = true;
    this.lastTowerFacingAt = now;
    this.lastSnapshotTick = snapshotTick;
    return [...this.displayedTowerFacingsU16] as TowerAimAnglesU16;
  }

  private drawTowers(anglesU16: TowerAimAnglesU16, selectedTowerId: TowerId): void {
    const now = Date.now();
    this.bundle.route.towerAnchors.forEach((anchor, index) => {
      const towerId = index as TowerId;
      const visual = TOWER_VISUALS[towerId];
      const active = this.activeTowerIds.has(towerId);
      const selected = towerId === selectedTowerId;
      const recoilElapsed = now - (this.towerRecoilStartedAt[towerId] ?? 0);
      const recoilActive = recoilElapsed >= 0 && recoilElapsed < 150;
      const facingU16 = recoilActive
        ? this.towerReleaseFacingsU16[towerId] ?? anglesU16[towerId]
        : anglesU16[towerId];
      const angle = u16ToRadians(facingU16);
      this.context.save();
      this.context.translate(anchor.x, anchor.y);
      if (!active) {
        this.drawLockedTowerBase(towerId);
        this.context.restore();
        return;
      }
      this.drawTowerSelection(selected, now);
      this.drawTowerBase(towerId);
      this.context.save();
      this.context.translate(0, visual.mountY);
      this.context.rotate(angle);
      const recoil = recoilActive
        ? Math.sin((recoilElapsed / 150) * Math.PI) * 12
        : 0;
      this.context.translate(-recoil, 0);
      this.drawTowerHead(towerId);
      this.context.restore();
      this.drawTowerBadge(towerId, selected);
      this.context.restore();
    });
  }

  private drawLockedTowerBase(towerId: TowerId): void {
    this.context.save();
    this.context.globalAlpha = .3;
    this.drawTowerBase(towerId);
    this.context.restore();
    this.context.save();
    this.context.shadowColor = 'rgba(4, 12, 26, .9)';
    this.context.shadowBlur = 16;
    this.drawSeal(0, -18, 36, '锁', 'rgba(4, 16, 31, .94)', '#8fa5ad');
    this.context.restore();
    this.pill(
      -58,
      72,
      116,
      30,
      '待增援',
      'rgba(3, 14, 29, .86)',
      'rgba(200, 216, 216, .68)',
      15,
      9,
    );
  }

  private drawTowerSelection(selected: boolean, now: number): void {
    if (!selected) return;
    const radius = 111 + Math.sin(now / 210) * 2;
    const centerY = -8;
    this.context.fillStyle = 'rgba(67, 230, 229, .075)';
    this.context.beginPath();
    this.context.arc(0, centerY, radius - 3, 0, Math.PI * 2);
    this.context.fill();
    this.context.strokeStyle = 'rgba(91, 239, 235, .96)';
    this.context.lineWidth = 7;
    this.context.lineCap = 'round';
    for (let segment = 0; segment < 4; segment += 1) {
      const start = segment * Math.PI / 2 - .56;
      this.context.beginPath();
      this.context.arc(0, centerY, radius, start, start + .72);
      this.context.stroke();
    }
    this.context.strokeStyle = 'rgba(233, 255, 249, .82)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.arc(0, centerY, radius - 8, 0, Math.PI * 2);
    this.context.stroke();
  }

  private drawTowerBase(towerId: TowerId): void {
    const visual = TOWER_VISUALS[towerId];
    this.context.fillStyle = 'rgba(1, 6, 16, .55)';
    this.context.beginPath();
    this.context.ellipse(0, 52, 94, 27, 0, 0, Math.PI * 2);
    this.context.fill();

    const base = this.images.get(visual.baseAssetId);
    if (base) {
      this.context.drawImage(
        base,
        -visual.baseSize / 2,
        -visual.baseSize / 2,
        visual.baseSize,
        visual.baseSize,
      );
      return;
    }

    this.context.fillStyle = '#102c48';
    this.context.strokeStyle = visual.accent;
    this.context.lineWidth = 8;
    this.context.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = Math.PI / 8 + point * Math.PI / 4;
      const x = Math.cos(angle) * 88;
      const y = Math.sin(angle) * 72;
      if (point === 0) this.context.moveTo(x, y);
      else this.context.lineTo(x, y);
    }
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.context.fillStyle = visual.aura;
    this.context.beginPath();
    this.context.arc(0, -25, 48, 0, Math.PI * 2);
    this.context.fill();
    this.context.strokeStyle = 'rgba(239,220,165,.78)';
    this.context.lineWidth = 5;
    this.context.beginPath();
    this.context.arc(0, -25, 34, 0, Math.PI * 2);
    this.context.stroke();
  }

  private drawTowerHead(towerId: TowerId): void {
    const visual = TOWER_VISUALS[towerId];
    const head = this.images.get(visual.headAssetId);
    if (head) {
      const scale = visual.headSize / 384;
      this.context.drawImage(
        head,
        -visual.headPivotX * scale,
        -visual.headPivotY * scale,
        visual.headSize,
        visual.headSize,
      );
    } else {
      this.context.fillStyle = '#10263f';
      this.context.strokeStyle = visual.accent;
      this.context.lineWidth = 7;
      this.context.beginPath();
      this.context.arc(0, 0, 31, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.context.strokeStyle = '#e4c36f';
      this.context.lineWidth = 10;
      this.context.beginPath();
      this.context.moveTo(-19, -49);
      this.context.quadraticCurveTo(-53, 0, -19, 49);
      this.context.stroke();
      this.context.strokeStyle = 'rgba(235,248,240,.86)';
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.moveTo(-19, -49);
      this.context.lineTo(-34, 0);
      this.context.lineTo(-19, 49);
      this.context.stroke();
    }
    this.drawLoadedTowerArrow(towerId, visual.arrowLength);
  }

  private drawLoadedTowerArrow(towerId: TowerId, arrowLength: number): void {
    const palette = PROJECTILE_PALETTES[towerId];
    const tail = -18;
    const tip = arrowLength;
    this.context.lineCap = 'round';
    this.context.strokeStyle = '#061426';
    this.context.lineWidth = 8;
    this.context.beginPath();
    this.context.moveTo(tail, 0);
    this.context.lineTo(tip - 7, 0);
    this.context.stroke();
    this.context.strokeStyle = '#f4edd7';
    this.context.lineWidth = 3;
    this.context.beginPath();
    this.context.moveTo(tail, 0);
    this.context.lineTo(tip - 7, 0);
    this.context.stroke();

    this.context.fillStyle = '#07162a';
    this.context.beginPath();
    this.context.moveTo(tail - 5, 0);
    this.context.lineTo(tail + 10, -11);
    this.context.lineTo(tail + 16, -4);
    this.context.lineTo(tail + 8, 0);
    this.context.lineTo(tail + 16, 4);
    this.context.lineTo(tail + 10, 11);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = palette.feather;
    this.context.beginPath();
    this.context.moveTo(tail - 1, 0);
    this.context.lineTo(tail + 10, -7);
    this.context.lineTo(tail + 14, -3);
    this.context.lineTo(tail + 7, 0);
    this.context.lineTo(tail + 14, 3);
    this.context.lineTo(tail + 10, 7);
    this.context.closePath();
    this.context.fill();

    this.context.fillStyle = '#061426';
    this.context.beginPath();
    this.context.moveTo(tip - 12, -12);
    this.context.lineTo(tip + 10, 0);
    this.context.lineTo(tip - 12, 12);
    this.context.lineTo(tip - 5, 0);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = palette.feather;
    this.context.beginPath();
    this.context.moveTo(tip - 9, -8);
    this.context.lineTo(tip + 7, 0);
    this.context.lineTo(tip - 9, 8);
    this.context.lineTo(tip - 3, 0);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = '#ffe29b';
    this.context.beginPath();
    this.context.moveTo(tip - 3, -4);
    this.context.lineTo(tip + 7, 0);
    this.context.lineTo(tip - 3, 4);
    this.context.closePath();
    this.context.fill();
  }

  private drawTowerBadge(towerId: TowerId, selected: boolean): void {
    const visual = TOWER_VISUALS[towerId];
    this.context.fillStyle = selected ? '#54e1de' : 'rgba(5, 20, 38, .94)';
    this.context.strokeStyle = selected ? '#f1fff9' : visual.accent;
    this.context.lineWidth = 4;
    this.context.beginPath();
    this.context.arc(-80, -82, 25, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.text(String(towerId + 1), -80, -73, 28, selected ? '#062032' : '#f5e2aa', 'center', 850, 11);
  }

  private drawAimGuides(
    anglesU16: TowerAimAnglesU16,
    selectedTowerId: TowerId,
    aimingTowerId?: TowerId,
    point?: DesignPoint,
  ): void {
    const halfAngle = u16ToRadians(this.bundle.tower.aimHalfAngleU16);
    this.bundle.route.towerAnchors.forEach((anchor, index) => {
      const towerId = index as TowerId;
      if (!this.activeTowerIds.has(towerId)) return;
      const angle = u16ToRadians(anglesU16[towerId]);
      const selected = towerId === selectedTowerId;
      const aiming = towerId === aimingTowerId;
      if (!selected && !aiming) return;
      const guideRadius = aiming ? 300 : 230;
      this.context.beginPath();
      this.context.moveTo(anchor.x, anchor.y);
      this.context.arc(anchor.x, anchor.y, guideRadius, angle - halfAngle, angle + halfAngle);
      this.context.closePath();
      this.context.fillStyle = aiming
        ? 'rgba(41,216,230,.13)'
        : 'rgba(41,216,230,.055)';
      this.context.fill();
      this.context.strokeStyle = aiming
        ? 'rgba(74,235,232,.92)'
        : 'rgba(60,224,225,.62)';
      this.context.lineWidth = aiming ? 5 : 3;
      this.context.beginPath();
      this.context.moveTo(anchor.x + Math.cos(angle) * 108, anchor.y + Math.sin(angle) * 108);
      this.context.lineTo(
        anchor.x + Math.cos(angle) * (guideRadius - 18),
        anchor.y + Math.sin(angle) * (guideRadius - 18),
      );
      this.context.stroke();
    });
    if (aimingTowerId === undefined || !point || !this.activeTowerIds.has(aimingTowerId)) return;
    const anchor = this.bundle.route.towerAnchors[aimingTowerId];
    this.context.strokeStyle = 'rgba(85, 227, 231, .52)';
    this.context.lineWidth = 3;
    this.context.beginPath();
    this.context.moveTo(anchor.x, anchor.y);
    this.context.lineTo(point.x, point.y);
    this.context.stroke();
    this.context.strokeStyle = '#55e3e7';
    this.context.lineWidth = 5;
    this.context.beginPath();
    this.context.arc(point.x, point.y, 34, 0, Math.PI * 2);
    this.context.stroke();
    this.context.fillStyle = '#f2bf5f';
    this.context.beginPath();
    this.context.arc(point.x, point.y, 6, 0, Math.PI * 2);
    this.context.fill();
  }

  private drawEntities(entities: RenderEntityV1[]): void {
    this.entityPositions = new Map(entities.map((entity) => [entity.entityId, { x: entity.x, y: entity.y }]));
    this.entityRenderCache = new Map(entities.map((entity) => [entity.entityId, { ...entity }]));
    const depth = (entity: RenderEntityV1) => entity.sortY + (entity.renderKind === 'projectile' ? 30 : 0);
    const ordered = [...entities].sort(
      (left, right) => depth(left) - depth(right) || left.entityId - right.entityId,
    );
    const now = Date.now();
    this.projectileTrailSpritesRemaining = PROJECTILE_TRAIL_SPRITE_BUDGET;
    for (const [entityId, reaction] of this.hitReactions) {
      if (now - reaction.startedAt >= reaction.duration) this.hitReactions.delete(entityId);
    }
    for (const entity of ordered) {
      this.context.save();
      this.context.translate(entity.x, entity.y);
      if (entity.renderKind === 'projectile') {
        this.context.rotate(u16ToRadians(entity.rotationU16));
        this.drawProjectile(entity, now);
      } else {
        this.drawEnemy(entity, now);
      }
      this.context.restore();
    }
  }

  private drawEnemy(entity: RenderEntityV1, now: number, suppressHealthBar = false): void {
    const visual = ENEMY_VISUALS[entity.assetId] ?? ENEMY_VISUALS.MON_TIDE_IMP;
    const isCrab = entity.assetId === 'MON_SHELL_CRAB';
    const isBoss = visual.role === 'boss';
    const isArmored = visual.role === 'armored' || isBoss;
    const isGuard = Boolean(visual.armorBadge && !isBoss);
    const isEel = visual.role === 'fast';
    const isEnraged = (entity.flags & ENEMY_FLAG_ENRAGED) !== 0;
    const isGuardAuraSource = (entity.flags & ENEMY_FLAG_GUARD_AURA) !== 0;
    const isGuarded = (entity.flags & ENEMY_FLAG_GUARDED) !== 0;
    const hasPhaseShell = (entity.flags & ENEMY_FLAG_PHASE_SHELL) !== 0;
    const isEthereal = (entity.flags & ENEMY_FLAG_ETHEREAL) !== 0;
    const bodyWidth = visual.width;
    const bodyHeight = visual.height;
    const basePhaseMs = isBoss ? 330 : isArmored ? 250 : isEel ? 145 : 190;
    const phase = now / (isEnraged ? basePhaseMs * .62 : basePhaseMs) + entity.entityId * 0.73;
    const bob = Math.sin(phase) * (isBoss ? 1.5 : isArmored ? 2 : isEel ? 3 : 4);
    const sway = Math.sin(phase * 0.72) * (isBoss ? 0.009 : isArmored ? 0.018 : isEel ? 0.048 : 0.025);
    const pulse = isArmored ? 1 : 1 + Math.sin(phase * 0.82) * 0.018;
    const scale = (entity.scaleBp / 10_000) * pulse;
    const routeAngle = u16ToRadians(entity.rotationU16);
    const laneOffset = isBoss ? 0 : ((entity.entityId % 3) - 1) * (isArmored ? 10 : 5);
    this.context.translate(-Math.sin(routeAngle) * laneOffset, Math.cos(routeAngle) * laneOffset);
    const hitReaction = this.hitReactions.get(entity.entityId);
    const reactionProgress = hitReaction
      ? Math.max(0, Math.min(1, (now - hitReaction.startedAt) / hitReaction.duration))
      : 1;
    const reactionPulse = hitReaction && reactionProgress < 1
      ? Math.sin(reactionProgress * Math.PI)
      : 0;
    if (reactionPulse > 0) {
      const direction = entity.entityId % 2 === 0 ? -1 : 1;
      this.context.translate(direction * reactionPulse * (hitReaction?.critical ? 7 : 4), 0);
    }

    if (isGuardAuraSource) {
      const auraPulse = .5 + Math.sin(now / 210 + entity.entityId) * .5;
      const auraRadius = isBoss ? bodyWidth * .72 : bodyWidth * .66;
      const aura = this.context.createRadialGradient(0, 14, 10, 0, 14, auraRadius);
      aura.addColorStop(0, `rgba(255, 220, 132, ${.18 + auraPulse * .08})`);
      aura.addColorStop(.68, `rgba(124, 239, 222, ${.1 + auraPulse * .05})`);
      aura.addColorStop(1, 'rgba(124, 239, 222, 0)');
      this.context.fillStyle = aura;
      this.context.beginPath();
      this.context.ellipse(0, 14, auraRadius, bodyHeight * .48, 0, 0, Math.PI * 2);
      this.context.fill();
      this.context.globalAlpha = .48 + auraPulse * .34;
      this.context.strokeStyle = '#f3cf78';
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.ellipse(0, bodyHeight * .3, bodyWidth * .44, bodyHeight * .13, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.globalAlpha = 1;
    }
    if (isGuarded) {
      const shieldPulse = .55 + Math.sin(now / 170 + entity.entityId) * .18;
      this.context.globalAlpha = shieldPulse;
      this.context.strokeStyle = '#96f0dc';
      this.context.lineWidth = 3;
      this.context.beginPath();
      this.context.ellipse(0, bodyHeight * .03, bodyWidth * .48, bodyHeight * .42, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.globalAlpha = 1;
    }
    if (hasPhaseShell) {
      const shellPulse = .5 + Math.sin(now / 185 + entity.entityId * .41) * .5;
      this.context.save();
      this.context.globalAlpha = .54 + shellPulse * .28;
      this.context.strokeStyle = '#f56cc8';
      this.context.lineWidth = isBoss ? 5 : 3;
      this.context.setLineDash(isBoss ? [18, 8] : [11, 7]);
      this.context.lineDashOffset = -now / 65;
      this.context.beginPath();
      this.context.ellipse(0, 8, bodyWidth * .53, bodyHeight * .47, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.strokeStyle = '#79ebba';
      this.context.lineWidth = 2;
      this.context.setLineDash(isBoss ? [5, 12] : [4, 9]);
      this.context.beginPath();
      this.context.ellipse(0, 8, bodyWidth * .58, bodyHeight * .51, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
    if (isEthereal) {
      const phasePulse = .5 + Math.sin(now / 155 + entity.entityId * .57) * .5;
      this.context.save();
      this.context.globalAlpha = .42 + phasePulse * .24;
      this.context.strokeStyle = '#ead8af';
      this.context.lineWidth = isBoss ? 5 : 3;
      this.context.setLineDash(isBoss ? [24, 10, 5, 10] : [14, 8, 4, 8]);
      this.context.lineDashOffset = now / 52;
      this.context.beginPath();
      this.context.ellipse(0, 7, bodyWidth * .55, bodyHeight * .48, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.strokeStyle = '#d45a49';
      this.context.lineWidth = 2;
      this.context.setLineDash(isBoss ? [7, 16] : [5, 12]);
      this.context.beginPath();
      this.context.ellipse(0, 7, bodyWidth * .61, bodyHeight * .53, 0, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }

    if (isBoss) {
      const aura = this.context.createRadialGradient(0, 20, 18, 0, 20, bodyWidth * .62);
      aura.addColorStop(0, isEnraged ? 'rgba(255, 86, 55, .35)' : visual.auraInner ?? 'rgba(85, 235, 225, .18)');
      aura.addColorStop(.7, isEnraged ? 'rgba(255, 133, 67, .16)' : visual.auraOuter ?? 'rgba(119, 80, 221, .10)');
      aura.addColorStop(1, 'rgba(119, 80, 221, 0)');
      this.context.fillStyle = aura;
      this.context.beginPath();
      this.context.ellipse(0, 20, bodyWidth * .62, bodyHeight * .44, 0, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.fillStyle = 'rgba(1, 7, 16, .52)';
    this.context.beginPath();
    this.context.ellipse(0, bodyHeight * .29, bodyWidth * .37, bodyHeight * .16, 0, 0, Math.PI * 2);
    this.context.fill();
    this.context.strokeStyle = isEnraged
      ? 'rgba(255, 112, 76, .78)'
      : isBoss
      ? 'rgba(159,119,244,.68)'
      : isArmored
        ? 'rgba(239,188,86,.42)'
        : 'rgba(78,225,222,.34)';
    this.context.lineWidth = 3;
    this.context.beginPath();
    this.context.ellipse(-bodyWidth * .08, bodyHeight * .31, bodyWidth * .31, bodyHeight * .1, 0, 0, Math.PI * 2);
    this.context.stroke();

    this.context.save();
    this.context.translate(0, bob);
    this.context.rotate((visual.followsRoute ? routeAngle : 0) + sway);
    this.context.scale(
      scale * (1 + reactionPulse * (hitReaction?.critical ? .075 : .045)),
      scale * (1 - reactionPulse * (hitReaction?.critical ? .065 : .04)),
    );
    if (reactionPulse > 0 && 'filter' in this.context) {
      this.context.filter = `brightness(${1 + reactionPulse * (hitReaction?.critical ? 1.2 : .75)}) saturate(${1 - reactionPulse * .24})`;
    }
    if (isEthereal) this.context.globalAlpha = .48;
    const image = this.images.get(entity.assetId);
    if (image) {
      const imageAspect = visual.sw / visual.sh;
      let width = bodyWidth;
      let height = width / imageAspect;
      if (height > bodyHeight) {
        height = bodyHeight;
        width = height * imageAspect;
      }
      this.context.drawImage(
        image,
        visual.sx,
        visual.sy,
        visual.sw,
        visual.sh,
        -width / 2,
        -height / 2 - 4,
        width,
        height,
      );
    } else {
      this.context.fillStyle = isBoss ? '#253f70' : isArmored ? '#d25b4f' : isEel ? '#42cfc8' : '#3ab4cf';
      this.context.strokeStyle = '#0b2238';
      this.context.lineWidth = 6;
      this.context.beginPath();
      this.context.ellipse(0, 0, bodyWidth * .42, bodyHeight * .38, 0, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
    }
    this.context.restore();

    if (visual.armorBadge) {
      this.context.fillStyle = isEnraged ? '#ef7953' : isBoss ? '#8b69dc' : '#d3a84f';
      this.context.strokeStyle = '#f7e5b4';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(bodyWidth * .38, -bodyHeight * .27, isBoss ? 19 : 15, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.text(isEnraged ? '狂' : '甲', bodyWidth * .38, -bodyHeight * .27 + 6, isBoss ? 18 : 14, '#071426', 'center', 850, 9);
    }

    if (isGuardAuraSource) {
      this.context.fillStyle = '#f0cc72';
      this.context.strokeStyle = '#fff1c4';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(-bodyWidth * .38, -bodyHeight * .27, isBoss ? 19 : 15, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.text('阵', -bodyWidth * .38, -bodyHeight * .27 + 6, isBoss ? 18 : 14, '#142237', 'center', 850, 9);
    }

    if (hasPhaseShell) {
      const badgeX = (visual.armorBadge ? -1 : 1) * bodyWidth * .38;
      this.context.fillStyle = '#e95db9';
      this.context.strokeStyle = '#bff9d9';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(badgeX, -bodyHeight * .27, isBoss ? 19 : 15, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.text('相', badgeX, -bodyHeight * .27 + 6, isBoss ? 18 : 14, '#171326', 'center', 850, 9);
    }

    if (isEthereal) {
      const badgeX = (visual.armorBadge || hasPhaseShell ? -1 : 1) * bodyWidth * .38;
      this.context.fillStyle = '#292221';
      this.context.strokeStyle = '#ead8af';
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.arc(badgeX, -bodyHeight * .27, isBoss ? 19 : 15, 0, Math.PI * 2);
      this.context.fill();
      this.context.stroke();
      this.text('虚', badgeX, -bodyHeight * .27 + 6, isBoss ? 18 : 14, '#e8b9a5', 'center', 850, 9);
    }

    if (suppressHealthBar || (entity.hpBp >= 9_995 && !isBoss)) return;
    const health = Math.max(0, Math.min(1, entity.hpBp / 10_000));
    const barWidth = isBoss ? 220 : isGuard ? 146 : isCrab ? 124 : isEel ? 108 : 96;
    const barY = -bodyHeight * .52 - 18 + bob;
    if (isBoss) {
      const baseBossName = hasPhaseShell
        ? (visual.displayName ?? '首领').replace('首领', '相壳')
        : visual.displayName ?? '首领';
      const bossName = isEthereal ? baseBossName.replace('首领', '虚相') : baseBossName;
      this.text(
        isEnraged ? bossName.replace('首领', '狂潮') : bossName,
        0,
        barY - 12,
        17,
        isEnraged ? '#ffb08a' : isEthereal ? '#efd5b1' : '#ead9ff',
        'center',
        750,
        10,
      );
    }
    this.context.fillStyle = 'rgba(2, 9, 22, .92)';
    this.context.strokeStyle = 'rgba(223,239,231,.38)';
    this.context.lineWidth = 2;
    this.roundRect(-barWidth / 2, barY, barWidth, 14, 7);
    this.context.fill();
    this.context.stroke();
    const fillWidth = Math.max(0, (barWidth - 8) * health);
    if (fillWidth > 0) {
      this.context.fillStyle = isEnraged ? '#ff7958' : health <= .22 ? '#ff6c63' : health <= .55 ? '#f0b955' : '#63e1a0';
      this.roundRect(-barWidth / 2 + 4, barY + 4, fillWidth, 6, 3);
      this.context.fill();
    }
  }

  private drawDeathGhosts(): void {
    const now = Date.now();
    this.deathGhosts = this.deathGhosts.filter((ghost) => {
      const age = now - ghost.startedAt;
      return age >= 0 && age < ghost.duration;
    });
    for (const ghost of this.deathGhosts) {
      const progress = Math.max(0, Math.min(1, (now - ghost.startedAt) / ghost.duration));
      const direction = ghost.entity.entityId % 2 === 0 ? -1 : 1;
      this.context.save();
      this.context.translate(
        ghost.entity.x + direction * progress * 16,
        ghost.entity.y - progress * 24,
      );
      this.context.rotate(direction * progress * .1);
      this.context.scale(1 + progress * .1, 1 - progress * .05);
      this.context.globalAlpha = Math.max(0, (1 - progress) * .76);
      this.drawEnemy(ghost.entity, now, true);
      this.context.restore();
    }
  }

  private drawProjectile(entity: RenderEntityV1, now: number): void {
    const critical = (entity.flags & PROJECTILE_FLAG_CRITICAL) !== 0;
    const focused = (entity.flags & PROJECTILE_FLAG_FOCUSED) !== 0;
    const penetrating = (entity.flags & PROJECTILE_FLAG_PENETRATION) !== 0;
    const towerId = (entity.flags & PROJECTILE_FLAG_TOWER_ID_MASK) >> PROJECTILE_FLAG_TOWER_ID_SHIFT;
    const palette = PROJECTILE_PALETTES[towerId] ?? PROJECTILE_PALETTES[1];
    const shimmer = .82 + Math.sin(now / 55 + entity.entityId) * .12;
    if (critical || focused) this.context.scale(critical ? 1.08 : 1.04, critical ? 1.08 : 1.04);

    const spriteTrail = this.images.get('VFX_ARROW_TRAIL');
    const shouldDrawSpriteTrail = this.projectileTrailSpritesRemaining > 0 && (
      critical || focused || penetrating || entity.entityId % 2 === 0
    );
    if (spriteTrail && shouldDrawSpriteTrail) {
      this.projectileTrailSpritesRemaining -= 1;
      const frame = (Math.floor(now / 52) + entity.entityId) % 8;
      this.context.save();
      this.context.globalAlpha = critical ? .56 : focused ? .5 : penetrating ? .44 : .28;
      this.context.drawImage(
        spriteTrail,
        frame * 128,
        0,
        128,
        128,
        -104,
        -42,
        112,
        84,
      );
      this.context.restore();
    }

    if (focused) {
      const focusPulse = .52 + Math.sin(now / 48 + entity.entityId) * .16;
      this.context.save();
      this.context.globalAlpha = focusPulse;
      this.context.strokeStyle = '#fff0a8';
      this.context.lineWidth = 10;
      this.context.lineCap = 'round';
      this.context.beginPath();
      this.context.moveTo(-30, 0);
      this.context.lineTo(38, 0);
      this.context.stroke();
      this.context.restore();
    }

    this.context.globalAlpha = shimmer;
    this.context.fillStyle = critical
      ? 'rgba(255,164,63,.24)'
      : focused
        ? 'rgba(255,224,125,.32)'
        : palette.trail;
    this.context.beginPath();
    this.context.moveTo(-72, 0);
    this.context.lineTo(-18, -8);
    this.context.lineTo(-8, 0);
    this.context.lineTo(-18, 8);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = critical ? 'rgba(255,232,147,.50)' : 'rgba(171,245,235,.42)';
    this.context.beginPath();
    this.context.moveTo(-56, 0);
    this.context.lineTo(-14, -3);
    this.context.lineTo(-5, 0);
    this.context.lineTo(-14, 3);
    this.context.closePath();
    this.context.fill();
    this.context.globalAlpha = 1;

    if (penetrating) {
      this.context.strokeStyle = 'rgba(82,235,229,.56)';
      this.context.lineCap = 'round';
      this.context.lineWidth = 13;
      this.context.beginPath();
      this.context.moveTo(-25, 0);
      this.context.lineTo(31, 0);
      this.context.stroke();
    }
    this.context.strokeStyle = '#07162a';
    this.context.lineCap = 'round';
    this.context.lineWidth = 9;
    this.context.beginPath();
    this.context.moveTo(-28, 0);
    this.context.lineTo(31, 0);
    this.context.stroke();
    this.context.strokeStyle = critical ? '#fff1bd' : '#f3ead2';
    this.context.lineWidth = 4;
    this.context.beginPath();
    this.context.moveTo(-28, 0);
    this.context.lineTo(31, 0);
    this.context.stroke();

    this.context.fillStyle = '#07162a';
    this.context.beginPath();
    this.context.moveTo(-34, 0);
    this.context.lineTo(-16, -13);
    this.context.lineTo(-11, -4);
    this.context.lineTo(-20, 0);
    this.context.lineTo(-11, 4);
    this.context.lineTo(-16, 13);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = palette.feather;
    this.context.beginPath();
    this.context.moveTo(-31, 0);
    this.context.lineTo(-17, -9);
    this.context.lineTo(-13, -3);
    this.context.lineTo(-21, 0);
    this.context.lineTo(-13, 3);
    this.context.lineTo(-17, 9);
    this.context.closePath();
    this.context.fill();

    this.context.fillStyle = '#09172a';
    this.context.beginPath();
    this.context.moveTo(25, -13);
    this.context.lineTo(50, 0);
    this.context.lineTo(25, 13);
    this.context.lineTo(31, 0);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = critical ? '#ffad45' : '#e5aa43';
    this.context.beginPath();
    this.context.moveTo(28, -9);
    this.context.lineTo(47, 0);
    this.context.lineTo(31, 0);
    this.context.closePath();
    this.context.fill();
    this.context.fillStyle = critical ? '#fff0a8' : '#ffd77b';
    this.context.beginPath();
    this.context.moveTo(31, 0);
    this.context.lineTo(47, 0);
    this.context.lineTo(28, 9);
    this.context.closePath();
    this.context.fill();
  }

  private drawEffects(): void {
    const now = Date.now();
    this.effects = this.effects.filter((effect) => now - effect.startedAt < effect.duration);
    for (const effect of this.effects) {
      const age = now - effect.startedAt;
      if (age < 0) continue;
      const progress = Math.max(0, Math.min(1, age / effect.duration));
      if (effect.kind === 'muzzle') {
        const size = effect.size ?? 48;
        this.context.save();
        this.context.translate(effect.x, effect.y);
        this.context.rotate(u16ToRadians(effect.rotationU16 ?? 0));
        this.context.globalAlpha = (1 - progress) * .9;
        this.context.strokeStyle = effect.color;
        this.context.lineCap = 'round';
        for (let ray = -2; ray <= 2; ray += 1) {
          const spread = ray * .18;
          const length = size * (1 - Math.abs(ray) * .1) * (1 - progress * .28);
          this.context.lineWidth = ray === 0 ? 7 : 3;
          this.context.beginPath();
          this.context.moveTo(2, ray * 3);
          this.context.lineTo(Math.cos(spread) * length, Math.sin(spread) * length);
          this.context.stroke();
        }
        this.context.restore();
        continue;
      }
      if (effect.kind === 'sprite' && effect.assetId) {
        const image = this.images.get(effect.assetId);
        if (image) {
          const frameCount = 8;
          const frame = Math.max(0, Math.min(frameCount - 1, Math.floor(progress * frameCount)));
          const sourceWidth = 128;
          const size = effect.size ?? 96;
          this.context.save();
          this.context.globalAlpha = Math.min(1, (1 - progress) * 2.6);
          this.context.translate(effect.x, effect.y);
          this.context.rotate(u16ToRadians(effect.rotationU16 ?? 0));
          this.context.drawImage(
            image,
            frame * sourceWidth,
            0,
            sourceWidth,
            128,
            -size / 2,
            -size / 2,
            size,
            size,
          );
          this.context.restore();
          continue;
        }
      }
      const radius = effect.kind === 'revive' ? 42 + progress * 120 : 18 + progress * 58;
      this.context.save();
      this.context.globalAlpha = 1 - progress;
      this.context.strokeStyle = effect.color;
      this.context.lineWidth = effect.kind === 'revive' ? 10 : 6;
      this.context.beginPath();
      this.context.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      this.context.stroke();
      if (effect.kind === 'burst') {
        for (let index = 0; index < 8; index += 1) {
          const angle = (index / 8) * Math.PI * 2;
          this.context.beginPath();
          this.context.moveTo(effect.x + Math.cos(angle) * 10, effect.y + Math.sin(angle) * 10);
          this.context.lineTo(effect.x + Math.cos(angle) * radius, effect.y + Math.sin(angle) * radius);
          this.context.stroke();
        }
      }
      this.context.restore();
    }
  }

  private drawLoopingVfx(
    assetId: string,
    x: number,
    y: number,
    size: number,
    alpha = .72,
  ): void {
    const image = this.images.get(assetId);
    if (!image) return;
    const frame = Math.floor(Date.now() / 82) % 8;
    this.context.save();
    this.context.globalAlpha = alpha;
    this.context.drawImage(
      image,
      frame * 128,
      0,
      128,
      128,
      x - size / 2,
      y - size / 2,
      size,
      size,
    );
    this.context.restore();
  }

  private resolveCameraOffset(now = Date.now()): DesignPoint {
    this.cameraImpulses = this.cameraImpulses.filter((impulse) => {
      const age = now - impulse.startedAt;
      return age >= 0 && age < impulse.duration;
    });
    let x = 0;
    let y = 0;
    for (const impulse of this.cameraImpulses) {
      const progress = Math.max(0, Math.min(1, (now - impulse.startedAt) / impulse.duration));
      const decay = (1 - progress) * (1 - progress);
      const phase = progress * Math.PI * 7;
      x += Math.sin(phase + (impulse.seed % 17)) * impulse.amplitude * decay;
      y += Math.cos(phase * 1.27 + (impulse.seed % 23)) * impulse.amplitude * .72 * decay;
    }
    return {
      x: Math.max(-7, Math.min(7, x)),
      y: Math.max(-5, Math.min(5, y)),
    };
  }

  private drawFloatingDamageTexts(): void {
    const now = Date.now();
    this.floatingDamageTexts = this.floatingDamageTexts.filter(
      (item) => now - item.startedAt < item.duration,
    );
    for (const item of this.floatingDamageTexts) {
      const progress = Math.max(0, Math.min(1, (now - item.startedAt) / item.duration));
      const rise = 20 + progress * (item.critical ? 86 : 68);
      const jitter = ((item.entityId * 17 + item.towerId * 23) % 7 - 3) * 7;
      const mitigationLabel = item.mitigation === 'phase-shell'
        ? '壳'
        : item.mitigation === 'ethereal'
          ? '虚'
          : item.mitigation === 'guard-aura'
            ? '阵'
            : item.mitigation === 'armor'
              ? '甲'
              : '';
      const hitLabels = [item.critical ? '暴' : '', item.penetrating ? '穿' : '', mitigationLabel]
        .filter(Boolean)
        .join('·');
      const prefix = hitLabels ? `${hitLabels} ` : '';
      const suffix = item.hitCount > 1 ? ` ×${item.hitCount}` : '';
      const label = `${prefix}${item.damageMilli > 0 ? '-' : ''}${preciseDamage(item.damageMilli)}${suffix}`;
      const size = this.resolveFontSize(item.critical ? 32 : item.penetrating ? 23 : 27, 9);
      const fadeIn = Math.min(1, progress * 7);
      const fadeOut = Math.min(1, (1 - progress) * 3.2);
      this.context.save();
      this.context.globalAlpha = fadeIn * fadeOut;
      this.context.font = `bold ${size}px ${CARD_NUMBER_FONT}`;
      this.context.textAlign = 'center';
      this.context.textBaseline = 'alphabetic';
      this.context.lineJoin = 'round';
      this.context.lineWidth = Math.max(3, size * .15);
      this.context.strokeStyle = 'rgba(1, 8, 18, .92)';
      this.context.fillStyle = item.critical
        ? '#ffd36d'
        : item.penetrating
          ? PROJECTILE_PALETTES[item.towerId]?.feather ?? '#72ead5'
          : '#edf8ef';
      this.context.strokeText(label, item.x + jitter, item.y - rise);
      this.context.fillText(label, item.x + jitter, item.y - rise);
      this.context.restore();
    }
  }

  private drawCombatCallouts(): void {
    const now = Date.now();
    this.combatCallouts = this.combatCallouts.filter((callout) => {
      const age = now - callout.startedAt;
      return age >= 0 && age < callout.duration;
    });
    for (const callout of this.combatCallouts) {
      const progress = Math.max(0, Math.min(1, (now - callout.startedAt) / callout.duration));
      const scale = .82 + Math.min(1, progress * 6) * .22;
      const fade = Math.min(1, progress * 7) * Math.min(1, (1 - progress) * 3.5);
      this.context.save();
      this.context.translate(callout.x, callout.y - 96 - progress * 44);
      this.context.scale(scale, scale);
      this.context.globalAlpha = fade;
      this.context.font = `800 ${this.resolveFontSize(34, 11)}px ${CARD_SERIF_FONT}`;
      this.context.textAlign = 'center';
      this.context.textBaseline = 'middle';
      this.context.lineJoin = 'round';
      this.context.lineWidth = 8;
      this.context.strokeStyle = 'rgba(2, 8, 18, .9)';
      this.context.fillStyle = callout.color;
      this.context.strokeText(callout.text, 0, 0);
      this.context.fillText(callout.text, 0, 0);
      this.context.restore();
    }
  }

  private drawHud(
    hud: HudProjectionV1,
    muted: boolean,
    selectedTowerId: TowerId,
    towerMetrics: TowerMetricRenderState[],
  ): void {
    const theme = BATTLE_STAGE_THEME[this.bundle.stage.id];
    const endlessHud = resolveEndlessHud(hud);

    this.drawButton('hud-back', 28, 28, 78, 78, '‹', 'rgba(6,20,40,.88)', '#f2dfb4', theme.accent);
    this.context.fillStyle = 'rgba(6, 20, 40, .88)';
    this.context.lineWidth = 2;
    this.roundRect(122, 28, 330, 78, 14);
    this.context.fill();
    this.context.save();
    this.context.globalAlpha = .48;
    this.context.strokeStyle = theme.accent;
    this.context.stroke();
    this.context.restore();
    this.text(
      endlessHud
        ? `无尽挑战 · ${formatEndlessRoute(endlessHud.routeId ?? this.bundle.route.id)}`
        : HOME_STAGE_META[this.bundle.stage.id].hudLabel,
      148,
      59,
      17,
      theme.accent,
      'left',
      600,
    );
    this.text(this.bundle.stage.name, 148, 91, 27, '#f2ead3', 'left', 700);

    if (!endlessHud) {
      const gateRatio = hud.gateIntegrityMax > 0
        ? Math.max(0, Math.min(1, hud.gateIntegrity / hud.gateIntegrityMax))
        : 0;
      const gateColor = gateRatio <= .25 ? '#ff766d' : gateRatio <= .55 ? '#f0b95a' : '#72dca2';
      const gateFlashAge = Date.now() - this.gateDamageFlashStartedAt;
      const gateFlash = gateFlashAge >= 0 && gateFlashAge < 620
        ? (1 - gateFlashAge / 620) * (.78 + Math.sin(gateFlashAge / 42) * .22)
        : 0;
      this.context.fillStyle = gateFlash > 0
        ? `rgba(82, 18, 27, ${.72 + gateFlash * .2})`
        : 'rgba(6, 20, 40, .88)';
      this.context.strokeStyle = gateFlash > 0 ? '#ff766d' : `${gateColor}70`;
      this.context.lineWidth = gateFlash > 0 ? 3 : 2;
      this.roundRect(480, 28, 270, 78, 16);
      this.context.fill();
      this.context.stroke();
      this.fitText(
        '关门耐久',
        502,
        57,
        112,
        15,
        'rgba(226,239,233,.68)',
        'left',
        650,
        8,
      );
      this.fitText(
        `${Math.max(0, hud.gateIntegrity)} / ${Math.max(1, hud.gateIntegrityMax)}`,
        728,
        58,
        96,
        19,
        gateColor,
        'right',
        760,
        10,
        CARD_NUMBER_FONT,
      );
      this.progressBar(502, 76, 226, 10, gateRatio, gateColor);
    }

    this.context.fillStyle = 'rgba(6, 20, 40, .9)';
    this.roundRect(780, 22, 360, 100, 24);
    this.context.fill();
    this.context.save();
    this.context.globalAlpha = .62;
    this.context.strokeStyle = theme.secondary;
    this.context.stroke();
    this.context.restore();
    if (endlessHud) {
      this.drawEndlessHudProgress(hud, endlessHud, theme);
    } else {
      const currentWave = this.bundle.waves[Math.max(0, hud.waveIndex - 1)];
      const speedMultiplierBp = currentWave?.speedMultiplierBp ?? 10_000;
      const waveLabel = speedMultiplierBp > 10_000
        ? `疾潮 +${Math.round((speedMultiplierBp - 10_000) / 100)}%`
        : '敌潮';
      this.text(waveLabel, 825, 61, 18, theme.accent, 'left', 650);
      this.text(`${Math.max(1, hud.waveIndex)} / ${hud.waveCount}`, 1085, 67, 30, '#f4dfad', 'right', 750);
      this.progressBar(825, 84, 270, 10, hud.progressBp / 10_000, theme.secondary);
    }

    const controlsRight = this.resolveHudControlsRight();
    this.drawButton('hud-speed', controlsRight - 302, 28, 92, 78, `${hud.speed}×`, 'rgba(6,20,40,.9)', '#f2e8cd', '#5b7384');
    this.drawButton(
      'hud-pause',
      controlsRight - 197,
      28,
      92,
      78,
      hud.flowState === 'paused' ? '▶' : 'Ⅱ',
      'rgba(6,20,40,.9)',
      '#f2e8cd',
      '#5b7384',
    );
    this.drawButton('hud-mute', controlsRight - 92, 28, 92, 78, muted ? '音效关' : '音效', 'rgba(6,20,40,.9)', '#f2e8cd', '#5b7384');

    const showOverdrive = hud.mode === 'fixed' && hud.overdrive.durationTicks > 0;
    const expPanelWidth = 318;
    const expRight = 42 + expPanelWidth - 28;
    const expBarWidth = expPanelWidth - 192;
    const warPointsFlashAge = Date.now() - this.warPointsFlashStartedAt;
    const warPointsFlash = warPointsFlashAge >= 0 && warPointsFlashAge < 520
      ? (1 - warPointsFlashAge / 520) * (.72 + Math.sin(warPointsFlashAge / 55) * .18)
      : 0;
    this.context.fillStyle = !endlessHud && (hud.shopAvailable || warPointsFlash > 0)
      ? `rgba(34, 67, 63, ${.78 + Math.max(warPointsFlash, .08) * .14})`
      : 'rgba(4, 17, 34, .9)';
    this.roundRect(42, 918, expPanelWidth, 122, 24);
    this.context.fill();
    this.context.save();
    this.context.globalAlpha = !endlessHud && hud.shopAvailable ? .72 + warPointsFlash * .28 : .44;
    this.context.strokeStyle = !endlessHud && warPointsFlash > 0 ? '#ffd36d' : theme.accent;
    this.context.lineWidth = !endlessHud && hud.shopAvailable ? 3 : 2;
    this.context.stroke();
    this.context.restore();
    if (!endlessHud) {
      const warSealX = 92;
      const warTextX = 138;
      const warTextRight = 212;
      const shopStatusX = 222;
      const shopStatusWidth = 120;
      this.drawSeal(warSealX, 978, 34, '功', '#163947', hud.shopAvailable ? '#ffd36d' : theme.accent);
      this.text('可用战功', warTextX, 949, 14, 'rgba(224,240,234,.66)', 'left', 600, 9);
      this.fitText(
        String(Math.max(0, hud.warPointsBalance)),
        warTextX,
        987,
        warTextRight - warTextX,
        31,
        '#f5d47d',
        'left',
        780,
        13,
        CARD_NUMBER_FONT,
      );
      if (warPointsFlash > 0 && this.warPointsFlashAmount > 0) {
        this.fitText(
          `+${this.warPointsFlashAmount}`,
          warTextRight,
          968 - Math.min(8, warPointsFlashAge / 42),
          58,
          16,
          '#8ff0d5',
          'right',
          760,
          9,
          CARD_NUMBER_FONT,
        );
      }
      const shopStatus = hud.shopAvailable
        ? hud.shopPurchasesThisWave > 0
          ? `本波 ${hud.shopPurchasesThisWave}/${hud.shopPurchaseLimitPerWave} · 继续兑换  ›`
          : '兑换法门 / 增援  ›'
        : hud.shopPurchasedThisWave
          ? `本波已兑 ${hud.shopPurchaseLimitPerWave} 次 · 下波刷新`
          : '击杀积攒 · 商店筹备中';
      this.context.fillStyle = hud.shopAvailable
        ? 'rgba(122, 93, 31, .25)'
        : 'rgba(105, 131, 134, .10)';
      this.context.strokeStyle = hud.shopAvailable
        ? 'rgba(255, 211, 109, .34)'
        : 'rgba(143, 177, 177, .18)';
      this.context.lineWidth = 1;
      this.roundRect(shopStatusX, 946, shopStatusWidth, 50, 12);
      this.context.fill();
      this.context.stroke();
      this.wrapText(
        shopStatus,
        shopStatusX + shopStatusWidth / 2,
        965,
        shopStatusWidth - 14,
        18,
        13,
        hud.shopAvailable ? '#ffd36d' : 'rgba(223,237,232,.56)',
        650,
        8,
        2,
        CARD_BODY_FONT,
      );
      this.fitText(
        `累计 ${Math.max(0, hud.warPointsEarned)} · 境界 ${hud.level}  ${hud.exp}/${hud.expRequired}`,
        warTextX,
        1021,
        expRight - warTextX,
        13,
        'rgba(220,235,230,.48)',
        'left',
        560,
        8,
        CARD_NUMBER_FONT,
      );
      if (
        hud.shopAvailable &&
        (hud.flowState === 'running' || hud.flowState === 'paused' || hud.flowState === 'performance-paused')
      ) {
        this.interactions.push({
          id: 'hud-shop',
          x: 42,
          y: BATTLE_BOTTOM_HUD_TOP,
          width: expPanelWidth,
          height: 122,
        });
      }
    } else {
      this.drawSeal(104, 978, 43, String(hud.level));
      this.text('境界', 164, 962, 17, theme.accent, 'left', 600);
      this.text(`${hud.exp} / ${hud.expRequired}`, expRight, 972, 20, '#f2e8ce', 'right', 600);
      this.progressBar(164, 992, expBarWidth, 13, hud.expRequired ? hud.exp / hud.expRequired : 0, theme.accent);
    }

    if (showOverdrive) {
      const overdriveX = 374;
      const overdriveWidth = 216;
      const overdrive = hud.overdrive;
      const active = overdrive.activeTowerId !== null && overdrive.remainingTicks > 0;
      const accent = active
        ? PROJECTILE_PALETTES[overdrive.activeTowerId ?? selectedTowerId]?.feather ?? '#ffd36d'
        : PROJECTILE_PALETTES[selectedTowerId]?.feather ?? '#ffd36d';
      const readyPulse = overdrive.ready ? .78 + Math.sin(Date.now() / 110) * .18 : .42;
      this.context.fillStyle = overdrive.ready || active
        ? `${accent}28`
        : 'rgba(4, 17, 34, .9)';
      this.context.strokeStyle = overdrive.ready || active ? accent : 'rgba(105,146,153,.34)';
      this.context.globalAlpha = readyPulse;
      this.context.lineWidth = overdrive.ready ? 3 : 2;
      this.roundRect(overdriveX, 918, overdriveWidth, 122, 24);
      this.context.fill();
      this.context.stroke();
      this.context.globalAlpha = 1;
      const activeSeconds = Math.max(0, overdrive.remainingTicks / TICKS_PER_SECOND);
      const overdriveLabel = active
        ? `${(overdrive.activeTowerId ?? 0) + 1} 号塔 · ${activeSeconds.toFixed(1)}s`
        : overdrive.ready
          ? `${selectedTowerId + 1} 号塔 · 点按爆发`
          : '集火积攒战意';
      this.text('镇海战意', overdriveX + 20, 952, 16, accent, 'left', 720, 9);
      this.text(overdriveLabel, overdriveX + 20, 982, 16, '#eef2e8', 'left', 650, 9);
      const overdriveProgress = active && overdrive.durationTicks > 0
        ? overdrive.remainingTicks / overdrive.durationTicks
        : overdrive.maxCharge > 0
          ? overdrive.charge / overdrive.maxCharge
          : 0;
      this.progressBar(overdriveX + 20, 1003, overdriveWidth - 40, 12, overdriveProgress, accent);
      if (overdrive.ready && !active && hud.flowState === 'running') {
        this.interactions.push({
          id: 'hud-overdrive',
          x: overdriveX,
          y: 918,
          width: overdriveWidth,
          height: 122,
        });
      }
    }

    const damageX = BATTLE_BOTTOM_HUD_RIGHT_LEFT;
    const damageWidth = 368;
    this.context.fillStyle = 'rgba(4, 17, 34, .9)';
    this.context.strokeStyle = 'rgba(116, 223, 219, .34)';
    this.roundRect(damageX, 918, damageWidth, 122, 22);
    this.context.fill();
    this.context.stroke();
    const recentDpsMilli = towerMetrics.reduce((sum, metric) => sum + metric.damageLast1sMilli, 0);
    this.text(`${this.activeTowerIds.size} 塔战策 · 已选 ${selectedTowerId + 1} 号`, damageX + 20, 945, 15, theme.accent, 'left', 700, 8);
    this.text('详情  ›', damageX + damageWidth - 18, 945, 15, theme.accent, 'right', 700, 8);
    this.text('累计伤害', damageX + 20, 977, 13, 'rgba(230,240,237,.52)', 'left', 550, 8);
    this.text(compactDamage(hud.damageDealtMilli), damageX + 20, 1011, 26, theme.secondary, 'left', 760, 10, CARD_NUMBER_FONT);
    this.text('近 1 秒 DPS', damageX + damageWidth - 20, 977, 13, 'rgba(230,240,237,.52)', 'right', 550, 8);
    this.text(compactDamage(recentDpsMilli), damageX + damageWidth - 20, 1011, 26, '#72ead5', 'right', 760, 10, CARD_NUMBER_FONT);
    this.interactions.push({
      id: 'hud-strategy',
      x: damageX,
      y: BATTLE_BOTTOM_HUD_TOP,
      width: damageWidth,
      height: 122,
    });
  }

  private drawEndlessHudProgress(
    hud: HudProjectionV1,
    endless: EndlessHudProjectionLike,
    theme: BattleStageTheme,
  ): void {
    if (endless.phase === 'survival') {
      const currentTick = Math.min(endless.survivalTick, endless.survivalEndTick);
      this.text(`威胁等级 ${Math.max(1, endless.threatTier)}`, 810, 57, 17, theme.accent, 'left', 680, 9);
      this.text(
        `${formatTicks(currentTick)} / ${formatTicks(endless.survivalEndTick)}`,
        1110,
        60,
        22,
        '#f4dfad',
        'right',
        760,
        10,
        CARD_NUMBER_FONT,
      );
      this.progressBar(
        810,
        76,
        300,
        9,
        endless.survivalEndTick > 0 ? currentTick / endless.survivalEndTick : 0,
        theme.secondary,
      );
      const countdowns: string[] = [];
      if (endless.nextThreatTick !== undefined && endless.nextThreatTick >= hud.tick) {
        countdowns.push(`下次威胁 ${formatTicks(endless.nextThreatTick - hud.tick)}`);
      }
      if (endless.nextEliteTick !== undefined && endless.nextEliteTick >= hud.tick) {
        countdowns.push(`小首领 ${formatTicks(endless.nextEliteTick - hud.tick)}`);
      }
      this.text(
        countdowns.join(' · ') || '威胁包持续生成',
        960,
        108,
        countdowns.length > 1 ? 12 : 13,
        'rgba(226,239,233,.62)',
        'center',
        580,
        8,
        CARD_NUMBER_FONT,
      );
      return;
    }

    const remainingTick = Math.max(0, endless.hardEndTick - hud.tick);
    const bossRatio = endless.bossHpBp !== undefined
      ? endless.bossHpBp / 10_000
      : endless.bossHpMilli !== undefined && endless.bossMaxHpMilli
        ? endless.bossHpMilli / endless.bossMaxHpMilli
        : 0;
    const safeBossRatio = Math.max(0, Math.min(1, bossRatio));
    this.text(
      `深渊龙王 · 第 ${Math.max(1, endless.bossLayer)} 层`,
      810,
      57,
      17,
      '#b6a5ff',
      'left',
      720,
      9,
    );
    this.text(
      `剩余 ${formatTicks(remainingTick)}`,
      1110,
      60,
      20,
      '#f4dfad',
      'right',
      760,
      10,
      CARD_NUMBER_FONT,
    );
    this.progressBar(810, 76, 300, 10, safeBossRatio, '#9d77f2');
    this.text(
      `生命 ${Math.round(safeBossRatio * 100)}% · 累计实伤 ${compactDamage(endless.bossDamageMilli)}`,
      960,
      108,
      13,
      '#71e6d9',
      'center',
      680,
      8,
      CARD_NUMBER_FONT,
    );
  }

  private resolveTowerStats(hud: HudProjectionV1): TowerStatsProjectionLike {
    const projected = (hud as HudProjectionWithTowerData).towerStats;
    if (projected?.base && projected.afterLevel && projected.current) return projected;
    const base = fallbackEffectiveStats(this.bundle);
    return {
      base,
      afterLevel: cloneEffectiveStats(base),
      current: cloneEffectiveStats(base),
    };
  }

  private resolveHudControlsRight(): number {
    const size = this.runtime.size();
    const gapPx = 12;
    let screenRight = Math.min(size.width, size.safeArea.right) - gapPx;
    const menu = size.menuButtonRect;
    const hudTop = this.offsetY + 20 * this.scale;
    const hudBottom = this.offsetY + 114 * this.scale;
    if (menu && menu.bottom >= hudTop && menu.top <= hudBottom) {
      screenRight = Math.min(screenRight, menu.left - gapPx);
    }
    const designRight = (screenRight - this.offsetX) / this.scale;
    return Math.max(1_450, Math.min(1_872, designRight));
  }

  private drawCardOverlay(
    cardIds: [string, string, string],
    hud: HudProjectionV1,
    rerollsRemaining?: number,
    selectedCardId?: string,
  ): void {
    this.drawModalShade();
    const fixedShop = hud.mode === 'fixed';
    const contentLayout = resolveCardOverlayContentLayout(this.scale);
    const typography = contentLayout.typography;
    this.text(
      fixedShop ? `战功商店 · 可用 ${Math.max(0, hud.warPointsBalance)}` : '境界突破',
      960,
      108,
      typography.eyebrow,
      fixedShop ? '#f0ca72' : '#74dfdb',
      'center',
      650,
      0,
      CARD_BODY_FONT,
    );
    this.text(
      fixedShop ? '选择本波增援' : '择一法门，守住关城',
      960,
      164,
      typography.heading,
      '#f4e6c4',
      'center',
      700,
      0,
      CARD_SERIF_FONT,
    );
    this.text(
      fixedShop
        ? `技能对当前及后续箭塔生效 · 每波最多兑换 ${hud.shopPurchaseLimitPerWave} 次`
        : '强化会立即作用于三座箭塔',
      960,
      210,
      typography.subtitle,
      'rgba(231,241,237,.72)',
      'center',
      400,
      0,
      CARD_BODY_FONT,
    );
    const { cardWidth, cardHeight, cardY, starts } = resolveCardOverlayLayout(this.viewport);
    const towerStats = this.resolveTowerStats(hud);
    const projectedPreviews = (hud as HudProjectionWithTowerData).offerPreviews
      ?? (hud as HudProjectionWithTowerData).activeOfferPreviews
      ?? [];
    cardIds.forEach((cardId, index) => {
      const card = this.cardsById.get(cardId);
      if (!card) return;
      const x = starts[index] ?? 230;
      const color = QUALITY_COLOR[card.quality];
      const preview = projectedPreviews.find((candidate) => candidate.cardId === cardId)
        ?? fallbackCardPreview(card, towerStats.current);
      const previewUnchanged = cardPreviewIsUnchanged(card, preview);
      const metricPresentation = cardMetricPresentation(card, preview);
      const warPointCost = preview.warPointCost ?? card.warPointCost ?? 0;
      const selected = fixedShop && selectedCardId === cardId;
      const affordable = !fixedShop || warPointCost <= hud.warPointsBalance;
      const disabled = fixedShop && (!affordable || (preview.capped && previewUnchanged));

      const cardBackground = this.context.createLinearGradient(x, cardY, x + cardWidth, cardY + cardHeight);
      cardBackground.addColorStop(0, disabled ? 'rgba(74, 84, 90, .13)' : `${color}${selected ? '2e' : '18'}`);
      cardBackground.addColorStop(.32, disabled ? 'rgba(10, 21, 31, .96)' : 'rgba(7, 24, 43, .98)');
      cardBackground.addColorStop(1, 'rgba(3, 14, 29, .99)');
      this.context.save();
      this.context.shadowColor = disabled ? 'rgba(0,0,0,0)' : `${color}${selected ? '66' : '24'}`;
      this.context.shadowBlur = selected ? 22 : 10;
      this.context.fillStyle = cardBackground;
      this.context.strokeStyle = disabled ? 'rgba(128, 145, 150, .38)' : selected ? color : `${color}b8`;
      this.context.lineWidth = selected ? 3.5 : 2;
      this.roundRect(x, cardY, cardWidth, cardHeight, 24);
      this.context.fill();
      this.context.stroke();
      this.context.restore();

      this.context.strokeStyle = disabled ? 'rgba(138,151,154,.22)' : `${color}${selected ? '52' : '32'}`;
      this.context.lineWidth = 1;
      this.roundRect(x + 11, cardY + 11, cardWidth - 22, cardHeight - 22, 17);
      this.context.stroke();

      this.text(
        `0${index + 1}`,
        x + contentLayout.metaSideInset,
        cardY + contentLayout.metaTop + contentLayout.metaHeight / 2,
        typography.meta,
        'rgba(235,241,232,.48)',
        'left',
        600,
        0,
        CARD_NUMBER_FONT,
        'middle',
      );
      this.pill(
        x + cardWidth - contentLayout.metaSideInset - contentLayout.qualityPillWidth,
        cardY + contentLayout.metaTop,
        contentLayout.qualityPillWidth,
        contentLayout.metaHeight,
        QUALITY_NAME[card.quality],
        `${color}18`,
        disabled ? 'rgba(189,199,198,.54)' : color,
        typography.meta,
      );
      if (fixedShop) {
        this.pill(
          x + (cardWidth - contentLayout.costPillWidth) / 2,
          cardY + contentLayout.metaTop,
          contentLayout.costPillWidth,
          contentLayout.metaHeight,
          `${warPointCost} 战功`,
          affordable ? 'rgba(98, 76, 28, .54)' : 'rgba(77, 42, 45, .60)',
          affordable ? '#f6d379' : '#ff9c91',
          typography.meta,
        );
      }

      const iconCenterY = cardY + contentLayout.iconTop + contentLayout.iconSize / 2;
      const iconGlow = this.context.createRadialGradient(
        x + cardWidth / 2,
        iconCenterY,
        8,
        x + cardWidth / 2,
        iconCenterY,
        66,
      );
      iconGlow.addColorStop(0, `${color}${disabled ? '18' : '32'}`);
      iconGlow.addColorStop(1, `${color}00`);
      this.context.fillStyle = iconGlow;
      this.context.beginPath();
      this.context.arc(x + cardWidth / 2, iconCenterY, 66, 0, Math.PI * 2);
      this.context.fill();

      const icon = this.images.get(card.iconAssetId);
      if (icon) {
        this.context.globalAlpha = disabled ? .56 : 1;
        this.context.drawImage(
          icon,
          x + (cardWidth - contentLayout.iconSize) / 2,
          cardY + contentLayout.iconTop,
          contentLayout.iconSize,
          contentLayout.iconSize,
        );
        this.context.globalAlpha = 1;
      } else {
        this.drawSeal(
          x + cardWidth / 2,
          iconCenterY,
          contentLayout.iconSize / 2,
          card.effectId === 'tower-count' ? '塔' : '法',
        );
      }

      this.fitText(
        card.name,
        x + cardWidth / 2,
        cardY + contentLayout.titleBaseline,
        cardWidth - 64,
        typography.title,
        disabled ? 'rgba(224,221,209,.62)' : '#f4ead3',
        'center',
        700,
        0,
        CARD_SERIF_FONT,
      );

      const rule = this.context.createLinearGradient(x + 70, 0, x + cardWidth - 70, 0);
      rule.addColorStop(0, `${color}00`);
      rule.addColorStop(.5, `${color}${disabled ? '32' : '7a'}`);
      rule.addColorStop(1, `${color}00`);
      this.context.fillStyle = rule;
      this.context.fillRect(x + 70, cardY + contentLayout.dividerY, cardWidth - 140, 1.5);

      const secondaryColor = disabled
        ? 'rgba(190,202,199,.48)'
        : preview.capped
          ? '#ffbf7a'
          : 'rgba(225,239,233,.78)';
      this.drawCardMetricPanel(
        x + 24,
        cardY,
        cardWidth - 48,
        metricPresentation,
        color,
        secondaryColor,
        disabled,
        contentLayout,
        fixedShop ? '兑换后' : '选择后',
      );

      const choiceWidth = cardWidth - 48;
      const choiceHeight = contentLayout.actionHeight;
      const choiceX = x + 24;
      const choiceY = cardY + contentLayout.actionTop;
      this.context.fillStyle = disabled ? 'rgba(120,130,132,.08)' : selected ? `${color}38` : `${color}18`;
      this.context.strokeStyle = disabled ? 'rgba(140,150,151,.28)' : selected ? color : `${color}70`;
      this.context.lineWidth = selected ? 2 : 1.25;
      this.roundRect(choiceX, choiceY, choiceWidth, choiceHeight, choiceHeight / 2);
      this.context.fill();
      this.context.stroke();
      const choiceLabel = fixedShop
        ? !affordable
          ? `还差 ${Math.max(0, warPointCost - hud.warPointsBalance)} 战功`
          : preview.capped && previewUnchanged
            ? '已达上限'
            : selected
              ? '已选择'
              : '选择'
        : '选择此法门';
      this.fitText(
        choiceLabel,
        choiceX + choiceWidth / 2,
        choiceY + choiceHeight / 2,
        choiceWidth - 36,
        typography.action,
        disabled ? 'rgba(194,204,201,.46)' : color,
        'center',
        650,
        0,
        CARD_BODY_FONT,
        'middle',
      );
      if (!disabled) {
        this.interactions.push({ id: `card:${card.id}`, x, y: cardY, width: cardWidth, height: cardHeight });
      }
    });

    if (fixedShop) {
      this.drawButton(
        'shop-close',
        568,
        858,
        300,
        68,
        '暂不兑换',
        'rgba(8,28,46,.88)',
        'rgba(235,240,228,.82)',
        'rgba(118,151,160,.42)',
        23,
        14,
      );
      const selectedCard = selectedCardId ? this.cardsById.get(selectedCardId) : undefined;
      const selectedPreview = selectedCardId
        ? projectedPreviews.find((candidate) => candidate.cardId === selectedCardId)
        : undefined;
      const selectedCost = selectedPreview?.warPointCost ?? selectedCard?.warPointCost;
      const confirmEnabled = selectedCard !== undefined &&
        selectedCost !== undefined &&
        selectedCost <= hud.warPointsBalance &&
        !(selectedPreview?.capped && cardPreviewIsUnchanged(selectedCard, selectedPreview));
      const confirmLabel = selectedCost === undefined
        ? '先选择一项增援'
        : `${selectedCost} 战功 · 确认兑换`;
      if (confirmEnabled) {
        const confirmX = 900;
        const confirmY = 858;
        const confirmWidth = 452;
        const confirmHeight = 68;
        this.context.fillStyle = '#d0a24d';
        this.context.strokeStyle = '#f5d77e';
        this.context.lineWidth = 2;
        this.roundRect(confirmX, confirmY, confirmWidth, confirmHeight, 18);
        this.context.fill();
        this.context.stroke();
        this.fitText(
          confirmLabel,
          confirmX + confirmWidth / 2,
          confirmY + confirmHeight / 2,
          confirmWidth - 36,
          typography.action,
          '#07152a',
          'center',
          700,
          0,
          CARD_BODY_FONT,
          'middle',
        );
        this.interactions.push({
          id: 'shop-confirm',
          x: confirmX,
          y: confirmY,
          width: confirmWidth,
          height: confirmHeight,
        });
      } else {
        this.context.fillStyle = 'rgba(112, 105, 83, .24)';
        this.context.strokeStyle = 'rgba(183, 174, 145, .3)';
        this.roundRect(900, 858, 452, 68, 18);
        this.context.fill();
        this.context.stroke();
        this.fitText(
          confirmLabel,
          1_126,
          892,
          420,
          typography.action,
          'rgba(219,217,202,.42)',
          'center',
          700,
          0,
          CARD_BODY_FONT,
          'middle',
        );
      }
      return;
    }

    const rerollWidth = Math.min(480, 400 + Math.max(0, this.viewport.width - DESIGN_WIDTH) / 6);
    const rerollLabel = rerollsRemaining === undefined
      ? '↻  重抽一次 · 练习免费'
      : rerollsRemaining > 0
        ? `↻  重抽 · 剩余 ${rerollsRemaining} 次`
        : '重抽次数已用尽';
    if (rerollsRemaining === 0) {
      this.context.fillStyle = 'rgba(8,28,46,.62)';
      this.context.strokeStyle = 'rgba(126,146,155,.30)';
      this.roundRect(960 - rerollWidth / 2, 858, rerollWidth, 68, 18);
      this.context.fill();
      this.context.stroke();
      this.fitText(
        rerollLabel,
        960,
        892,
        rerollWidth - 32,
        typography.action,
        'rgba(210,220,215,.46)',
        'center',
        650,
        0,
        CARD_BODY_FONT,
        'middle',
      );
    } else {
      this.drawButton(
        'card-reroll',
        960 - rerollWidth / 2,
        858,
        rerollWidth,
        68,
        rerollLabel,
        'rgba(8,28,46,.88)',
        'rgba(235,240,228,.82)',
        'rgba(88,174,245,.42)',
        24,
        15,
      );
    }
  }

  private drawCardMetricPanel(
    x: number,
    cardY: number,
    width: number,
    presentation: CardMetricPresentation,
    accent: string,
    deltaColor: string,
    disabled: boolean,
    layout: CardOverlayContentLayout,
    afterLabel: string,
  ): void {
    const panelY = cardY + layout.metricTop;
    const panelHeight = layout.metricHeight;
    this.context.fillStyle = disabled ? 'rgba(215,225,222,.025)' : 'rgba(113, 157, 168, .055)';
    this.context.strokeStyle = disabled ? 'rgba(159,172,171,.12)' : `${accent}24`;
    this.context.lineWidth = 1;
    this.roundRect(x, panelY, width, panelHeight, 16);
    this.context.fill();
    this.context.stroke();

    const labelX = x + 18;
    const beforeX = x + width * .50;
    const arrowX = x + width * .68;
    const afterX = x + width * .84;
    const labelWidth = width * .31;
    const valueWidth = width * .20;
    const currentColor = disabled ? 'rgba(190,201,199,.48)' : 'rgba(220,230,226,.76)';
    const afterColor = disabled ? 'rgba(190,201,199,.52)' : accent;

    this.text(
      '当前',
      beforeX,
      cardY + layout.metricHeaderBaseline,
      layout.typography.label,
      'rgba(207,222,217,.48)',
      'center',
      500,
      0,
      CARD_BODY_FONT,
    );
    this.text(
      afterLabel,
      afterX,
      cardY + layout.metricHeaderBaseline,
      layout.typography.label,
      'rgba(207,222,217,.60)',
      'center',
      600,
      0,
      CARD_BODY_FONT,
    );

    const rowBaselines = presentation.rows.length > 1
      ? layout.masteryMetricBaselines
      : [layout.singleMetricBaseline] as const;
    const valueSize = presentation.rows.length > 1
      ? layout.typography.masteryValue
      : layout.typography.value;
    presentation.rows.forEach((row, index) => {
      const baseline = cardY + (rowBaselines[index] ?? layout.singleMetricBaseline);
      this.fitText(
        row.label,
        labelX,
        baseline,
        labelWidth,
        layout.typography.label,
        currentColor,
        'left',
        600,
        0,
        CARD_BODY_FONT,
      );
      this.fitText(
        row.before,
        beforeX,
        baseline,
        valueWidth,
        valueSize,
        currentColor,
        'center',
        700,
        0,
        CARD_NUMBER_FONT,
      );
      this.text(
        '→',
        arrowX,
        baseline,
        layout.typography.label,
        'rgba(198,215,210,.42)',
        'center',
        500,
        0,
        CARD_BODY_FONT,
      );
      this.fitText(
        row.after,
        afterX,
        baseline,
        valueWidth,
        valueSize,
        afterColor,
        'center',
        750,
        0,
        CARD_NUMBER_FONT,
      );
    });

    this.fitText(
      presentation.delta,
      x + width / 2,
      cardY + layout.deltaBaseline,
      width - 32,
      layout.typography.delta,
      deltaColor,
      'center',
      600,
      0,
      CARD_BODY_FONT,
    );
  }

  private drawTowerStrategyPanel(
    state: BattleRenderState,
    towerMetrics: TowerMetricRenderState[],
  ): void {
    this.drawModalShade('rgba(1, 8, 18, .82)');
    const panelX = 410;
    const panelY = 128;
    const panelWidth = 1_100;
    const panelHeight = 824;
    this.drawPanel(panelX, panelY, panelWidth, panelHeight, '#63d8d2');

    this.text('箭 塔 战 策', panelX + 54, panelY + 62, 34, '#f3e6c7', 'left', 780, 16, CARD_SERIF_FONT);
    this.text('法门为全体箭塔共用属性；输出按已部署塔实际扣血统计', panelX + 54, panelY + 98, 18, 'rgba(220,238,233,.62)', 'left', 500, 11, CARD_BODY_FONT);
    this.drawButton(
      'strategy-close',
      panelX + panelWidth - 92,
      panelY + 28,
      58,
      58,
      '×',
      'rgba(255,255,255,.04)',
      '#e8eee8',
      'rgba(112,216,211,.44)',
      28,
      14,
    );

    const selectedTowerId = state.selectedTowerId;
    ([0, 1, 2] as const).filter((towerId) => this.activeTowerIds.has(towerId)).forEach((towerId, index) => {
      const selected = towerId === selectedTowerId;
      const visual = TOWER_VISUALS[towerId];
      const x = panelX + 54 + index * 206;
      this.context.fillStyle = selected ? `${visual.accent}28` : 'rgba(255,255,255,.035)';
      this.context.strokeStyle = selected ? visual.accent : 'rgba(220,235,230,.16)';
      this.context.lineWidth = selected ? 2.5 : 1.5;
      this.roundRect(x, panelY + 122, 182, 58, 16);
      this.context.fill();
      this.context.stroke();
      this.text(
        `${towerId + 1} 号塔${selected ? ' · 当前' : ''}`,
        x + 91,
        panelY + 160,
        20,
        selected ? visual.accent : 'rgba(228,238,232,.66)',
        'center',
        700,
        11,
      );
      this.interactions.push({
        id: `strategy-tower:${towerId}`,
        x,
        y: panelY + 122,
        width: 182,
        height: 58,
      });
    });

    const stats = this.resolveTowerStats(state.hud);
    const leftX = panelX + 42;
    const leftY = panelY + 208;
    const leftWidth = 660;
    const bodyHeight = 558;
    this.context.fillStyle = 'rgba(2, 15, 30, .62)';
    this.context.strokeStyle = 'rgba(101,216,210,.24)';
    this.roundRect(leftX, leftY, leftWidth, bodyHeight, 22);
    this.context.fill();
    this.context.stroke();
    this.text('属性来源', leftX + 26, leftY + 42, 21, '#77ded9', 'left', 700, 12);
    this.text('基础', leftX + 318, leftY + 42, 15, 'rgba(224,238,232,.48)', 'center', 550, 9);
    this.text('境界后', leftX + 442, leftY + 42, 15, 'rgba(224,238,232,.48)', 'center', 550, 9);
    this.text('法门后', leftX + 574, leftY + 42, 15, '#f0c86f', 'center', 650, 9);

    const sourceRows = [
      ['单箭伤害', preciseDamage(stats.base.damagePerArrowMilli), preciseDamage(stats.afterLevel.damagePerArrowMilli), preciseDamage(stats.current.damagePerArrowMilli)],
      ['暴击单箭', preciseDamage(stats.base.criticalDamagePerArrowMilli), preciseDamage(stats.afterLevel.criticalDamagePerArrowMilli), preciseDamage(stats.current.criticalDamagePerArrowMilli)],
      ['攻速 / 秒', formatRate(stats.base.attackRateMilliPerSecond), formatRate(stats.afterLevel.attackRateMilliPerSecond), formatRate(stats.current.attackRateMilliPerSecond)],
      ['射程', `${Math.round(stats.base.rangePx)} px`, `${Math.round(stats.afterLevel.rangePx)} px`, `${Math.round(stats.current.rangePx)} px`],
      ['箭矢 / 穿透', `${stats.base.arrowCount} / ${stats.base.penetrationCount}`, `${stats.afterLevel.arrowCount} / ${stats.afterLevel.penetrationCount}`, `${stats.current.arrowCount} / ${stats.current.penetrationCount}`],
      ['暴击率', formatBp(stats.base.critChanceBp), formatBp(stats.afterLevel.critChanceBp), formatBp(stats.current.critChanceBp)],
      ['暴伤倍率', formatBp(stats.base.critDamageBp), formatBp(stats.afterLevel.critDamageBp), formatBp(stats.current.critDamageBp)],
    ] as const;
    sourceRows.forEach(([label, base, afterLevel, current], index) => {
      const rowY = leftY + 86 + index * 58;
      if (index > 0) {
        this.context.fillStyle = 'rgba(220,235,230,.08)';
        this.context.fillRect(leftX + 22, rowY - 30, leftWidth - 44, 1);
      }
      this.text(label, leftX + 26, rowY, 17, 'rgba(225,239,234,.72)', 'left', 580, 10);
      this.text(base, leftX + 318, rowY, 19, '#dce8df', 'center', 680, 10, CARD_NUMBER_FONT);
      this.text(afterLevel, leftX + 442, rowY, 19, '#72dad5', 'center', 680, 10, CARD_NUMBER_FONT);
      this.text(current, leftX + 574, rowY, 20, '#f0c86f', 'center', 740, 10, CARD_NUMBER_FONT);
    });
    this.text(
      `穿透每次保留 ${formatBp(stats.current.penetrationRetentionBp)} · 面板伤害未计敌方护甲与相位减伤`,
      leftX + 26,
      leftY + bodyHeight - 24,
      15,
      'rgba(216,231,226,.48)',
      'left',
      500,
      9,
    );

    const rightX = leftX + leftWidth + 26;
    const rightWidth = 330;
    this.context.fillStyle = 'rgba(2, 15, 30, .62)';
    this.context.strokeStyle = 'rgba(224,190,104,.26)';
    this.roundRect(rightX, leftY, rightWidth, bodyHeight, 22);
    this.context.fill();
    this.context.stroke();
    const hudWithTowerData = state.hud as HudProjectionWithTowerData;
    const runtime = hudWithTowerData.towerRuntime?.find(
      (candidate) => candidate.towerId === selectedTowerId,
    );
    const metric = towerMetrics.find((candidate) => candidate.towerId === selectedTowerId)
      ?? { towerId: selectedTowerId, damageLast1sMilli: 0, damageLast3sMilli: 0 };
    const total3s = towerMetrics.reduce((sum, candidate) => sum + candidate.damageLast3sMilli, 0);
    const shareBp = total3s > 0 ? Math.round((metric.damageLast3sMilli * 10_000) / total3s) : 0;
    const targetLabel = runtime?.currentTargetName
      ?? (runtime?.currentTargetEntityId !== undefined ? `敌军 #${runtime.currentTargetEntityId}` : '暂无目标');
    const aimDegrees = Math.round(((state.hud.aimAnglesU16[selectedTowerId] ?? 0) / 65_536) * 360);
    const accent = TOWER_VISUALS[selectedTowerId].accent;
    this.text(`${selectedTowerId + 1} 号塔 · 实时策略`, rightX + 24, leftY + 42, 21, accent, 'left', 720, 12);
    this.text('当前首选目标', rightX + 24, leftY + 82, 15, 'rgba(225,237,232,.48)', 'left', 550, 9);
    this.text(targetLabel, rightX + 24, leftY + 116, 22, '#eff2e8', 'left', 720, 11);
    this.text(
      `射程内 ${runtime?.enemiesInRange ?? 0} · 方向优先 ${runtime?.preferredEnemiesInRange ?? 0}`,
      rightX + 24,
      leftY + 151,
      16,
      'rgba(220,237,231,.66)',
      'left',
      550,
      9,
    );
    this.text(`瞄准 ${aimDegrees}° · 射程 ${Math.round(stats.current.rangePx)} px`, rightX + 24, leftY + 180, 16, 'rgba(220,237,231,.66)', 'left', 550, 9);

    this.context.fillStyle = 'rgba(255,255,255,.04)';
    this.roundRect(rightX + 20, leftY + 208, rightWidth - 40, 132, 18);
    this.context.fill();
    this.text('近 1 秒 DPS', rightX + 40, leftY + 242, 15, 'rgba(221,235,229,.52)', 'left', 550, 9);
    this.text(compactDamage(metric.damageLast1sMilli), rightX + rightWidth - 40, leftY + 276, 32, accent, 'right', 780, 12, CARD_NUMBER_FONT);
    this.text('近 3 秒 DPS', rightX + 40, leftY + 316, 15, 'rgba(221,235,229,.52)', 'left', 550, 9);
    this.text(compactDamage(Math.round(metric.damageLast3sMilli / 3)), rightX + rightWidth - 40, leftY + 316, 24, '#72dad5', 'right', 740, 11, CARD_NUMBER_FONT);

    this.text('近 3 秒输出占比', rightX + 24, leftY + 382, 16, 'rgba(224,237,232,.58)', 'left', 600, 9);
    this.text(formatBp(shareBp), rightX + rightWidth - 24, leftY + 386, 30, '#f0c86f', 'right', 780, 12, CARD_NUMBER_FONT);
    this.progressBar(rightX + 24, leftY + 404, rightWidth - 48, 10, shareBp / 10_000, accent);

    this.text('索敌优先级', rightX + 24, leftY + 454, 16, 'rgba(224,237,232,.52)', 'left', 600, 9);
    this.wrapText(
      '瞄准扇区内最靠近关门者优先；同批射击会自动分散目标，扇区无目标时回退到路程最前者。',
      rightX + rightWidth / 2,
      leftY + 486,
      rightWidth - 48,
      28,
      17,
      'rgba(226,239,233,.72)',
      520,
      10,
      3,
      CARD_BODY_FONT,
    );
  }

  private drawPauseOverlay(): void {
    this.drawModalShade();
    this.drawPanel(660, 240, 600, 600, '#62d8d3');
    this.drawSeal(960, 370, 68, 'Ⅱ');
    this.text('潮声暂歇', 960, 474, 21, '#6fded9', 'center', 650);
    this.text('战斗已暂停', 960, 536, 48, '#f2e7cb', 'center', 800);
    this.drawButton('hud-strategy', 790, 598, 340, 64, '查看箭塔战策', 'rgba(74,181,177,.16)', '#7ee1dc', '#4b9898', 23, 13);
    this.drawButton('overlay-resume', 770, 684, 380, 70, '继续守关', '#d0a24d', '#07152a');
    this.drawButton('overlay-exit', 830, 778, 260, 50, '返回关城', 'rgba(255,255,255,.06)', '#e6eee8', '#5b7384', 20, 12);
  }

  private drawDefeatOverlay(reviveOrdinal?: number, terminal = false): void {
    this.drawModalShade('rgba(34, 5, 12, .70)');
    this.drawPanel(625, 205, 670, 680, '#ef765f');
    this.drawLoopingVfx('VFX_DEFEAT', 960, 337, 240, .58);
    this.drawSeal(960, 337, 72, '关', '#7b2631', '#f2be7b');
    this.text(
      terminal ? '关门耐久归零，本次试炼结束' : '关门耐久归零，防线已被突破',
      960,
      456,
      21,
      '#f08a78',
      'center',
      650,
    );
    this.text('关门失守', 960, 522, 50, '#f7e4ca', 'center', 800);
    const canRevive = reviveOrdinal !== undefined && reviveOrdinal <= this.bundle.rules.maxRevives;
    this.wrapText(
      canRevive
        ? `可发动第 ${reviveOrdinal} 次重燃，击退地面敌人并获得短暂保护。`
        : terminal
          ? '重燃机会已经耗尽，调整构筑后再守一次。'
          : '本次试炼的重燃机会已经耗尽。',
      960,
      598,
      510,
      31,
      21,
      'rgba(243,234,222,.74)',
    );
    if (canRevive) {
      this.drawButton('overlay-revive', 760, 704, 400, 78, `重燃关火  ${reviveOrdinal}/${this.bundle.rules.maxRevives}`, '#d75e4f', '#fff2dc');
    } else if (terminal) {
      this.drawButton('overlay-retry', 760, 704, 400, 78, '重新布阵', '#d75e4f', '#fff2dc');
    }
    this.drawButton('overlay-exit', 820, 802, 280, 58, '结束试炼', 'rgba(255,255,255,.05)', '#eee3d6', '#77504e');
  }

  private drawEndlessResultOverlay(
    result: EndlessRecordRenderState | undefined,
    previousBest: EndlessRecordRenderState | undefined,
    isNewBest: boolean | undefined,
    reason: EndlessSettlementReason | undefined,
    endless: EndlessHudProjectionLike,
    hud: HudProjectionV1,
  ): void {
    this.drawModalShade('rgba(2, 4, 18, .82)');
    const x = 570;
    const y = 150;
    const width = 780;
    const height = 760;
    const panel = this.context.createLinearGradient(x, y, x + width, y + height);
    panel.addColorStop(0, 'rgba(34, 26, 79, .99)');
    panel.addColorStop(.52, 'rgba(10, 25, 52, .995)');
    panel.addColorStop(1, 'rgba(4, 17, 34, .998)');
    this.context.save();
    this.context.shadowColor = 'rgba(7, 2, 24, .76)';
    this.context.shadowBlur = 46;
    this.context.shadowOffsetY = 18;
    this.context.fillStyle = panel;
    this.context.strokeStyle = 'rgba(143, 123, 242, .84)';
    this.context.lineWidth = 3;
    this.roundRect(x, y, width, height, 28);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
    this.context.strokeStyle = 'rgba(89, 226, 213, .23)';
    this.context.lineWidth = 1;
    this.roundRect(x + 14, y + 14, width - 28, height - 28, 20);
    this.context.stroke();

    const resultTick = result?.survivalTick ?? endless.survivalTick;
    const reachedBoss = result?.reachedBoss ?? endless.phase !== 'survival';
    const bossLayer = result?.bossLayer ?? endless.bossLayer;
    const bossDamageMilli = result?.bossDamageMilli ?? endless.bossDamageMilli;
    const routeId = result?.routeId ?? endless.routeId ?? this.bundle.route.id;
    const resolvedReason = reason
      ?? (resultTick >= endless.hardEndTick ? 'time-limit' : undefined);
    const reasonLabel = resolvedReason === 'time-limit'
      ? '时限结算'
      : resolvedReason === 'breach'
        ? '关城失守'
        : resolvedReason === 'manual'
          ? '主动结算'
          : '本局结算';

    this.drawSeal(960, 238, 54, '∞', '#241c55', '#8f7bf2');
    this.text('无 尽 战 报', 960, 323, 19, '#70e1d6', 'center', 760, 11, CARD_SERIF_FONT);
    this.text(reasonLabel, 960, 380, 42, '#f2e8d3', 'center', 800, 16, CARD_SERIF_FONT);
    this.text(
      `${formatEndlessRoute(routeId)} · ${reachedBoss ? '已抵达龙王阶段' : '生存阶段结束'}`,
      960,
      421,
      18,
      'rgba(207,226,222,.7)',
      'center',
      560,
      10,
    );

    const statY = 458;
    this.context.fillStyle = 'rgba(255,255,255,.035)';
    this.roundRect(625, statY, 670, 212, 18);
    this.context.fill();
    this.context.strokeStyle = 'rgba(112, 225, 214, .16)';
    this.context.stroke();
    this.context.fillStyle = 'rgba(222,235,232,.11)';
    this.context.fillRect(848, statY + 24, 1, 164);
    this.context.fillRect(1071, statY + 24, 1, 164);

    this.drawEndlessResultStat(737, statY + 18, '生存时长', formatTicks(resultTick), '#f0d99b');
    this.drawEndlessResultStat(
      960,
      statY + 18,
      reachedBoss ? '龙王层数' : '威胁等级',
      reachedBoss ? `第 ${Math.max(1, bossLayer)} 层` : String(Math.max(1, endless.threatTier)),
      '#bba9ff',
    );
    this.drawEndlessResultStat(
      1183,
      statY + 18,
      reachedBoss ? '龙王实际伤害' : '本局累计伤害',
      compactDamage(reachedBoss ? bossDamageMilli : hud.damageDealtMilli),
      '#6fe2d6',
    );

    const finalStats = this.resolveTowerStats(hud).current;
    this.text(
      `最终境界 ${hud.level} · 单箭 ${preciseDamage(finalStats.damagePerArrowMilli)} · 攻速 ${formatRate(finalStats.attackRateMilliPerSecond)}/秒 · 箭/穿 ${finalStats.arrowCount}/${finalStats.penetrationCount} · 暴击 ${formatBp(finalStats.critChanceBp)}`,
      960,
      695,
      14,
      'rgba(220,235,230,.68)',
      'center',
      620,
      8,
      CARD_NUMBER_FONT,
    );

    const resultStatus = result && isNewBest === true
      ? previousBest?.routeId === result.routeId
        ? `${formatEndlessRoute(result.routeId)} · 新纪录 · 原 ${endlessRecordScore(previousBest)}`
        : `${formatEndlessRoute(result.routeId)} · 首次纪录`
      : result && isNewBest === false && previousBest?.routeId === result.routeId
        ? `${formatEndlessRoute(result.routeId)} · 未刷新 · 纪录 ${endlessRecordScore(previousBest)}`
        : result
          ? '本次成绩已按路线独立保存'
          : '正在固化本局成绩';
    this.text(
      resultStatus,
      960,
      730,
      17,
      'rgba(213,231,226,.58)',
      'center',
      600,
      9,
    );
    this.drawButton('overlay-retry', 735, 760, 450, 72, '再入潮渊  ›', '#8270e7', '#f8f2ff', '#b7a9ff', 24, 13);
    this.drawButton('overlay-exit', 820, 842, 280, 50, '返回关城', 'rgba(255,255,255,.035)', 'rgba(235,239,232,.82)', '#55747c', 19, 11);
  }

  private drawEndlessResultStat(
    centerX: number,
    top: number,
    label: string,
    value: string,
    color: string,
  ): void {
    this.text(label, centerX, top + 40, 15, 'rgba(217,231,227,.55)', 'center', 560, 9);
    this.text(value, centerX, top + 112, 31, color, 'center', 780, 13, CARD_NUMBER_FONT);
  }

  private drawVictoryOverlay(hud: HudProjectionV1, nextStageName?: string): void {
    this.drawModalShade('rgba(1, 7, 15, .72)');
    this.drawVictoryPanel();
    this.drawLoopingVfx('VFX_VICTORY', 960, 310, 300, .5);
    this.drawVictoryHeader();
    this.drawVictoryStats(hud);

    const primaryId = nextStageName ? 'overlay-next' : 'overlay-retry';
    const primaryLabel = nextStageName ? `进入${nextStageName}  ›` : '再守一局  ›';
    this.drawVictoryPrimaryAction(primaryId, primaryLabel);
    this.drawButton(
      'overlay-exit',
      820,
      746,
      280,
      56,
      '返回关城',
      'rgba(255,255,255,.025)',
      'rgba(236,231,217,.74)',
      'rgba(213,181,113,.24)',
      21,
      12,
    );
  }

  private drawVictoryPanel(): void {
    const x = 600;
    const y = 205;
    const width = 720;
    const height = 660;
    const panel = this.context.createLinearGradient(x, y, x + width, y + height);
    panel.addColorStop(0, 'rgba(15, 43, 61, .985)');
    panel.addColorStop(.48, 'rgba(7, 25, 42, .99)');
    panel.addColorStop(1, 'rgba(3, 14, 29, .995)');

    this.context.save();
    this.context.shadowColor = 'rgba(0, 0, 0, .58)';
    this.context.shadowBlur = 42;
    this.context.shadowOffsetY = 18;
    this.context.fillStyle = panel;
    this.roundRect(x, y, width, height, 22);
    this.context.fill();
    this.context.restore();

    const topGlow = this.context.createRadialGradient(960, y + 4, 10, 960, y + 4, 330);
    topGlow.addColorStop(0, 'rgba(227, 184, 91, .18)');
    topGlow.addColorStop(.62, 'rgba(68, 155, 157, .055)');
    topGlow.addColorStop(1, 'rgba(7, 23, 39, 0)');
    this.context.fillStyle = topGlow;
    this.roundRect(x + 2, y + 2, width - 4, 236, 20);
    this.context.fill();

    this.context.strokeStyle = 'rgba(226, 184, 91, .74)';
    this.context.lineWidth = 2;
    this.roundRect(x, y, width, height, 22);
    this.context.stroke();
    this.context.strokeStyle = 'rgba(238, 210, 143, .18)';
    this.context.lineWidth = 1;
    this.roundRect(x + 12, y + 12, width - 24, height - 24, 14);
    this.context.stroke();

    this.context.strokeStyle = 'rgba(230, 188, 96, .62)';
    this.context.lineWidth = 2;
    const corner = 34;
    const inset = 23;
    for (const [cornerX, cornerY, directionX, directionY] of [
      [x + inset, y + inset, 1, 1],
      [x + width - inset, y + inset, -1, 1],
      [x + inset, y + height - inset, 1, -1],
      [x + width - inset, y + height - inset, -1, -1],
    ] as const) {
      this.context.beginPath();
      this.context.moveTo(cornerX, cornerY + directionY * corner);
      this.context.lineTo(cornerX, cornerY);
      this.context.lineTo(cornerX + directionX * corner, cornerY);
      this.context.stroke();
    }
  }

  private drawVictoryHeader(): void {
    const rule = this.context.createLinearGradient(710, 0, 1210, 0);
    rule.addColorStop(0, 'rgba(224,181,87,0)');
    rule.addColorStop(.24, 'rgba(224,181,87,.62)');
    rule.addColorStop(.5, 'rgba(249,220,149,.9)');
    rule.addColorStop(.76, 'rgba(224,181,87,.62)');
    rule.addColorStop(1, 'rgba(224,181,87,0)');
    this.context.fillStyle = rule;
    this.context.fillRect(710, 226, 500, 2);

    this.context.fillStyle = '#102638';
    this.context.strokeStyle = 'rgba(232,194,107,.82)';
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.moveTo(858, 203);
    this.context.lineTo(880, 184);
    this.context.lineTo(1040, 184);
    this.context.lineTo(1062, 203);
    this.context.lineTo(1040, 232);
    this.context.lineTo(880, 232);
    this.context.closePath();
    this.context.fill();
    this.context.stroke();
    this.text('守 关 大 捷', 960, 216, 20, '#f2d28a', 'center', 760, 12, CARD_SERIF_FONT);

    this.text(
      `${this.bundle.waves.length} 波潮军 · 全部肃清`,
      960,
      282,
      19,
      'rgba(226,190,108,.86)',
      'center',
      650,
      12,
      CARD_BODY_FONT,
    );
    this.text(this.bundle.stage.name, 960, 348, 48, '#f5ead2', 'center', 760, 18, CARD_SERIF_FONT);
    this.text('守关成功 · 关门无恙', 960, 389, 20, 'rgba(197,222,217,.72)', 'center', 520, 12, CARD_BODY_FONT);

    const separator = this.context.createLinearGradient(690, 0, 1230, 0);
    separator.addColorStop(0, 'rgba(225,183,88,0)');
    separator.addColorStop(.5, 'rgba(225,183,88,.68)');
    separator.addColorStop(1, 'rgba(225,183,88,0)');
    this.context.fillStyle = separator;
    this.context.fillRect(690, 416, 540, 1.5);
    this.context.fillStyle = '#e6bf6b';
    this.context.save();
    this.context.translate(960, 417);
    this.context.rotate(Math.PI / 4);
    this.context.fillRect(-4, -4, 8, 8);
    this.context.restore();
  }

  private drawVictoryStats(hud: HudProjectionV1): void {
    const x = 650;
    const y = 448;
    const width = 620;
    const height = 126;
    const background = this.context.createLinearGradient(x, y, x + width, y);
    background.addColorStop(0, 'rgba(255,255,255,.012)');
    background.addColorStop(.5, 'rgba(112, 178, 174, .055)');
    background.addColorStop(1, 'rgba(255,255,255,.012)');
    this.context.fillStyle = background;
    this.context.fillRect(x, y, width, height);

    const edge = this.context.createLinearGradient(x, 0, x + width, 0);
    edge.addColorStop(0, 'rgba(224,181,87,0)');
    edge.addColorStop(.18, 'rgba(224,181,87,.42)');
    edge.addColorStop(.82, 'rgba(224,181,87,.42)');
    edge.addColorStop(1, 'rgba(224,181,87,0)');
    this.context.fillStyle = edge;
    this.context.fillRect(x, y, width, 1);
    this.context.fillRect(x, y + height - 1, width, 1);

    this.context.fillStyle = 'rgba(224,190,118,.22)';
    this.context.fillRect(856, y + 27, 1, 72);
    this.context.fillRect(1063, y + 27, 1, 72);

    this.drawVictoryStat(754, y, '最终境界', String(hud.level), 34, '#e9d39b');
    this.drawVictoryStat(960, y, '累计伤害', compactDamage(hud.damageDealtMilli), 40, '#f2c96d');
    this.drawVictoryStat(1166, y, '守关评级', '甲', 36, '#edd18a');
  }

  private drawVictoryStat(
    centerX: number,
    top: number,
    label: string,
    value: string,
    valueSize: number,
    valueColor: string,
  ): void {
    this.text(label, centerX, top + 36, 16, 'rgba(220,231,225,.58)', 'center', 500, 11, CARD_BODY_FONT);
    this.text(value, centerX, top + 91, valueSize, valueColor, 'center', 760, 16, CARD_NUMBER_FONT);
  }

  private drawVictoryPrimaryAction(id: 'overlay-next' | 'overlay-retry', label: string): void {
    const x = 735;
    const y = 625;
    const width = 450;
    const height = 78;
    const background = this.context.createLinearGradient(x, y, x + width, y + height);
    background.addColorStop(0, '#e3b95d');
    background.addColorStop(.54, '#d39e43');
    background.addColorStop(1, '#b97e2c');

    this.context.save();
    this.context.shadowColor = 'rgba(220, 169, 71, .24)';
    this.context.shadowBlur = 22;
    this.context.shadowOffsetY = 8;
    this.context.fillStyle = background;
    this.context.strokeStyle = 'rgba(255,225,153,.72)';
    this.context.lineWidth = 1.5;
    this.roundRect(x, y, width, height, 12);
    this.context.fill();
    this.context.stroke();
    this.context.restore();
    this.text(label, x + width / 2, y + 49, 25, '#07182a', 'center', 780, 14, CARD_BODY_FONT);
    this.interactions.push({ id, x, y, width, height });
  }

  private drawErrorOverlay(message: string): void {
    this.drawModalShade('rgba(35, 4, 10, .75)');
    this.drawPanel(550, 200, 820, 680, '#ef765f');
    this.drawSeal(960, 340, 70, '!');
    this.text('战斗演算中断', 960, 462, 48, '#f4e3ce', 'center', 800);
    this.wrapText(message, 960, 550, 620, 30, 21, 'rgba(241,232,221,.72)');
    this.drawButton('overlay-exit', 670, 770, 260, 70, '返回关城', 'rgba(255,255,255,.06)', '#eee7dc', '#795454');
    this.drawButton('overlay-retry', 970, 770, 280, 70, '重新布阵', '#d76152', '#fff3dd');
  }

  private drawModalShade(color = 'rgba(2, 9, 22, .74)'): void {
    this.context.fillStyle = color;
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );
  }

  private drawPanel(x: number, y: number, width: number, height: number, border: string): void {
    this.context.fillStyle = 'rgba(7, 22, 40, .97)';
    this.context.strokeStyle = border;
    this.context.lineWidth = 4;
    this.roundRect(x, y, width, height, 32);
    this.context.fill();
    this.context.stroke();
  }

  private drawGuardianOrb(x: number, y: number, label: string, color: string): void {
    this.context.fillStyle = 'rgba(3, 13, 27, .7)';
    this.context.strokeStyle = color;
    this.context.lineWidth = 4;
    this.context.beginPath();
    this.context.arc(x, y, 38, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.text(label, x, y + 10, 26, color, 'center', 750);
  }

  private drawSeal(
    x: number,
    y: number,
    radius: number,
    label: string,
    background = '#183a52',
    foreground = '#f0c66e',
  ): void {
    this.context.fillStyle = background;
    this.context.strokeStyle = foreground;
    this.context.lineWidth = Math.max(3, radius * .08);
    this.context.beginPath();
    this.context.arc(x, y, radius, 0, Math.PI * 2);
    this.context.fill();
    this.context.stroke();
    this.text(label, x, y + radius * .34, radius * .76, foreground, 'center', 800);
  }

  private drawButton(
    id: InteractionId,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    background: string,
    foreground: string,
    border?: string,
    fontSize?: number,
    minScreenPx = 0,
  ): void {
    this.context.fillStyle = background;
    this.context.strokeStyle = border ?? background;
    this.context.lineWidth = 2;
    this.roundRect(x, y, width, height, Math.min(18, height / 2));
    this.context.fill();
    this.context.stroke();
    const resolvedFontSize = this.resolveFontSize(fontSize ?? Math.min(27, height * .38), minScreenPx);
    this.text(
      label,
      x + width / 2,
      y + height / 2 + resolvedFontSize * .32,
      resolvedFontSize,
      foreground,
      'center',
      700,
    );
    this.interactions.push({ id, x, y, width, height });
  }

  private pill(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    background: string,
    color: string,
    fontSize?: number,
    minScreenPx = 0,
  ): void {
    this.context.fillStyle = background;
    this.roundRect(x, y, width, height, height / 2);
    this.context.fill();
    const resolvedFontSize = this.resolveFontSize(fontSize ?? Math.min(20, height * .4), minScreenPx);
    this.text(
      label,
      x + width / 2,
      y + height / 2 + resolvedFontSize * .32,
      resolvedFontSize,
      color,
      'center',
      700,
    );
  }

  private progressBar(x: number, y: number, width: number, height: number, progress: number, color: string): void {
    this.context.fillStyle = 'rgba(255,255,255,.12)';
    this.roundRect(x, y, width, height, height / 2);
    this.context.fill();
    const fillWidth = Math.max(0, Math.min(width, width * progress));
    if (fillWidth <= 0) return;
    this.context.fillStyle = color;
    this.roundRect(x, y, fillWidth, height, height / 2);
    this.context.fill();
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: 'left' | 'center' | 'right' = 'left',
    weight = 400,
    minScreenPx = 0,
    fontFamily = 'sans-serif',
    baseline: CanvasTextBaseline = 'alphabetic',
  ): void {
    const resolvedSize = this.resolveFontSize(size, minScreenPx);
    this.context.fillStyle = color;
    this.context.font = `${resolveCanvasFontWeight(weight)} ${resolvedSize}px ${fontFamily}`;
    this.context.textAlign = align;
    this.context.textBaseline = baseline;
    this.context.fillText(value, x, y);
  }

  private fitText(
    value: string,
    x: number,
    y: number,
    maxWidth: number,
    size: number,
    color: string,
    align: 'left' | 'center' | 'right' = 'left',
    weight = 400,
    minScreenPx = 0,
    fontFamily = 'sans-serif',
    baseline: CanvasTextBaseline = 'alphabetic',
  ): void {
    const resolvedSize = this.resolveFontSize(size, minScreenPx);
    this.context.font = `${resolveCanvasFontWeight(weight)} ${resolvedSize}px ${fontFamily}`;
    const measuredWidth = this.context.measureText(value).width;
    const fittedSize = measuredWidth > maxWidth && measuredWidth > 0
      ? resolvedSize * maxWidth / measuredWidth
      : resolvedSize;
    this.text(value, x, y, fittedSize, color, align, weight, 0, fontFamily, baseline);
  }

  private wrapText(
    value: string,
    centerX: number,
    startY: number,
    maxWidth: number,
    lineHeight: number,
    size: number,
    color: string,
    weight = 400,
    minScreenPx = 0,
    maxLines = Number.POSITIVE_INFINITY,
    fontFamily = 'sans-serif',
  ): void {
    const resolvedSize = this.resolveFontSize(size, minScreenPx);
    const resolvedLineHeight = Math.max(lineHeight, resolvedSize * 1.28);
    this.context.font = `${resolveCanvasFontWeight(weight)} ${resolvedSize}px ${fontFamily}`;
    const lines: string[] = [];
    let current = '';
    for (const character of value) {
      const candidate = `${current}${character}`;
      if (current && this.context.measureText(candidate).width > maxWidth) {
        lines.push(current.trimEnd());
        current = character.trimStart();
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current.trimEnd());
    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines && visibleLines.length > 0) {
      const lastIndex = visibleLines.length - 1;
      let finalLine = visibleLines[lastIndex] ?? '';
      while (finalLine && this.context.measureText(`${finalLine}…`).width > maxWidth) {
        finalLine = finalLine.slice(0, -1);
      }
      visibleLines[lastIndex] = `${finalLine}…`;
    }
    visibleLines.forEach((line, index) => {
      this.text(line, centerX, startY + index * resolvedLineHeight, resolvedSize, color, 'center', weight, 0, fontFamily);
    });
  }

  private resolveFontSize(designSize: number, minScreenPx = 0): number {
    return Math.max(designSize, minScreenPx / Math.max(this.scale, 0.01));
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const safe = Math.max(0, Math.min(radius, width / 2, height / 2));
    this.context.beginPath();
    this.context.moveTo(x + safe, y);
    this.context.arcTo(x + width, y, x + width, y + height, safe);
    this.context.arcTo(x + width, y + height, x, y + height, safe);
    this.context.arcTo(x, y + height, x, y, safe);
    this.context.arcTo(x, y, x + width, y, safe);
    this.context.closePath();
  }

  private towerCenter(): DesignPoint {
    const anchors = this.bundle.route.towerAnchors;
    return {
      x: anchors.reduce((sum, anchor) => sum + anchor.x, 0) / anchors.length,
      y: anchors.reduce((sum, anchor) => sum + anchor.y, 0) / anchors.length,
    };
  }

  private stageNumber(stageId: BattleStageId): string {
    if (stageId === 'STAGE_08') return '∞';
    return String(BATTLE_STAGE_ORDER.indexOf(stageId) + 1).padStart(2, '0');
  }
}
