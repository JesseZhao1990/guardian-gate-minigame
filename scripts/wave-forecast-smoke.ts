import { STAGE_BUNDLES } from '../src/core/content';
import { createWaveForecast } from '../src/core/wave-forecast';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const first = createWaveForecast(STAGE_BUNDLES.STAGE_01, 0);
assert(first, 'Fixed campaign stage must expose a first-wave forecast.');
assert(first.waveIndex === 1, 'Forecast must use one-based display wave indexes.');
assert(first.waveCount === 5, 'Forecast must expose the authored wave count.');
assert(first.totalEnemies > 0, 'Forecast must count actual authored enemy groups.');
assert(first.enemies.length > 0, 'Forecast must include enemy composition.');
assert(first.headline.includes(String(first.totalEnemies)), 'Headline must include total enemy count.');
assert(!first.threatTags.includes('boss'), 'An ordinary opening wave must not be mislabeled as a boss wave.');

const last = createWaveForecast(STAGE_BUNDLES.STAGE_07, 4);
assert(last, 'Late campaign boss wave must expose a forecast.');
assert(last.waveIndex === 5, 'Late forecast must identify the fifth wave.');
assert(last.threatTags.length > 0, 'Late forecast must expose at least one authored threat mechanic.');
assert(last.threatTags.includes('boss'), 'The final campaign wave must warn about its boss unit.');
assert(
  last.threatTags.includes('fast'),
  'Threat tags must use the authored wave speed multiplier, not only base enemy speed.',
);

assert(
  createWaveForecast(STAGE_BUNDLES.STAGE_08, 0) === undefined,
  'Endless leaderboard stage must retain its separate threat scheduler contract.',
);
assert(
  createWaveForecast(STAGE_BUNDLES.STAGE_01, 99) === undefined,
  'Missing authored waves must not fabricate a forecast.',
);

console.log('✓ 波前预告与真实刷怪配置同源，且无尽关保持隔离');
