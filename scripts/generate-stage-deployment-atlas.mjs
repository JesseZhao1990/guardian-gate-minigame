import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'scripts', 'tower-layout-guide-candidates.json');
const OUTPUT_DIR = join(ROOT, 'docs', 'design', 'stage-deployment-guides');
const MOBILE_PREVIEW_DIR = join(OUTPUT_DIR, 'mobile-preview');
const TEMP_DIR = join(ROOT, '.tmp', 'stage-deployment-atlas');
const TEMP_BUNDLE = join(TEMP_DIR, 'runtime.cjs');
const FFMPEG = process.env.FFMPEG_PATH || '/Users/bytedance/.local/bin/ffmpeg';

const IMAGE_WIDTH = 3_200;
const IMAGE_HEIGHT = 1_440;
const WORLD_RECT = { x: -640, y: -60, width: IMAGE_WIDTH, height: IMAGE_HEIGHT };
const ROUTE_COLORS = ['#ffd166', '#ff6bd6', '#63e6ff'];
const CURRENT_COLOR = '#ffd166';
const RESERVE_COLOR = '#65e8ff';
const ENTRY_COLOR = '#6dffad';
const BREACH_COLOR = '#ff557f';

// The runtime anchor is the tower sprite origin, while a few painted platforms use
// a perspective-shifted visible deck. These offsets affect the explanatory halo
// only; runtime coordinates, route checks, and manifest world points stay unchanged.
const PLATFORM_ART_OFFSETS = {
  STAGE_05: {
    T1: { x: 0, y: 48 },
    T3: { x: 0, y: 45 },
  },
  STAGE_06: {
    T4: { x: 52, y: 72 },
  },
  STAGE_07: {
    T6: { x: 78, y: -58 },
  },
};

const STAGE_ORDINALS = {
  STAGE_01: '第一关',
  STAGE_02: '第二关',
  STAGE_03: '第三关',
  STAGE_04: '第四关',
  STAGE_05: '第五关',
  STAGE_06: '第六关',
  STAGE_07: '第七关',
  STAGE_08: '第八关',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${String(result.status)}): ${String(result.stderr ?? '')}`);
  }
  return result;
}

function loadRuntimeContracts() {
  mkdirSync(TEMP_DIR, { recursive: true });
  buildSync({
    stdin: {
      contents: [
        "export { STAGE_BUNDLES } from './src/core/content';",
        "export { BATTLE_BACKGROUND_WORLD_RECT } from './src/render/CanvasRenderer';",
      ].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'stage-deployment-atlas-runtime.ts',
      loader: 'ts',
    },
    outfile: TEMP_BUNDLE,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node20'],
    logLevel: 'silent',
  });
  const require = createRequire(import.meta.url);
  delete require.cache[TEMP_BUNDLE];
  return require(TEMP_BUNDLE);
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function worldToAsset(point) {
  return {
    x: point.x - WORLD_RECT.x,
    y: point.y - WORLD_RECT.y,
  };
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function backgroundPath(stageId) {
  const ordinal = stageId.slice(-2);
  return join(ROOT, 'assets', `stage-${ordinal}`, 'background', `${stageId}_BACKGROUND.jpg`);
}

function routePoints(route) {
  return route.points.map(worldToAsset);
}

function polylinePoints(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function directionArrows(points, color, routeIndex) {
  const segmentCount = points.length - 1;
  const desired = segmentCount >= 12 ? 5 : 4;
  const indexes = new Set();
  for (let index = 1; index <= desired; index += 1) {
    indexes.add(Math.max(0, Math.min(segmentCount - 1, Math.round((index * segmentCount) / (desired + 1)))));
  }
  return [...indexes].map((segmentIndex) => {
    const start = points[segmentIndex];
    const end = points[segmentIndex + 1];
    const ratio = routeIndex === 0 ? 0.52 : 0.42 + routeIndex * 0.12;
    const x = start.x + (end.x - start.x) * ratio;
    const y = start.y + (end.y - start.y) * ratio;
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    return [
      `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})">`,
      '<path d="M -23 -15 L 23 0 L -23 15 L -12 0 Z" fill="#06101b" opacity="0.86"/>',
      `<path d="M -17 -10 L 17 0 L -17 10 L -8 0 Z" fill="${color}"/>`,
      '</g>',
    ].join('');
  }).join('');
}

function routeSvg(route, routeIndex, routeCount) {
  const points = routePoints(route);
  const color = ROUTE_COLORS[routeIndex] ?? ROUTE_COLORS[0];
  const width = routeCount > 1 ? 10 : 14;
  const halo = routeCount > 1 ? 28 : 38;
  return [
    `<polyline points="${polylinePoints(points)}" fill="none" stroke="#020813" stroke-opacity="0.8" stroke-width="${halo + 10}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polyline points="${polylinePoints(points)}" fill="none" stroke="${color}" stroke-opacity="0.2" stroke-width="${halo}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polyline points="${polylinePoints(points)}" fill="none" stroke="#07111f" stroke-opacity="0.95" stroke-width="${width + 7}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<polyline points="${polylinePoints(points)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    directionArrows(points, color, routeIndex),
  ].join('');
}

function routeLabelSvg(route, routeIndex, routeCount) {
  if (routeCount <= 1) return '';
  const points = routePoints(route);
  const color = ROUTE_COLORS[routeIndex] ?? ROUTE_COLORS[0];
  const pointIndexes = [3, 5, 7];
  const routeLabelPoint = points[Math.min(pointIndexes[routeIndex] ?? 3, points.length - 2)];
  const x = routeLabelPoint.x + 118 + routeIndex * 18;
  const y = Math.max(94, routeLabelPoint.y - 52 + routeIndex * 18);
  return [
    `<g transform="translate(${x} ${y})" filter="url(#softShadow)">`,
    `<rect x="-8" y="-31" width="136" height="52" rx="20" fill="#07111f" fill-opacity="0.96" stroke="${color}" stroke-width="3"/>`,
    `<text x="60" y="4" class="route-label" text-anchor="middle" fill="${color}">路线 ${String.fromCharCode(65 + routeIndex)}</text>`,
    '</g>',
  ].join('');
}

function platformMarker(stageId, candidate, currentOrder, reserveOrder, outerRadius) {
  const center = worldToAsset(candidate);
  const visualOffset = PLATFORM_ART_OFFSETS[stageId]?.[candidate.id] ?? { x: 0, y: 0 };
  center.x += visualOffset.x;
  center.y += visualOffset.y;
  const current = currentOrder !== null;
  const color = current ? CURRENT_COLOR : RESERVE_COLOR;
  const label = current ? `塔${currentOrder}` : `预${reserveOrder}`;
  const status = current ? '当前塔位' : '预留平台';
  const strokeDash = current ? '' : 'stroke-dasharray="16 12"';
  const radiusX = Math.round(outerRadius.x * 0.92);
  const radiusY = Math.round(outerRadius.y * 0.92);
  const tagWidth = current ? 132 : 132;
  const tagX = -tagWidth / 2;
  return [
    `<g data-platform="${xml(candidate.id)}" transform="translate(${center.x} ${center.y})">`,
    `<ellipse cx="0" cy="0" rx="${radiusX}" ry="${radiusY}" fill="none" stroke="#020813" stroke-width="12" opacity="0.72"/>`,
    `<ellipse cx="0" cy="0" rx="${radiusX}" ry="${radiusY}" fill="none" stroke="${color}" stroke-width="5" ${strokeDash} opacity="0.98"/>`,
    `<line x1="0" y1="-${radiusY + 7}" x2="0" y2="-${radiusY + 40}" stroke="${color}" stroke-width="4"/>`,
    `<g transform="translate(0 -${radiusY + 70})">`,
    `<rect x="${tagX}" y="-30" width="${tagWidth}" height="54" rx="20" fill="#06101b" fill-opacity="0.94" stroke="${color}" stroke-width="3"/>`,
    `<text x="0" y="7" text-anchor="middle" class="platform-label" fill="${color}">${label}</text>`,
    '<path d="M -10 24 L 10 24 L 0 38 Z" fill="#06101b" stroke="' + color + '" stroke-width="3" stroke-linejoin="round"/>',
    '</g>',
    `<title>${xml(candidate.id)} · ${status}</title>`,
    '</g>',
  ].join('');
}

function endpointCallout(point, label, color, kind, preferredSide = 'right') {
  const source = worldToAsset(point);
  const x = Math.max(340, Math.min(2860, source.x));
  const y = Math.max(48, Math.min(1390, source.y));
  const toLeft = preferredSide === 'left' || x > 2460;
  const boxWidth = label.length >= 5 ? 190 : 150;
  const boxX = toLeft ? -(boxWidth + 38) : 38;
  const textX = boxX + boxWidth / 2;
  const icon = kind === 'entry'
    ? '<path d="M -8 -11 L 12 0 L -8 11 Z" fill="#06101b"/>'
    : '<path d="M 0 -13 L 12 -6 L 9 9 L 0 16 L -9 9 L -12 -6 Z" fill="#06101b"/>';
  return [
    `<g transform="translate(${x} ${y})">`,
    `<circle r="25" fill="${color}" stroke="#06101b" stroke-width="7"/>`,
    icon,
    `<line x1="${toLeft ? -25 : 25}" y1="0" x2="${toLeft ? -38 : 38}" y2="0" stroke="${color}" stroke-width="5"/>`,
    `<rect x="${boxX}" y="-28" width="${boxWidth}" height="56" rx="22" fill="#06101b" fill-opacity="0.94" stroke="${color}" stroke-width="3"/>`,
    `<text x="${textX}" y="9" text-anchor="middle" class="endpoint-label" fill="${color}">${xml(label)}</text>`,
    '</g>',
  ].join('');
}

function sidePanelsSvg(stageId, stageConfig, currentCount, reserveCount, routeCount) {
  const stageOrdinal = STAGE_ORDINALS[stageId] ?? stageId;
  const endless = stageId === 'STAGE_08';
  const routeLegend = routeCount === 1
    ? [
      '<line x1="2922" y1="660" x2="2984" y2="660" stroke="#07111f" stroke-width="18" stroke-linecap="round"/>',
      `<line x1="2922" y1="660" x2="2984" y2="660" stroke="${ROUTE_COLORS[0]}" stroke-width="8" stroke-linecap="round"/>`,
      '<path d="M 2974 649 L 2993 660 L 2974 671 Z" fill="#ffd166"/>',
      '<text x="3020" y="670" class="legend-text">怪物路线</text>',
    ].join('')
    : ROUTE_COLORS.map((color, index) => {
      const y = 624 + index * 58;
      return [
        `<line x1="2922" y1="${y}" x2="2984" y2="${y}" stroke="#07111f" stroke-width="17" stroke-linecap="round"/>`,
        `<line x1="2922" y1="${y}" x2="2984" y2="${y}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`,
        `<text x="3020" y="${y + 10}" class="legend-text">路线 ${String.fromCharCode(65 + index)}</text>`,
      ].join('');
    }).join('');
  return [
    '<rect x="12" y="18" width="296" height="1404" rx="24" fill="url(#panelGradient)" stroke="#4ed9ff" stroke-opacity="0.7" stroke-width="3"/>',
    '<rect x="2892" y="18" width="296" height="1404" rx="24" fill="url(#panelGradient)" stroke="#4ed9ff" stroke-opacity="0.7" stroke-width="3"/>',
    `<text x="42" y="78" class="stage-kicker">${xml(stageOrdinal)}</text>`,
    `<text x="42" y="142" class="stage-name">${xml(stageConfig.name)}</text>`,
    '<line x1="42" y1="178" x2="278" y2="178" stroke="#4ed9ff" stroke-opacity="0.55" stroke-width="3"/>',
    '<text x="42" y="232" class="panel-label">塔位与行进路线</text>',
    `<text x="42" y="304" class="panel-number">${currentCount}</text>`,
    '<text x="116" y="301" class="panel-copy">个当前塔位</text>',
    `<text x="42" y="374" class="panel-number reserve">${reserveCount}</text>`,
    '<text x="116" y="371" class="panel-copy">个预留平台</text>',
    `<text x="42" y="444" class="panel-number route">${routeCount}</text>`,
    '<text x="116" y="441" class="panel-copy">条怪物路线</text>',
    endless
      ? '<g><rect x="36" y="520" width="248" height="204" rx="20" fill="#0b2035" stroke="#8d7cff" stroke-width="2"/><text x="56" y="568" class="note-title">无尽模式说明</text><text x="56" y="614" class="note-copy">当前运行时：3 塔</text><text x="56" y="652" class="note-copy">实体平台：8 个</text><text x="56" y="696" class="note-copy">每局随机启用 1 条路线</text></g>'
      : '<g><rect x="36" y="520" width="248" height="114" rx="20" fill="#0b2035" stroke="#4ed9ff" stroke-opacity="0.45" stroke-width="2"/><text x="56" y="568" class="note-title">固定关卡</text><text x="56" y="610" class="note-copy">开局塔位已对齐平台</text></g>',
    '<text x="42" y="1324" class="footer-copy">依据正式运行时数据</text>',
    '<text x="42" y="1364" class="footer-copy">坐标与背景已同步</text>',
    '<text x="42" y="1400" class="footer-version">DEPLOYMENT ATLAS · V1</text>',
    '<text x="2922" y="86" class="legend-title">图例</text>',
    `<g transform="translate(2954 180)"><ellipse rx="38" ry="25" fill="none" stroke="${CURRENT_COLOR}" stroke-width="5"/><rect x="-28" y="-66" width="56" height="42" rx="15" fill="#06101b" stroke="${CURRENT_COLOR}" stroke-width="3"/><text x="0" y="-37" text-anchor="middle" class="legend-pin" fill="${CURRENT_COLOR}">塔</text></g>`,
    '<text x="3020" y="190" class="legend-text">当前塔位</text>',
    `<g transform="translate(2954 310)"><ellipse rx="38" ry="25" fill="none" stroke="${RESERVE_COLOR}" stroke-width="5" stroke-dasharray="12 9"/><rect x="-28" y="-66" width="56" height="42" rx="15" fill="#06101b" stroke="${RESERVE_COLOR}" stroke-width="3"/><text x="0" y="-37" text-anchor="middle" class="legend-pin" fill="${RESERVE_COLOR}">预</text></g>`,
    '<text x="3020" y="320" class="legend-text">预留平台</text>',
    `<g transform="translate(2954 445)"><circle r="23" fill="${ENTRY_COLOR}" stroke="#06101b" stroke-width="6"/><path d="M -8 -11 L 12 0 L -8 11 Z" fill="#06101b"/></g>`,
    '<text x="3020" y="455" class="legend-text">怪物入口</text>',
    `<g transform="translate(2954 545)"><circle r="23" fill="${BREACH_COLOR}" stroke="#06101b" stroke-width="6"/><path d="M 0 -12 L 11 -6 L 8 9 L 0 15 L -8 9 L -11 -6 Z" fill="#06101b"/></g>`,
    '<text x="3020" y="555" class="legend-text">关印终点</text>',
    routeLegend,
    '<line x1="2922" y1="860" x2="3158" y2="860" stroke="#4ed9ff" stroke-opacity="0.35" stroke-width="3"/>',
    '<text x="2922" y="920" class="note-title">阅读方式</text>',
    '<text x="2922" y="975" class="note-copy">塔1、塔2…</text>',
    '<text x="2922" y="1015" class="note-copy">表示当前塔编号</text>',
    '<text x="2922" y="1085" class="note-copy">预1、预2…</text>',
    '<text x="2922" y="1125" class="note-copy">表示尚未上塔的平台</text>',
    '<text x="2922" y="1210" class="note-copy">箭头方向：</text>',
    '<text x="2922" y="1250" class="note-copy">入口 → 关印</text>',
  ].join('');
}

function createStageSvg(stageId, stageConfig, bundle) {
  const routes = bundle.endless?.routes ?? [bundle.route];
  const anchorOrders = new Map(bundle.route.towerAnchors.map((point, index) => [pointKey(point), index + 1]));
  const unmatchedAnchors = new Set(anchorOrders.keys());
  let reserveOrder = 0;
  const platforms = stageConfig.candidates.map((candidate) => {
    const currentOrder = anchorOrders.get(pointKey(candidate)) ?? null;
    if (currentOrder !== null) unmatchedAnchors.delete(pointKey(candidate));
    if (currentOrder === null) reserveOrder += 1;
    return platformMarker(
      stageId,
      candidate,
      currentOrder,
      currentOrder === null ? reserveOrder : null,
      stageConfig.outerRadius,
    );
  }).join('');
  assert(unmatchedAnchors.size === 0,
    `${stageId} has runtime anchors that do not match a physical background platform: ${[...unmatchedAnchors].join(' | ')}`);

  const entryPoint = routes.length === 1
    ? routes[0].points[0]
    : {
      x: routes.reduce((sum, route) => sum + route.points[0].x, 0) / routes.length,
      y: routes.reduce((sum, route) => sum + route.points[0].y, 0) / routes.length,
    };
  const breachPoint = routes.length === 1
    ? routes[0].breachPoint
    : {
      x: routes.reduce((sum, route) => sum + route.breachPoint.x, 0) / routes.length,
      y: routes.reduce((sum, route) => sum + route.breachPoint.y, 0) / routes.length,
    };
  const routeArtwork = routes.map((route, index) => routeSvg(route, index, routes.length)).join('');
  const routeLabels = routes.map((route, index) => routeLabelSvg(route, index, routes.length)).join('');
  const currentCount = bundle.route.towerAnchors.length;
  const reserveCount = stageConfig.candidates.length - currentCount;
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">`,
    '<defs>',
    '<linearGradient id="panelGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#071726" stop-opacity="0.95"/><stop offset="1" stop-color="#030914" stop-opacity="0.96"/></linearGradient>',
    '<filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dy="3"/><feComponentTransfer><feFuncA type="linear" slope="0.65"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
    '<style>',
    'text{font-family:"PingFang SC","Heiti SC","Arial Unicode MS",sans-serif}',
    '.stage-kicker{font-size:34px;font-weight:700;fill:#65e8ff;letter-spacing:2px}',
    '.stage-name{font-size:40px;font-weight:800;fill:#ffffff}',
    '.panel-label{font-size:26px;font-weight:600;fill:#dceaff}',
    '.panel-number{font-size:48px;font-weight:800;fill:#ffd166}',
    '.panel-number.reserve{fill:#65e8ff}.panel-number.route{fill:#ff93dc}',
    '.panel-copy{font-size:25px;font-weight:600;fill:#e9f2ff}',
    '.note-title{font-size:27px;font-weight:700;fill:#ffffff}',
    '.note-copy{font-size:23px;font-weight:500;fill:#c8d8ee}',
    '.footer-copy{font-size:20px;fill:#8fa7c1}.footer-version{font-size:15px;fill:#65e8ff;letter-spacing:1px}',
    '.legend-title{font-size:38px;font-weight:800;fill:#ffffff}',
    '.legend-text{font-size:24px;font-weight:600;fill:#e9f2ff}',
    '.legend-pin{font-size:24px;font-weight:800}',
    '.platform-label{font-size:28px;font-weight:800;letter-spacing:1px}',
    '.endpoint-label{font-size:26px;font-weight:800}',
    '.route-label{font-size:23px;font-weight:800}',
    '</style>',
    '</defs>',
    '<rect x="320" y="0" width="2560" height="1440" fill="#020813" opacity="0.08"/>',
    `<g filter="url(#softShadow)">${routeArtwork}</g>`,
    `<g filter="url(#softShadow)">${platforms}</g>`,
    routeLabels,
    endpointCallout(entryPoint, routes.length > 1 ? '三路入口' : '怪物入口', ENTRY_COLOR, 'entry'),
    endpointCallout(breachPoint, '关印终点', BREACH_COLOR, 'breach', 'left'),
    sidePanelsSvg(stageId, stageConfig, currentCount, reserveCount, routes.length),
    '</svg>',
  ].join('');
}

function renderStage(background, overlaySvg, output) {
  const overlayPng = overlaySvg.replace(/\.svg$/, '.png');
  run('/usr/bin/sips', [
    '-s', 'format', 'png',
    overlaySvg,
    '--out', overlayPng,
  ]);
  run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', background,
    '-i', overlayPng,
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto[out]',
    '-map', '[out]',
    '-frames:v', '1',
    '-compression_level', '5',
    output,
  ], { maxBuffer: 64 * 1024 * 1024 });
}

function createContactSheet(stageFiles) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const file of stageFiles) args.push('-i', file);
  const filters = stageFiles.map((_, index) => `[${index}:v]scale=1280:576[s${index}]`);
  filters.push('[s0][s1]hstack=inputs=2[r0]');
  filters.push('[s2][s3]hstack=inputs=2[r1]');
  filters.push('[s4][s5]hstack=inputs=2[r2]');
  filters.push('[s6][s7]hstack=inputs=2[r3]');
  filters.push('[r0][r1][r2][r3]vstack=inputs=4[out]');
  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-frames:v', '1',
    '-q:v', '2',
    '-pix_fmt', 'yuvj420p',
    join(OUTPUT_DIR, 'all-stage-deployment-atlas.jpg'),
  );
  run(FFMPEG, args);
}

function createMobilePreview() {
  const source = join(OUTPUT_DIR, 'all-stage-deployment-atlas.jpg');
  const output = join(MOBILE_PREVIEW_DIR, 'all-stage-844x380-audit.jpg');
  mkdirSync(MOBILE_PREVIEW_DIR, { recursive: true });
  run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', source,
    '-vf', 'scale=1688:1520:flags=lanczos',
    '-frames:v', '1',
    '-q:v', '2',
    '-pix_fmt', 'yuvj420p',
    output,
  ]);
}

function createReadme(config, manifestStages) {
  const lines = [
    '# 八关塔位与怪物行进路线图册',
    '',
    '> 面向产品、关卡和美术验收的简洁版本。图中只保留当前塔位、预留实体平台、入口、方向和关印终点；不包含 HUD、禁建半径、坐标投影等工程辅助线。',
    '',
    '## 图例',
    '',
    '- 金色 `塔1、塔2…`：当前运行时已经使用的塔位，编号按运行时塔数组顺序。',
    '- 青色 `预1、预2…`：背景中已经绘制、但当前没有上塔的预留实体平台。',
    '- 黄色箭头：第一至第七关的怪物行进方向。',
    '- 第八关黄色/粉色/青色：无尽模式可能选择的 A/B/C 三条路线。',
    '- 绿色入口：怪物出生方向；红色关印：怪物抵达后造成关印伤害的位置。',
    '',
    '## 单关地图',
    '',
    ...manifestStages.map((stage) =>
      `- [${STAGE_ORDINALS[stage.stageId]} · ${stage.name}](./${stage.file})：当前 ${stage.currentTowerCount} 塔，预留 ${stage.reservePlatformCount} 个平台，${stage.routeCount} 条路线。`),
    '- [八关总览](./all-stage-deployment-atlas.jpg)',
    '- [844×380 等效缩略验收总览](./mobile-preview/all-stage-844x380-audit.jpg)',
    '- [机器可读清单](./manifest.json)',
    '',
    '## 重要边界',
    '',
    '- 第八关当前运行时仍然只有 3 座塔；背景共有 8 个实体平台，扩塔方案规划最多 6 塔。本图没有把预留平台画成已经建成的塔。',
    '- 这些平台是背景视觉引导与当前初始塔位。现有自由摆塔逻辑仍允许玩家在其他合法网格部署；平台尚未成为唯一可摆放白名单。',
    '- 路线和当前塔位直接读取 `src/core/content.ts`；平台读取 `scripts/tower-layout-guide-candidates.json`，避免图册与运行时手工漂移。',
    '',
    '## 重新生成',
    '',
    '```bash',
    'node scripts/generate-stage-deployment-atlas.mjs',
    '```',
    '',
    `平台配置版本：${config.generatedAssetVersion}`,
  ];
  writeFileSync(join(OUTPUT_DIR, 'README.md'), `${lines.join('\n')}\n`);
}

function cleanOutputs() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  mkdirSync(MOBILE_PREVIEW_DIR, { recursive: true });
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (/^stage-\d{2}-deployment-guide\.png$/.test(name) ||
      name === 'all-stage-deployment-atlas.jpg' ||
      name === 'manifest.json' ||
      name === 'README.md') {
      unlinkSync(join(OUTPUT_DIR, name));
    }
  }
  for (const name of readdirSync(MOBILE_PREVIEW_DIR)) {
    if (name === 'all-stage-844x380-audit.jpg') unlinkSync(join(MOBILE_PREVIEW_DIR, name));
  }
}

function main() {
  assert(existsSync(FFMPEG), `ffmpeg not found at ${FFMPEG}`);
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const runtime = loadRuntimeContracts();
  assert(JSON.stringify(runtime.BATTLE_BACKGROUND_WORLD_RECT) === JSON.stringify(WORLD_RECT),
    'Renderer background projection changed; update this atlas generator first.');
  cleanOutputs();
  const stageFiles = [];
  const manifestStages = [];
  for (const stageId of Object.keys(config.stages).sort()) {
    const stageConfig = config.stages[stageId];
    const bundle = runtime.STAGE_BUNDLES[stageId];
    assert(bundle, `Missing runtime bundle for ${stageId}`);
    const routes = bundle.endless?.routes ?? [bundle.route];
    const background = backgroundPath(stageId);
    assert(existsSync(background), `Missing background ${relative(ROOT, background)}`);
    const ordinal = stageId.slice(-2);
    const overlayPath = join(TEMP_DIR, `stage-${ordinal}-overlay.svg`);
    const output = join(OUTPUT_DIR, `stage-${ordinal}-deployment-guide.png`);
    writeFileSync(overlayPath, createStageSvg(stageId, stageConfig, bundle));
    renderStage(background, overlayPath, output);
    stageFiles.push(output);

    const currentOrders = new Map(bundle.route.towerAnchors.map((point, index) => [pointKey(point), index + 1]));
    let reserveOrder = 0;
    manifestStages.push({
      stageId,
      name: stageConfig.name,
      file: relative(OUTPUT_DIR, output),
      image: {
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        sha256: fileSha256(output),
      },
      background: relative(ROOT, background),
      currentTowerCount: bundle.route.towerAnchors.length,
      reservePlatformCount: stageConfig.candidates.length - bundle.route.towerAnchors.length,
      physicalPlatformCount: stageConfig.candidates.length,
      plannedMaximumActiveTowers: stageConfig.maximumActiveTowers,
      routeCount: routes.length,
      routes: routes.map((route, routeIndex) => ({
        id: route.id,
        label: routes.length > 1 ? `路线 ${String.fromCharCode(65 + routeIndex)}` : '怪物路线',
        color: ROUTE_COLORS[routeIndex] ?? ROUTE_COLORS[0],
        points: route.points,
        entryPoint: route.points[0],
        breachPoint: route.breachPoint,
      })),
      platforms: stageConfig.candidates.map((candidate) => {
        const currentOrder = currentOrders.get(pointKey(candidate)) ?? null;
        const visualOffset = PLATFORM_ART_OFFSETS[stageId]?.[candidate.id] ?? { x: 0, y: 0 };
        if (currentOrder === null) reserveOrder += 1;
        return {
          candidateId: candidate.id,
          point: { x: candidate.x, y: candidate.y },
          marker: currentOrder === null ? `预${reserveOrder}` : `塔${currentOrder}`,
          status: currentOrder === null ? 'reserve-platform' : 'current-tower',
          visualArtOffset: visualOffset,
        };
      }),
    });
    process.stdout.write(`generated ${relative(ROOT, output)}\n`);
  }
  createContactSheet(stageFiles);
  createMobilePreview();
  const manifest = {
    schemaVersion: 1,
    status: 'generated-from-runtime',
    generatedAt: new Date().toISOString(),
    generatedAssetVersion: config.generatedAssetVersion,
    mapping: {
      worldToBackground: { x: '+640', y: '+60' },
      backgroundSize: [IMAGE_WIDTH, IMAGE_HEIGHT],
      visible16x9: [320, 0, 2880, 1440],
    },
    stages: manifestStages,
  };
  writeFileSync(join(OUTPUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  createReadme(config, manifestStages);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'all-stage-deployment-atlas.jpg'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, join(MOBILE_PREVIEW_DIR, 'all-stage-844x380-audit.jpg'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'manifest.json'))}\n`);
  process.stdout.write(`generated ${relative(ROOT, join(OUTPUT_DIR, 'README.md'))}\n`);
}

try {
  main();
} finally {
  rmSync(TEMP_DIR, { recursive: true, force: true });
}
