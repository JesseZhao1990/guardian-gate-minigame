import { resolveStageBundleForSeed, STAGE_BUNDLES } from '../src/core/content';
import type { BattleBundleV1, RenderEntityV1 } from '../src/core/contracts';
import {
  ImageCatalog,
  type MiniGameRuntime,
} from '../src/platform/wechat';
import {
  CanvasRenderer,
  ENEMY_VISUAL_ASSET_IDS,
} from '../src/render/CanvasRenderer';
import { collectReachableEnemyIds } from '../src/render/asset-contract';

const assert = {
  equal(actual: unknown, expected: unknown, message: string): void {
    if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  },
  deepEqual(actual: unknown, expected: unknown, message: string): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
    }
  },
  ok(value: unknown, message: string): void {
    if (!value) throw new Error(message);
  },
  async rejects(promise: Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
    try {
      await promise;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (pattern.test(detail)) return;
      throw new Error(`${message}: unexpected error ${detail}`);
    }
    throw new Error(`${message}: promise resolved`);
  },
};

interface FakeImage {
  onload?: (() => void) | null;
  onerror?: ((event: unknown) => void) | null;
  path?: string;
  src?: string;
}

interface DrawImageCall {
  image: FakeImage;
  args: unknown[];
}

function createFakeCanvas(loadedPaths: string[], createdImages: FakeImage[]): any {
  return {
    createImage(): FakeImage {
      const image: FakeImage = {};
      Object.defineProperty(image, 'src', {
        set(path: string) {
          image.path = path;
          loadedPaths.push(path);
          queueMicrotask(() => image.onload?.());
        },
      });
      createdImages.push(image);
      return image;
    },
  };
}

function createCanvasContextSpy(drawImageCalls: DrawImageCall[]): any {
  const noOp = () => undefined;
  const createGradient = () => ({ addColorStop: noOp });
  const context: Record<PropertyKey, unknown> = {
    createLinearGradient: createGradient,
    createRadialGradient: createGradient,
    drawImage(image: FakeImage, ...args: unknown[]) {
      drawImageCalls.push({ image, args });
    },
    measureText(text: string) {
      return { width: [...String(text)].length * 8 };
    },
  };
  return new Proxy(context, {
    get(target, property) {
      return property in target ? target[property] : noOp;
    },
  });
}

async function main(): Promise<void> {
  const dedupPaths: string[] = [];
  const dedupImages: FakeImage[] = [];
  const catalog = new ImageCatalog(createFakeCanvas(dedupPaths, dedupImages));
  await catalog.load({ FIRST: 'assets/shared.png', SECOND: 'assets/shared.png' });
  assert.equal(dedupImages.length, 1, '同一物理路径应只创建一个 Image');
  assert.equal(catalog.get('FIRST'), catalog.get('SECOND'), '多个 assetId 应共享同一图片实例');
  catalog.unload(['FIRST']);
  assert.ok(catalog.has('SECOND'), '释放一个 assetId 不应破坏同路径的其他引用');
  catalog.unload(['SECOND']);
  await catalog.load({ THIRD: 'assets/shared.png' });
  assert.equal(dedupImages.length, 2, '全部引用释放后应允许重新创建图片');

  const packageCalls: string[] = [];
  const predownloadCalls: string[] = [];
  let failStage03Once = true;
  (globalThis as typeof globalThis & { wx: any }).wx = {
    loadSubpackage(options: {
      name: string;
      success?: () => void;
      fail?: (result: { errMsg?: string }) => void;
    }) {
      packageCalls.push(options.name);
      let progressListener: ((update: { progress: number }) => void) | undefined;
      queueMicrotask(() => {
        progressListener?.({ progress: 50 });
        if (options.name === 'stage-03' && failStage03Once) {
          failStage03Once = false;
          options.fail?.({ errMsg: 'mock network failure' });
        } else {
          options.success?.();
        }
      });
      return {
        onProgressUpdate(listener: (update: { progress: number }) => void) {
          progressListener = listener;
        },
      };
    },
    preDownloadSubpackage(options: { name: string; success?: () => void }) {
      predownloadCalls.push(options.name);
      queueMicrotask(() => options.success?.());
      return { onProgressUpdate() {} };
    },
  };

  const rendererPaths: string[] = [];
  const rendererImages: FakeImage[] = [];
  const drawImageCalls: DrawImageCall[] = [];
  const runtime: MiniGameRuntime = {
    canvas: createFakeCanvas(rendererPaths, rendererImages),
    context: createCanvasContextSpy(drawImageCalls),
    resize: () => ({
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      safeArea: { left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 },
    }),
    size: () => ({
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      safeArea: { left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 },
    }),
    requestFrame: () => 1,
    cancelFrame: () => undefined,
  };
  const renderer = new CanvasRenderer(runtime, STAGE_BUNDLES.STAGE_01);
  await renderer.loadAssets();
  assert.ok(renderer.isStageAssetsLoaded('STAGE_01'), '主包加载后第一关应可用');
  assert.ok(
    rendererPaths.includes('assets/stage-01/enemies/MON_DRAGON_TORTOISE.png'),
    '玄甲龙鳌应随主包加载，供第一至第三关共享',
  );
  assert.equal(
    rendererPaths.includes('packages/stage-03/assets/stage-03/enemies/MON_DRAGON_TORTOISE.png'),
    false,
    '玄甲龙鳌不得再从 Stage 03 分包路径加载',
  );

  for (const [stageId, bundle] of Object.entries(STAGE_BUNDLES)) {
    const swiftEel = bundle.enemies.MON_SWIFT_EEL;
    if (swiftEel) {
      assert.equal(
        swiftEel.renderAssetId,
        'MON_SWIFT_EEL',
        `${stageId} 迅潮鳗不得误用无尽飞鳗素材`,
      );
    }
  }
  assert.equal(
    STAGE_BUNDLES.STAGE_08.enemies.MON_ABYSS_FLYING_EEL?.renderAssetId,
    'MON_ABYSS_FLYING_EEL',
    '无尽渊翼飞鳗必须使用自己的独立素材',
  );

  const reachableRenderAssetIds = new Set<string>();
  for (const bundle of Object.values(STAGE_BUNDLES)) {
    for (const enemyId of collectReachableEnemyIds(bundle)) {
      const enemy = bundle.enemies[enemyId];
      if (!enemy) throw new Error(`${bundle.stage.id} 可达敌人 ${enemyId} 缺少定义`);
      reachableRenderAssetIds.add(enemy.renderAssetId);
    }
  }
  assert.deepEqual(
    [...reachableRenderAssetIds].sort(),
    [...ENEMY_VISUAL_ASSET_IDS],
    '全部且仅有可达敌人素材必须具备 ENEMY_VISUALS 渲染描述',
  );

  const projectile: RenderEntityV1 = {
    entityId: 1,
    renderKind: 'projectile',
    assetId: 'projectile:basic-arrow',
    x: 0,
    y: 0,
    rotationU16: 0,
    scaleBp: 10_000,
    sortY: 0,
    hpBp: 10_000,
    flags: 0,
  };
  const drawProjectile = (
    renderer as unknown as {
      drawProjectile(entity: RenderEntityV1, now: number): void;
    }
  ).drawProjectile.bind(renderer);
  const projectileCallOffset = drawImageCalls.length;
  drawProjectile(projectile, 1_000);
  const projectileDraws = drawImageCalls.slice(projectileCallOffset);
  const projectileBodyDraws = projectileDraws.filter(
    ({ image }) => image.path === 'assets/stage-01/projectiles/PROJECTILE_BASIC_ARROW.png',
  );
  assert.equal(projectileBodyDraws.length, 1, '普通飞行箭矢主体必须且只能绘制一次正式箭矢图片');
  assert.equal(
    projectileBodyDraws[0]?.image.path,
    'assets/stage-01/projectiles/PROJECTILE_BASIC_ARROW.png',
    '飞行箭矢主体必须实际 drawImage(projectile:basic-arrow)',
  );
  assert.deepEqual(
    projectileBodyDraws[0]?.args,
    [-48, -12, 96, 24],
    '飞行箭矢主体应按正式 4:1 资产比例绘制',
  );

  const missingEnemyAssetBundle = structuredClone(STAGE_BUNDLES.STAGE_01);
  const firstReachableEnemyId = missingEnemyAssetBundle.waves[0]?.groups[0]?.enemyId;
  if (!firstReachableEnemyId) throw new Error('第一关测试波次缺少敌人');
  const firstReachableEnemy = missingEnemyAssetBundle.enemies[firstReachableEnemyId];
  if (!firstReachableEnemy) throw new Error('第一关测试敌人定义缺失');
  firstReachableEnemy.renderAssetId = 'MON_MISSING_FORMAL_ASSET';
  await assert.rejects(
    renderer.loadStageAssets('STAGE_01', undefined, missingEnemyAssetBundle),
    /资源契约缺失.*MON_MISSING_FORMAL_ASSET/,
    '可达敌人缺少正式素材时不得被已加载主包静默掩盖',
  );

  const missingCardIconBundle = structuredClone(STAGE_BUNDLES.STAGE_01);
  const firstCard = missingCardIconBundle.cards[0];
  if (!firstCard) throw new Error('第一关测试卡牌缺失');
  firstCard.iconAssetId = 'MOD_MISSING_FORMAL_ICON';
  await assert.rejects(
    renderer.loadStageAssets('STAGE_01', undefined, missingCardIconBundle),
    /资源契约缺失.*MOD_MISSING_FORMAL_ICON/,
    '卡牌缺少正式图标时不得被已加载主包静默掩盖',
  );

  const missingEndlessSummonBundle = structuredClone(STAGE_BUNDLES.STAGE_08);
  if (!missingEndlessSummonBundle.endless) throw new Error('无尽关测试配置缺失');
  missingEndlessSummonBundle.endless.bossSummonEnemyId = 'MON_MISSING_SUMMON';
  await assert.rejects(
    renderer.loadStageAssets('STAGE_08', undefined, missingEndlessSummonBundle),
    /可达敌人 MON_MISSING_SUMMON 缺少定义/,
    '无尽 Boss 召唤敌人也必须进入资源闭环',
  );

  await assert.rejects(
    renderer.loadStageAssets('STAGE_03', undefined, STAGE_BUNDLES.STAGE_03),
    /mock network failure/,
    '分包失败应向上抛出明确错误',
  );
  assert.equal(
    renderer.isStageAssetsLoaded('STAGE_03', STAGE_BUNDLES.STAGE_03),
    false,
    '失败分包不能被标记为已加载',
  );

  const progress: number[] = [];
  await renderer.loadStageAssets(
    'STAGE_03',
    (value) => progress.push(value),
    STAGE_BUNDLES.STAGE_03,
  );
  assert.deepEqual(packageCalls, ['stage-03', 'stage-03'], '失败的分包 Promise 应清除并允许重试');
  assert.ok(progress.some((value) => value > 0 && value < 1), '应向 UI 透传中间加载进度');
  assert.equal(progress.at(-1), 1, '必需图片加载完成后才能报告 100%');
  assert.ok(
    renderer.isStageAssetsLoaded('STAGE_03', STAGE_BUNDLES.STAGE_03),
    '分包与必需图片完成后关卡应可用',
  );
  assert.ok(
    rendererPaths.includes('packages/stage-03/assets/stage-03/background/STAGE_03_BACKGROUND.jpg'),
    '运行时应使用分包内的关卡背景路径',
  );

  renderer.releaseStageAssets('STAGE_03');
  assert.equal(
    renderer.isStageAssetsLoaded('STAGE_03', STAGE_BUNDLES.STAGE_03),
    false,
    '释放后关卡专属图片应不再常驻',
  );
  assert.ok(renderer.isStageAssetsLoaded('STAGE_01'), '释放后关不能影响主包共享图片');

  await renderer.loadStageAssets('STAGE_02', undefined, STAGE_BUNDLES.STAGE_02);
  assert.equal(packageCalls.at(-1), 'stage-02', '第二关应只加载自己的背景分包');
  assert.ok(
    renderer.isStageAssetsLoaded('STAGE_02', STAGE_BUNDLES.STAGE_02),
    '第二关背景与共享玄甲龙鳌完成后应可用',
  );
  renderer.releaseStageAssets('STAGE_02');

  await renderer.preloadStageAssets('STAGE_04');
  assert.deepEqual(predownloadCalls, ['stage-04'], '应使用普通分包预下载下一关');
  assert.equal(renderer.isStageAssetsLoaded('STAGE_04'), false, '仅预下载不能误判为图片已可用');

  await renderer.loadStageAssets('STAGE_08', undefined, STAGE_BUNDLES.STAGE_08);
  assert.equal(packageCalls.at(-1), 'stage-08', '无尽关应只加载 stage-08 普通分包');
  assert.ok(
    renderer.isStageAssetsLoaded('STAGE_08', STAGE_BUNDLES.STAGE_08),
    '无尽背景与深渊龙王加载后关卡应可用',
  );
  assert.ok(
    rendererPaths.includes('packages/stage-08/assets/stage-08/background/STAGE_08_BACKGROUND.jpg'),
    '无尽关应使用 stage-08 分包背景',
  );
  assert.ok(
    rendererPaths.includes('packages/stage-08/assets/stage-08/enemies/BOSS_ABYSS_DRAGON.png'),
    '深渊龙王应使用 stage-08 分包独立素材',
  );
  renderer.releaseStageAssets('STAGE_08');
  assert.equal(
    renderer.isStageAssetsLoaded('STAGE_08', STAGE_BUNDLES.STAGE_08),
    false,
    '离开无尽关后应释放关卡专属图片',
  );

  const endlessBundles: BattleBundleV1[] = [];
  for (let seed = 1; seed <= 64 && endlessBundles.length < 2; seed += 1) {
    const candidate = resolveStageBundleForSeed('STAGE_08', seed);
    if (!endlessBundles.some((bundle) => bundle.route.id === candidate.route.id)) {
      endlessBundles.push(candidate);
    }
  }
  assert.equal(endlessBundles.length, 2, '测试 Seed 应能解析出两条不同无尽路线');
  const firstEndless = endlessBundles[0];
  const secondEndless = endlessBundles[1];
  if (!firstEndless || !secondEndless) throw new Error('无尽路线测试数据缺失');
  renderer.setBundle(firstEndless);
  renderer.setBundle(secondEndless);
  const renderedBundle = (renderer as unknown as { bundle: BattleBundleV1 }).bundle;
  assert.equal(renderedBundle.route.id, secondEndless.route.id, '同 Stage08 切换 Seed 后必须刷新具体路线');

  console.log('✓ 分包加载失败可重试、进度可观测且关卡资源可释放');
  console.log('✓ 图片按物理路径去重，预下载不会误标记为已加载');
  console.log('✓ 迅潮鳗与渊翼飞鳗资产 ID 未对调，全部可达敌人均有渲染描述');
  console.log('✓ 飞行箭矢主体实际 drawImage(projectile:basic-arrow)，不再由程序化形状冒充');
  console.log('✓ Stage01–03 玄甲龙鳌统一走共享主包路径，Stage03 分包不再重复加载');
  console.log('✓ 固定波次、无尽召唤与卡牌图标缺少正式资产时会被资源契约阻断');
  console.log('✓ Stage08 分包独立加载/释放，同关不同 Seed 路线刷新通过');
}

void main();
