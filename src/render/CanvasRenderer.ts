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
  PROJECTILE_FLAG_PENETRATION,
  PROJECTILE_FLAG_TOWER_ID_MASK,
  PROJECTILE_FLAG_TOWER_ID_SHIFT,
  type BattleBundleV1,
  type BattleEvent,
  type BattleStageId,
  type CardDefinition,
  type HudProjectionV1,
  type RenderEntityV1,
  type RenderSnapshotV1,
  type TowerAimAnglesU16,
  type TowerId,
} from '../core/contracts';
import { ImageCatalog, type MiniGameRuntime } from '../platform/wechat';

export type InteractionId =
  | 'home-start'
  | 'home-continue'
  | 'home-new'
  | `home-stage:${BattleStageId}`
  | 'hud-back'
  | 'hud-speed'
  | 'hud-pause'
  | 'hud-mute'
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
}

export interface HomeRenderState {
  selectedStageId: BattleStageId;
  stages: HomeStageRenderState[];
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
  nextStageName?: string;
  error?: string;
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
  kind: 'ring' | 'burst' | 'revive' | 'sprite';
  assetId?: string;
  size?: number;
}

const ASSET_PATHS: Record<string, string> = {
  STAGE_01_BACKGROUND: 'assets/stage-01/background/STAGE_01_BACKGROUND.jpg',
  STAGE_02_BACKGROUND: 'assets/stage-02/background/STAGE_02_BACKGROUND.jpg',
  STAGE_03_BACKGROUND: 'assets/stage-03/background/STAGE_03_BACKGROUND.jpg',
  STAGE_04_BACKGROUND: 'assets/stage-04/background/STAGE_04_BACKGROUND.jpg',
  STAGE_05_BACKGROUND: 'assets/stage-05/background/STAGE_05_BACKGROUND.jpg',
  STAGE_06_BACKGROUND: 'assets/stage-06/background/STAGE_06_BACKGROUND.jpg',
  STAGE_07_BACKGROUND: 'assets/stage-07/background/STAGE_07_BACKGROUND.jpg',
  MON_SWIFT_EEL: 'assets/stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  MON_TIDE_IMP: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  MON_SHELL_CRAB: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_REEF_GUARD: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_DRAGON_TORTOISE: 'assets/stage-03/enemies/MON_DRAGON_TORTOISE.png',
  MON_ABYSS_SCALE_GUARD: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_ABYSS_WYRM: 'assets/stage-04/enemies/MON_ABYSS_WYRM.png',
  MON_SOLAR_FORMATION_PRIEST: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  MON_ECLIPSE_KUN_EMPEROR: 'assets/stage-05/enemies/MON_ECLIPSE_KUN_EMPEROR.png',
  MON_PHASE_SHELL_WEAVER: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_MIRAGE_MOTHER: 'assets/stage-06/enemies/MON_MIRAGE_MOTHER.png',
  MON_ETHEREAL_WALKER: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  MON_DUAL_PHASE_BOOK_MOTH: 'assets/stage-07/enemies/MON_DUAL_PHASE_BOOK_MOTH.png',
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
    description: '三塔会自动索敌；点塔后拖动可调整它的优先方向。',
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

export const BREACH_SEAL_MAX_Y = 892;

export function resolveBreachSealPlacement(
  route: BattleBundleV1['route'],
  maxY = BREACH_SEAL_MAX_Y,
): BreachSealPlacement {
  const points = route.points;
  const fallbackStart = points[Math.max(0, points.length - 2)] ?? route.breachPoint;
  let placement: BreachSealPlacement = {
    x: route.breachPoint.x,
    y: Math.min(route.breachPoint.y, maxY),
    tangentRadians: Math.atan2(
      route.breachPoint.y - fallbackStart.y,
      route.breachPoint.x - fallbackStart.x,
    ),
  };

  if (route.breachPoint.y <= maxY) return placement;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end || start.y === end.y) continue;
    const crossesMaxY = (start.y <= maxY && end.y >= maxY) || (start.y >= maxY && end.y <= maxY);
    if (!crossesMaxY) continue;
    const progress = (maxY - start.y) / (end.y - start.y);
    if (progress < 0 || progress > 1) continue;
    placement = {
      x: start.x + (end.x - start.x) * progress,
      y: maxY,
      tangentRadians: Math.atan2(end.y - start.y, end.x - start.x),
    };
  }
  return placement;
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

function cardDescription(card: CardDefinition): string {
  switch (card.effectId) {
    case 'tower-damage': return '三座箭塔伤害同步提升';
    case 'tower-frequency': return '三座箭塔攻速同步提升';
    case 'arrow-count': return '每轮攻击增加箭矢数量';
    case 'penetration': return '箭矢可额外穿透敌人';
    case 'crit-rate': return '三座箭塔暴击概率提升';
    case 'crit-damage': return '三座箭塔暴击伤害提升';
  }
}

function cardAmount(card: CardDefinition): string {
  if (card.valueInt !== undefined) {
    if (card.effectId === 'arrow-count') return `+${card.valueInt} 支/轮`;
    if (card.effectId === 'penetration') return `+${card.valueInt} 穿透`;
    return `+${card.valueInt}`;
  }
  return card.valueBp !== undefined ? `+${card.valueBp / 100}%` : '强化';
}

export class CanvasRenderer {
  private readonly runtime: MiniGameRuntime;
  private readonly context: any;
  private bundle: BattleBundleV1;
  private readonly images: ImageCatalog;
  private cardsById: Map<string, CardDefinition>;
  private interactions: InteractionRegion[] = [];
  private effects: VisualEffect[] = [];
  private entityPositions = new Map<number, DesignPoint>();
  private displayedTowerFacingsU16: TowerAimAnglesU16 = [0, 0, 0];
  private towerFacingsInitialized = false;
  private lastTowerFacingAt = Date.now();
  private lastSnapshotTick = -1;
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
    this.updateViewport();
  }

  async loadAssets(): Promise<void> {
    await this.images.load(ASSET_PATHS);
  }

  setBundle(bundle: BattleBundleV1): void {
    if (this.bundle.stage.id === bundle.stage.id) return;
    this.bundle = bundle;
    this.cardsById = new Map(bundle.cards.map((card) => [card.id, card]));
    this.effects = [];
    this.entityPositions.clear();
    this.displayedTowerFacingsU16 = [0, 0, 0];
    this.towerFacingsInitialized = false;
    this.lastTowerFacingAt = Date.now();
    this.lastSnapshotTick = -1;
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
    return point.y <= 122 || point.y >= 916;
  }

  hitTestTower(point: DesignPoint): TowerId | undefined {
    const radius = Math.max(108, Math.min(132, 40 / Math.max(this.scale, 0.01)));
    let closest: { towerId: TowerId; distanceSquared: number } | undefined;
    this.bundle.route.towerAnchors.forEach((anchor, index) => {
      const deltaX = point.x - anchor.x;
      const deltaY = point.y - anchor.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared > radius * radius) return;
      if (!closest || distanceSquared < closest.distanceSquared) {
        closest = { towerId: index as TowerId, distanceSquared };
      }
    });
    return closest?.towerId;
  }

  pushEvents(events: BattleEvent[], snapshot: RenderSnapshotV1): void {
    const current = new Map(snapshot.entities.map((entity) => [entity.entityId, { x: entity.x, y: entity.y }]));
    const dyingEntityIds = new Set<number>();
    for (const event of events) {
      if (event.type === 'DEATH') dyingEntityIds.add(event.entityId);
    }
    const now = Date.now();
    for (const event of events) {
      if (event.type === 'ATTACK_RELEASE') {
        if (event.towerId >= 0 && event.towerId < this.towerRecoilStartedAt.length) {
          this.towerRecoilStartedAt[event.towerId] = now;
          this.towerReleaseFacingsU16[event.towerId] = event.releaseRotationU16;
        }
        continue;
      }
      if (event.type === 'HIT' && dyingEntityIds.has(event.entityId)) continue;
      const position = 'entityId' in event
        ? current.get(event.entityId) ?? this.entityPositions.get(event.entityId)
        : undefined;
      const fallback = event.type === 'LEVEL_UP'
        ? this.towerCenter()
        : resolveBreachSealPlacement(this.bundle.route);
      const point = event.type === 'BREACH' ? fallback : position ?? fallback;
      const visualPoint = event.type === 'SPAWN'
        ? { x: point.x, y: Math.max(66, point.y) }
        : point;
      const effect: VisualEffect = event.type === 'REVIVED' || event.type === 'VICTORY' || event.type === 'LEVEL_UP'
        ? { ...visualPoint, startedAt: now, duration: 760, color: '#ffd36d', kind: 'revive' }
        : event.type === 'SPAWN'
          ? {
              ...visualPoint,
              startedAt: now,
              duration: 360,
              color: '#5ce5ed',
              kind: 'sprite',
              assetId: 'VFX_SPAWN_PORTAL',
              size: 116,
            }
          : event.type === 'HIT'
            ? {
                ...visualPoint,
                startedAt: now,
                duration: event.critical ? 260 : 210,
                color: event.critical ? '#ffd36d' : '#72ead5',
                kind: 'sprite',
                assetId: event.critical ? 'VFX_CRITICAL_HIT' : 'VFX_NORMAL_HIT',
                size: event.critical ? 112 : 84,
              }
            : event.type === 'DEATH'
              ? {
                  ...visualPoint,
                  startedAt: now,
                  duration: 320,
                  color: '#72ead5',
                  kind: 'sprite',
                  assetId: 'VFX_DEATH_DISSOLVE',
                  size: 126,
                }
              : {
                  ...visualPoint,
                  startedAt: now,
                  duration: 360,
                  color: event.type === 'BREACH' ? '#ff766d' : '#72ead5',
                  kind: 'burst',
                };
      this.effects.push(effect);
    }
    if (this.effects.length > 48) this.effects.splice(0, this.effects.length - 48);
  }

  drawLoading(progress = '正在校验关卡与原创资产…'): void {
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
    this.text(progress, DESIGN_WIDTH / 2, 625, 24, 'rgba(232,245,244,.68)', 'center');
    this.context.fillStyle = 'rgba(255,255,255,.14)';
    this.roundRect(DESIGN_WIDTH / 2 - 180, 675, 360, 8, 4);
    this.context.fill();
  }

  drawHome(state: HomeRenderState): void {
    this.beginFrame();
    this.drawBackground();
    const selectedStage = state.stages.find((stage) => stage.id === state.selectedStageId)
      ?? state.stages[0];
    if (!selectedStage) return;
    const stageNumber = this.stageNumber(selectedStage.id);
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
    this.text('原创海防神话 · 七关战役', 165, 58, 20, '#76dfdb', 'left', 600);
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
      const usesSevenCardRail = state.stages.length >= 7;
      const stageColor = selected ? '#efc56b' : stage.unlocked ? '#5bdad7' : '#536778';
      this.context.fillStyle = selected ? 'rgba(9,29,48,.96)' : 'rgba(5,18,35,.86)';
      this.context.strokeStyle = stageColor;
      this.context.lineWidth = selected ? 3 : 2;
      this.roundRect(x, y, width, height, 20);
      this.context.fill();
      this.context.stroke();
      const nameX = usesSevenCardRail ? x + width / 2 : x + (state.stages.length >= 6 ? 45 : 52);
      const numberY = y + 60;
      this.text(
        this.stageNumber(stage.id),
        x + 11,
        usesSevenCardRail ? y + 23 : numberY,
        usesSevenCardRail ? 13 : 28,
        `${stageColor}80`,
        'left',
        800,
      );
      this.context.save();
      this.context.beginPath();
      this.context.rect(usesSevenCardRail ? x + 8 : nameX - 2, y + 8, usesSevenCardRail ? width - 16 : width - (nameX - x) - 8, height - 16);
      this.context.clip();
      this.text(stage.name, nameX, y + 43, usesSevenCardRail ? 16 : state.stages.length >= 6 ? 17 : 18, stage.unlocked ? '#f3ead6' : '#82909a', usesSevenCardRail ? 'center' : 'left', 700, 10);
      this.text(
        stage.unlocked
          ? (stage.completed ? '已通关 · 可重玩' : HOME_STAGE_META[stage.id].shortStatus)
          : HOME_STAGE_META[stage.id].lockedStatus,
        nameX,
        y + 72,
        usesSevenCardRail ? 12 : 13,
        stageColor,
        usesSevenCardRail ? 'center' : 'left',
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
    this.text('七关独立存档 · 通关逐关解锁', 1800, 1040, 17, 'rgba(230,239,235,.5)', 'right');
  }

  drawBattle(state: BattleRenderState): void {
    this.beginFrame();
    const displayedTowerFacings = this.updateTowerFacings(
      state.snapshot.towerFacingsU16,
      state.snapshot.tick,
    );
    this.drawBackground();
    this.context.fillStyle = 'rgba(2, 10, 25, .20)';
    this.context.fillRect(
      this.viewport.left,
      this.viewport.top,
      this.viewport.width,
      this.viewport.height,
    );
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
    this.drawEffects();
    this.drawHud(state.hud, state.muted, state.selectedTowerId);

    const modalVisible = Boolean(
      state.error ||
      state.victory ||
      state.hud.flowState === 'offer-pending' ||
      state.hud.flowState === 'defeat-pending' ||
      state.hud.flowState === 'paused' ||
      state.hud.flowState === 'performance-paused'
    );
    if (modalVisible) this.interactions = [];

    if (state.error) {
      this.drawErrorOverlay(state.error);
    } else if (state.victory) {
      this.drawVictoryOverlay(state.hud, state.nextStageName);
    } else if (state.hud.flowState === 'offer-pending' && state.hud.activeOffer) {
      this.drawCardOverlay(state.hud.activeOffer.cards);
    } else if (state.hud.flowState === 'defeat-pending') {
      this.drawDefeatOverlay(state.reviveOrdinal);
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
      this.drawBackgroundEdgeShade();
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

  private drawBackgroundExtensions(background: any): void {
    const leftWidth = Math.max(0, -this.viewport.left);
    if (leftWidth > 0) {
      const sourceWidth = Math.min(DESIGN_WIDTH, leftWidth);
      this.context.save();
      this.context.scale(-1, 1);
      this.context.drawImage(
        background,
        0,
        0,
        sourceWidth,
        DESIGN_HEIGHT,
        0,
        0,
        leftWidth,
        DESIGN_HEIGHT,
      );
      this.context.restore();
    }

    const rightWidth = Math.max(0, this.viewport.right - DESIGN_WIDTH);
    if (rightWidth > 0) {
      const sourceWidth = Math.min(DESIGN_WIDTH, rightWidth);
      this.context.save();
      this.context.translate(DESIGN_WIDTH, 0);
      this.context.scale(-1, 1);
      this.context.drawImage(
        background,
        DESIGN_WIDTH - sourceWidth,
        0,
        sourceWidth,
        DESIGN_HEIGHT,
        -rightWidth,
        0,
        rightWidth,
        DESIGN_HEIGHT,
      );
      this.context.restore();
    }

    const topHeight = Math.max(0, -this.viewport.top);
    if (topHeight > 0) {
      const sourceHeight = Math.min(DESIGN_HEIGHT, topHeight);
      this.context.save();
      this.context.scale(1, -1);
      this.context.drawImage(
        background,
        0,
        0,
        DESIGN_WIDTH,
        sourceHeight,
        0,
        0,
        DESIGN_WIDTH,
        topHeight,
      );
      this.context.restore();
    }

    const bottomHeight = Math.max(0, this.viewport.bottom - DESIGN_HEIGHT);
    if (bottomHeight > 0) {
      const sourceHeight = Math.min(DESIGN_HEIGHT, bottomHeight);
      this.context.save();
      this.context.translate(0, DESIGN_HEIGHT);
      this.context.scale(1, -1);
      this.context.drawImage(
        background,
        0,
        DESIGN_HEIGHT - sourceHeight,
        DESIGN_WIDTH,
        sourceHeight,
        0,
        -bottomHeight,
        DESIGN_WIDTH,
        bottomHeight,
      );
      this.context.restore();
    }
  }

  private drawBackgroundEdgeShade(): void {
    if (this.viewport.left < 0) {
      const gradient = this.context.createLinearGradient(this.viewport.left, 0, 0, 0);
      gradient.addColorStop(0, 'rgba(1, 7, 18, .46)');
      gradient.addColorStop(1, 'rgba(1, 7, 18, 0)');
      this.context.fillStyle = gradient;
      this.context.fillRect(
        this.viewport.left,
        this.viewport.top,
        -this.viewport.left,
        this.viewport.height,
      );
    }
    if (this.viewport.right > DESIGN_WIDTH) {
      const gradient = this.context.createLinearGradient(DESIGN_WIDTH, 0, this.viewport.right, 0);
      gradient.addColorStop(0, 'rgba(1, 7, 18, 0)');
      gradient.addColorStop(1, 'rgba(1, 7, 18, .46)');
      this.context.fillStyle = gradient;
      this.context.fillRect(
        DESIGN_WIDTH,
        this.viewport.top,
        this.viewport.right - DESIGN_WIDTH,
        this.viewport.height,
      );
    }
    if (this.viewport.top < 0) {
      const gradient = this.context.createLinearGradient(0, this.viewport.top, 0, 0);
      gradient.addColorStop(0, 'rgba(1, 7, 18, .42)');
      gradient.addColorStop(1, 'rgba(1, 7, 18, 0)');
      this.context.fillStyle = gradient;
      this.context.fillRect(
        this.viewport.left,
        this.viewport.top,
        this.viewport.width,
        -this.viewport.top,
      );
    }
    if (this.viewport.bottom > DESIGN_HEIGHT) {
      const gradient = this.context.createLinearGradient(0, DESIGN_HEIGHT, 0, this.viewport.bottom);
      gradient.addColorStop(0, 'rgba(1, 7, 18, 0)');
      gradient.addColorStop(1, 'rgba(1, 7, 18, .42)');
      this.context.fillStyle = gradient;
      this.context.fillRect(
        this.viewport.left,
        DESIGN_HEIGHT,
        this.viewport.width,
        this.viewport.bottom - DESIGN_HEIGHT,
      );
    }
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
    const pulse = .5 + Math.sin(Date.now() / 420) * .5;
    this.context.save();
    this.context.translate(placement.x, placement.y);

    const aura = this.context.createRadialGradient(0, -10, 8, 0, -10, 126);
    aura.addColorStop(0, theme.glow);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.context.fillStyle = aura;
    this.context.beginPath();
    this.context.ellipse(0, -4, 126, 58, 0, 0, Math.PI * 2);
    this.context.fill();

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
      -59,
      -99,
      118,
      30,
      theme.breachLabel,
      'rgba(3, 14, 29, .90)',
      theme.accent,
      16,
      10,
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
      const selected = towerId === selectedTowerId;
      const recoilElapsed = now - (this.towerRecoilStartedAt[towerId] ?? 0);
      const recoilActive = recoilElapsed >= 0 && recoilElapsed < 150;
      const facingU16 = recoilActive
        ? this.towerReleaseFacingsU16[towerId] ?? anglesU16[towerId]
        : anglesU16[towerId];
      const angle = u16ToRadians(facingU16);
      this.context.save();
      this.context.translate(anchor.x, anchor.y);
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
    if (aimingTowerId === undefined || !point) return;
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
    const depth = (entity: RenderEntityV1) => entity.sortY + (entity.renderKind === 'projectile' ? 30 : 0);
    const ordered = [...entities].sort(
      (left, right) => depth(left) - depth(right) || left.entityId - right.entityId,
    );
    const now = Date.now();
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

  private drawEnemy(entity: RenderEntityV1, now: number): void {
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
    this.context.scale(scale, scale);
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

    if (entity.hpBp >= 9_995 && !isBoss) return;
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

  private drawProjectile(entity: RenderEntityV1, now: number): void {
    const critical = (entity.flags & PROJECTILE_FLAG_CRITICAL) !== 0;
    const penetrating = (entity.flags & PROJECTILE_FLAG_PENETRATION) !== 0;
    const towerId = (entity.flags & PROJECTILE_FLAG_TOWER_ID_MASK) >> PROJECTILE_FLAG_TOWER_ID_SHIFT;
    const palette = PROJECTILE_PALETTES[towerId] ?? PROJECTILE_PALETTES[1];
    const shimmer = .82 + Math.sin(now / 55 + entity.entityId) * .12;
    if (critical) this.context.scale(1.08, 1.08);

    this.context.globalAlpha = shimmer;
    this.context.fillStyle = critical ? 'rgba(255,164,63,.24)' : palette.trail;
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
      const progress = (now - effect.startedAt) / effect.duration;
      if (effect.kind === 'sprite' && effect.assetId) {
        const image = this.images.get(effect.assetId);
        if (image) {
          const frameCount = 8;
          const frame = Math.min(frameCount - 1, Math.floor(progress * frameCount));
          const sourceWidth = 128;
          const size = effect.size ?? 96;
          this.context.save();
          this.context.globalAlpha = Math.min(1, (1 - progress) * 2.6);
          this.context.drawImage(
            image,
            frame * sourceWidth,
            0,
            sourceWidth,
            128,
            effect.x - size / 2,
            effect.y - size / 2,
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

  private drawHud(hud: HudProjectionV1, muted: boolean, selectedTowerId: TowerId): void {
    const theme = BATTLE_STAGE_THEME[this.bundle.stage.id];
    const bottomShade = this.context.createLinearGradient(0, 870, 0, DESIGN_HEIGHT);
    bottomShade.addColorStop(0, 'rgba(2, 9, 21, 0)');
    bottomShade.addColorStop(.22, 'rgba(2, 9, 21, .62)');
    bottomShade.addColorStop(.56, 'rgba(2, 9, 21, .88)');
    bottomShade.addColorStop(1, 'rgba(2, 9, 21, .97)');
    this.context.fillStyle = bottomShade;
    this.context.fillRect(
      this.viewport.left,
      870,
      this.viewport.width,
      this.viewport.bottom - 870,
    );
    const bottomRule = this.context.createLinearGradient(0, 0, DESIGN_WIDTH, 0);
    bottomRule.addColorStop(0, 'rgba(0, 0, 0, 0)');
    bottomRule.addColorStop(.23, theme.accent);
    bottomRule.addColorStop(.77, theme.secondary);
    bottomRule.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.context.save();
    this.context.globalAlpha = .34;
    this.context.fillStyle = bottomRule;
    this.context.fillRect(0, 916, DESIGN_WIDTH, 2);
    this.context.restore();

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
      HOME_STAGE_META[this.bundle.stage.id].hudLabel,
      148,
      59,
      17,
      theme.accent,
      'left',
      600,
    );
    this.text(this.bundle.stage.name, 148, 91, 27, '#f2ead3', 'left', 700);

    this.context.fillStyle = 'rgba(6, 20, 40, .9)';
    this.roundRect(780, 22, 360, 100, 24);
    this.context.fill();
    this.context.save();
    this.context.globalAlpha = .62;
    this.context.strokeStyle = theme.secondary;
    this.context.stroke();
    this.context.restore();
    const currentWave = this.bundle.waves[Math.max(0, hud.waveIndex - 1)];
    const speedMultiplierBp = currentWave?.speedMultiplierBp ?? 10_000;
    const waveLabel = speedMultiplierBp > 10_000
      ? `疾潮 +${Math.round((speedMultiplierBp - 10_000) / 100)}%`
      : '敌潮';
    this.text(waveLabel, 825, 61, 18, theme.accent, 'left', 650);
    this.text(`${Math.max(1, hud.waveIndex)} / ${hud.waveCount}`, 1085, 67, 30, '#f4dfad', 'right', 750);
    this.progressBar(825, 84, 270, 10, hud.progressBp / 10_000, theme.secondary);

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

    this.context.fillStyle = 'rgba(4, 17, 34, .9)';
    this.roundRect(42, 918, 660, 122, 24);
    this.context.fill();
    this.context.save();
    this.context.globalAlpha = .44;
    this.context.strokeStyle = theme.accent;
    this.context.stroke();
    this.context.restore();
    this.drawSeal(104, 978, 43, String(hud.level));
    this.text('境界', 164, 962, 17, theme.accent, 'left', 600);
    this.text(`${hud.exp} / ${hud.expRequired}`, 650, 972, 20, '#f2e8ce', 'right', 600);
    this.progressBar(164, 992, 486, 13, hud.expRequired ? hud.exp / hud.expRequired : 0, theme.accent);
    this.text('累计伤害', 1440, 965, 18, 'rgba(230,240,237,.62)', 'right');
    this.text(compactDamage(hud.damageDealtMilli), 1830, 1005, 36, theme.secondary, 'right', 750);
    this.text(
      `三塔自动索敌 · 已选 ${selectedTowerId + 1} 号塔 · 拖动调整优先方向`,
      960,
      1020,
      24,
      'rgba(230,245,241,.82)',
      'center',
      600,
      11,
    );
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

  private drawCardOverlay(cardIds: [string, string, string]): void {
    this.drawModalShade();
    this.text('境界突破', 960, 112, 26, '#74dfdb', 'center', 600, 12, CARD_BODY_FONT);
    this.text('择一法门，守住关城', 960, 170, 48, '#f4e6c4', 'center', 700, 17, CARD_SERIF_FONT);
    this.text('强化会立即作用于三座箭塔', 960, 216, 25, 'rgba(231,241,237,.72)', 'center', 400, 12, CARD_BODY_FONT);
    const { cardWidth, cardHeight, cardY, starts } = resolveCardOverlayLayout(this.viewport);
    cardIds.forEach((cardId, index) => {
      const card = this.cardsById.get(cardId);
      if (!card) return;
      const x = starts[index] ?? 230;
      const color = QUALITY_COLOR[card.quality];

      const cardBackground = this.context.createLinearGradient(x, cardY, x + cardWidth, cardY + cardHeight);
      cardBackground.addColorStop(0, `${color}24`);
      cardBackground.addColorStop(.38, 'rgba(7, 24, 43, .98)');
      cardBackground.addColorStop(1, 'rgba(3, 14, 29, .99)');
      this.context.save();
      this.context.shadowColor = `${color}38`;
      this.context.shadowBlur = 24;
      this.context.fillStyle = cardBackground;
      this.context.strokeStyle = color;
      this.context.lineWidth = 3;
      this.roundRect(x, cardY, cardWidth, cardHeight, 24);
      this.context.fill();
      this.context.stroke();
      this.context.restore();

      this.context.strokeStyle = `${color}52`;
      this.context.lineWidth = 1.5;
      this.roundRect(x + 11, cardY + 11, cardWidth - 22, cardHeight - 22, 17);
      this.context.stroke();

      this.text(`0${index + 1}`, x + 30, cardY + 50, 22, 'rgba(235,241,232,.52)', 'left', 600, 12, CARD_NUMBER_FONT);
      this.pill(
        x + cardWidth - 140,
        cardY + 20,
        110,
        42,
        QUALITY_NAME[card.quality],
        `${color}24`,
        color,
        20,
        13,
      );

      const iconGlow = this.context.createRadialGradient(
        x + cardWidth / 2,
        cardY + 150,
        12,
        x + cardWidth / 2,
        cardY + 150,
        78,
      );
      iconGlow.addColorStop(0, `${color}3d`);
      iconGlow.addColorStop(1, `${color}00`);
      this.context.fillStyle = iconGlow;
      this.context.beginPath();
      this.context.arc(x + cardWidth / 2, cardY + 150, 78, 0, Math.PI * 2);
      this.context.fill();

      const icon = this.images.get(card.iconAssetId);
      if (icon) this.context.drawImage(icon, x + (cardWidth - 112) / 2, cardY + 94, 112, 112);
      else this.drawSeal(x + cardWidth / 2, cardY + 146, 54, '法');

      this.text(card.name, x + cardWidth / 2, cardY + 258, 38, '#f4ead3', 'center', 700, 18, CARD_SERIF_FONT);

      const rule = this.context.createLinearGradient(x + 70, 0, x + cardWidth - 70, 0);
      rule.addColorStop(0, `${color}00`);
      rule.addColorStop(.5, `${color}b3`);
      rule.addColorStop(1, `${color}00`);
      this.context.fillStyle = rule;
      this.context.fillRect(x + 70, cardY + 284, cardWidth - 140, 2);

      this.text(cardAmount(card), x + cardWidth / 2, cardY + 354, 48, color, 'center', 720, 22, CARD_NUMBER_FONT);
      this.wrapText(
        cardDescription(card),
        x + cardWidth / 2,
        cardY + 410,
        cardWidth - 84,
        34,
        24,
        'rgba(224,240,234,.72)',
        450,
        15,
        2,
        CARD_BODY_FONT,
      );

      const choiceWidth = 250;
      const choiceHeight = 50;
      const choiceX = x + (cardWidth - choiceWidth) / 2;
      const choiceY = cardY + 488;
      this.context.fillStyle = `${color}18`;
      this.context.strokeStyle = `${color}70`;
      this.context.lineWidth = 1.5;
      this.roundRect(choiceX, choiceY, choiceWidth, choiceHeight, choiceHeight / 2);
      this.context.fill();
      this.context.stroke();
      this.text(
        '选择此法门',
        x + cardWidth / 2,
        choiceY + 32,
        22,
        color,
        'center',
        650,
        15,
        CARD_BODY_FONT,
      );
      this.interactions.push({ id: `card:${card.id}`, x, y: cardY, width: cardWidth, height: cardHeight });
    });
    const rerollWidth = Math.min(480, 400 + Math.max(0, this.viewport.width - DESIGN_WIDTH) / 6);
    this.drawButton(
      'card-reroll',
      960 - rerollWidth / 2,
      858,
      rerollWidth,
      68,
      '↻  重抽一次 · 练习免费',
      'rgba(8,28,46,.88)',
      'rgba(235,240,228,.82)',
      'rgba(88,174,245,.42)',
      24,
      15,
    );
  }

  private drawPauseOverlay(): void {
    this.drawModalShade();
    this.drawPanel(660, 240, 600, 600, '#62d8d3');
    this.drawSeal(960, 370, 68, 'Ⅱ');
    this.text('潮声暂歇', 960, 474, 21, '#6fded9', 'center', 650);
    this.text('战斗已暂停', 960, 536, 48, '#f2e7cb', 'center', 800);
    this.drawButton('overlay-resume', 770, 620, 380, 76, '继续守关', '#d0a24d', '#07152a');
    this.drawButton('overlay-exit', 820, 724, 280, 64, '返回关城', 'rgba(255,255,255,.06)', '#e6eee8', '#5b7384');
  }

  private drawDefeatOverlay(reviveOrdinal?: number): void {
    this.drawModalShade('rgba(34, 5, 12, .70)');
    this.drawPanel(625, 205, 670, 680, '#ef765f');
    this.drawSeal(960, 337, 72, '关', '#7b2631', '#f2be7b');
    this.text('一名潮军越过了守线', 960, 456, 21, '#f08a78', 'center', 650);
    this.text('关门告急', 960, 522, 50, '#f7e4ca', 'center', 800);
    const canRevive = reviveOrdinal !== undefined && reviveOrdinal <= this.bundle.rules.maxRevives;
    this.wrapText(
      canRevive
        ? `可发动第 ${reviveOrdinal} 次重燃，击退地面敌人并获得短暂保护。`
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
    }
    this.drawButton('overlay-exit', 820, 802, 280, 58, '结束试炼', 'rgba(255,255,255,.05)', '#eee3d6', '#77504e');
  }

  private drawVictoryOverlay(hud: HudProjectionV1, nextStageName?: string): void {
    this.drawModalShade('rgba(1, 7, 15, .72)');
    this.drawVictoryPanel();
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
  ): void {
    const resolvedSize = this.resolveFontSize(size, minScreenPx);
    this.context.fillStyle = color;
    this.context.font = `${resolveCanvasFontWeight(weight)} ${resolvedSize}px ${fontFamily}`;
    this.context.textAlign = align;
    this.context.textBaseline = 'alphabetic';
    this.context.fillText(value, x, y);
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
    return String(BATTLE_STAGE_ORDER.indexOf(stageId) + 1).padStart(2, '0');
  }
}
