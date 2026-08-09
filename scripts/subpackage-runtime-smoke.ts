import { resolveStageBundleForSeed, STAGE_BUNDLES } from '../src/core/content';
import type { BattleBundleV1 } from '../src/core/contracts';
import {
  ImageCatalog,
  type MiniGameRuntime,
} from '../src/platform/wechat';
import { CanvasRenderer } from '../src/render/CanvasRenderer';

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
  src?: string;
}

function createFakeCanvas(loadedPaths: string[], createdImages: FakeImage[]): any {
  return {
    createImage(): FakeImage {
      const image: FakeImage = {};
      Object.defineProperty(image, 'src', {
        set(path: string) {
          loadedPaths.push(path);
          queueMicrotask(() => image.onload?.());
        },
      });
      createdImages.push(image);
      return image;
    },
  };
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
  const runtime: MiniGameRuntime = {
    canvas: createFakeCanvas(rendererPaths, rendererImages),
    context: {},
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

  await assert.rejects(
    renderer.loadStageAssets('STAGE_03'),
    /mock network failure/,
    '分包失败应向上抛出明确错误',
  );
  assert.equal(renderer.isStageAssetsLoaded('STAGE_03'), false, '失败分包不能被标记为已加载');

  const progress: number[] = [];
  await renderer.loadStageAssets('STAGE_03', (value) => progress.push(value));
  assert.deepEqual(packageCalls, ['stage-03', 'stage-03'], '失败的分包 Promise 应清除并允许重试');
  assert.ok(progress.some((value) => value > 0 && value < 1), '应向 UI 透传中间加载进度');
  assert.equal(progress.at(-1), 1, '必需图片加载完成后才能报告 100%');
  assert.ok(renderer.isStageAssetsLoaded('STAGE_03'), '分包与必需图片完成后关卡应可用');
  assert.ok(
    rendererPaths.includes('packages/stage-03/assets/stage-03/background/STAGE_03_BACKGROUND.jpg'),
    '运行时应使用分包内的关卡背景路径',
  );

  renderer.releaseStageAssets('STAGE_03');
  assert.equal(renderer.isStageAssetsLoaded('STAGE_03'), false, '释放后关卡专属图片应不再常驻');
  assert.ok(renderer.isStageAssetsLoaded('STAGE_01'), '释放后关不能影响主包共享图片');

  await renderer.preloadStageAssets('STAGE_04');
  assert.deepEqual(predownloadCalls, ['stage-04'], '应使用普通分包预下载下一关');
  assert.equal(renderer.isStageAssetsLoaded('STAGE_04'), false, '仅预下载不能误判为图片已可用');

  await renderer.loadStageAssets('STAGE_08');
  assert.equal(packageCalls.at(-1), 'stage-08', '无尽关应只加载 stage-08 普通分包');
  assert.ok(renderer.isStageAssetsLoaded('STAGE_08'), '无尽背景与深渊龙王加载后关卡应可用');
  assert.ok(
    rendererPaths.includes('packages/stage-08/assets/stage-08/background/STAGE_08_BACKGROUND.jpg'),
    '无尽关应使用 stage-08 分包背景',
  );
  assert.ok(
    rendererPaths.includes('packages/stage-08/assets/stage-08/enemies/BOSS_ABYSS_DRAGON.png'),
    '深渊龙王应使用 stage-08 分包独立素材',
  );
  renderer.releaseStageAssets('STAGE_08');
  assert.equal(renderer.isStageAssetsLoaded('STAGE_08'), false, '离开无尽关后应释放关卡专属图片');

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
  console.log('✓ Stage08 分包独立加载/释放，同关不同 Seed 路线刷新通过');
}

void main();
