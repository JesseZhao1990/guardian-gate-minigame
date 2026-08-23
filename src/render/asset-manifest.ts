import type { BattleStageId } from '../core/contracts';

export const MAIN_PACKAGE_ASSET_PATHS: Readonly<Record<string, string>> = {
  STAGE_01_BACKGROUND: 'assets/stage-01/background/STAGE_01_BACKGROUND.jpg',
  MON_SWIFT_EEL: 'assets/stage-01/enemies/MON_SWIFT_EEL_BATTLE_V2.png',
  MON_TIDE_IMP: 'assets/stage-01/enemies/MON_TIDE_IMP_BATTLE_V2.png',
  MON_SHELL_CRAB: 'assets/stage-01/enemies/MON_SHELL_CRAB_BATTLE_V2.png',
  MON_REEF_GUARD: 'assets/stage-01/enemies/MON_REEF_GUARD.png',
  MON_DRAGON_TORTOISE: 'assets/stage-01/enemies/MON_DRAGON_TORTOISE.png',
  MON_ABYSS_SCALE_GUARD: 'assets/stage-01/enemies/MON_ABYSS_SCALE_GUARD.png',
  MON_SOLAR_FORMATION_PRIEST: 'assets/stage-01/enemies/MON_SOLAR_FORMATION_PRIEST.png',
  MON_PHASE_SHELL_WEAVER: 'assets/stage-01/enemies/MON_PHASE_SHELL_WEAVER.png',
  MON_ETHEREAL_WALKER: 'assets/stage-01/enemies/MON_ETHEREAL_WALKER.png',
  TOWER_SOLAR_BASE: 'assets/stage-01/towers/TOWER_SOLAR_BASE_V2.png',
  TOWER_SOLAR_HEAD: 'assets/stage-01/towers/TOWER_SOLAR_HEAD_V2.png',
  TOWER_FROST_BASE: 'assets/stage-01/towers/TOWER_FROST_BASE_V2.png',
  TOWER_FROST_HEAD: 'assets/stage-01/towers/TOWER_FROST_HEAD_V2.png',
  TOWER_STORM_BASE: 'assets/stage-01/towers/TOWER_STORM_BASE_V2.png',
  TOWER_STORM_HEAD: 'assets/stage-01/towers/TOWER_STORM_HEAD_V2.png',
  TOWER_CORAL_BASE: 'assets/stage-01/towers/TOWER_CORAL_BASE_V1.png',
  TOWER_CORAL_HEAD: 'assets/stage-01/towers/TOWER_CORAL_HEAD_V1.png',
  'projectile:basic-arrow': 'assets/stage-01/projectiles/PROJECTILE_BASIC_ARROW.png',
  MOD_DAMAGE: 'assets/stage-01/ui/icons/MOD_DAMAGE.png',
  MOD_FREQUENCY: 'assets/stage-01/ui/icons/MOD_FREQUENCY.png',
  MOD_ARROW_COUNT: 'assets/stage-01/ui/icons/MOD_ARROW_COUNT.png',
  MOD_PENETRATION: 'assets/stage-01/ui/icons/MOD_PENETRATION.png',
  MOD_CRIT_RATE: 'assets/stage-01/ui/icons/MOD_CRIT_RATE.png',
  MOD_CRIT_DAMAGE: 'assets/stage-01/ui/icons/MOD_CRIT_DAMAGE.png',
  MOD_CRITICAL_MASTERY: 'assets/stage-01/ui/icons/MOD_CRITICAL_MASTERY.png',
  MOD_TOWER_REINFORCEMENT: 'assets/stage-01/ui/icons/MOD_TOWER_REINFORCEMENT.png',
  ICON_PAUSE: 'assets/stage-01/ui/icons/ICON_PAUSE.png',
  ICON_PLAY: 'assets/stage-01/ui/icons/ICON_PLAY.png',
  ICON_SPEED_1X: 'assets/stage-01/ui/icons/ICON_SPEED_1X.png',
  ICON_SPEED_2X: 'assets/stage-01/ui/icons/ICON_SPEED_2X.png',
  VFX_SPAWN_PORTAL: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__SPAWN_PORTAL.png',
  VFX_NORMAL_HIT: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__NORMAL_HIT.png',
  VFX_CRITICAL_HIT: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__CRITICAL_HIT.png',
  VFX_DEATH_DISSOLVE: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__DEATH_DISSOLVE.png',
  VFX_ARMOR_HIT: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__ARMOR_HIT.png',
  VFX_ARROW_TRAIL: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__ARROW_TRAIL.png',
  VFX_MULTISHOT_VOLLEY: 'assets/stage-01/vfx/VFX_BASIC_COMBAT__MULTISHOT_VOLLEY.png',
  VFX_BREACH: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__BREACH_V2.png',
  VFX_DEFEAT: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__DEFEAT.png',
  VFX_LEVEL_UP: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__LEVEL_UP_V2.png',
  VFX_REVIVE: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__REVIVE_V2.png',
  VFX_VICTORY: 'assets/stage-01/vfx/VFX_BATTLE_SYSTEM_SET__VICTORY_V2.png',
  VFX_REVIVE_PROTECT: 'assets/stage-01/vfx/VFX_STATUS_SET__REVIVE_PROTECT.png',
};

export interface StageAssetManifest {
  packageName?: string;
  entries: Readonly<Record<string, string>>;
}

export const STAGE_ASSET_MANIFESTS: Readonly<Record<BattleStageId, StageAssetManifest>> = {
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
      MON_ABYSS_FLYING_EEL: 'packages/stage-08/assets/stage-08/enemies/MON_ABYSS_FLYING_EEL.png',
    },
  },
};
