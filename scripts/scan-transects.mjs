/**
 * 一次性脚本：扫描外部目录下的 KML 样线文件，生成前端可用的
 *   - public/data/transects-manifest.json        — 所有样线的元数据索引
 *   - public/data/transects/<id>.geojson          — 每条样线的 GeoJSON 副本
 *   - scripts/scan-transects-report.json          — 扫描报告
 *
 * 用法：npm run scan:transects
 * 依赖 .env.local 提供 WIEEMONITOR_DATA_ROOT 环境变量。
 *
 * 阶段 1.4 改动：保护区数据从 public/geo/reserves-registry.json 读取
 *   （由 scan-reserves.mjs 从官方 shapefile 生成的 46 个保护区）。
 *   归属时使用每个保护区的 merged.geojson（合并 MultiPolygon），
 *   先严格 point-in-polygon（start/middle/end 任一点），失败再
 *   approximate（≤ BUFFER_KM）。reserve_code 输出**新编码**（如 SXNR-N02）。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { kml as togeojson } from '@tmcw/togeojson';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import { point as turfPoint, lineString as turfLineString } from '@turf/helpers';

// 官方 shapefile 来源已含实验区/缓冲区，BUFFER_KM 仍保留兜底（边界数据
// 偶尔会有切边或户外起点在边界外几米的情况）。改小了。
const BUFFER_KM = 1;

// 项目根目录 = 本脚本的上一级
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(PROJECT_ROOT, 'public/geo/reserves-registry.json');
const OUT_TRANSECTS_DIR = path.join(PROJECT_ROOT, 'public/data/transects');
const OUT_MANIFEST = path.join(PROJECT_ROOT, 'public/data/transects-manifest.json');
const OUT_REPORT = path.join(PROJECT_ROOT, 'scripts/scan-transects-report.json');

// === 工具函数 ===

const toRad = (d) => (d * Math.PI) / 180;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

async function walkKml(dir) {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    throw new Error(`无法读取目录 "${dir}"：${e.message}`);
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkKml(full)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.kml')) {
      found.push(full);
    }
  }
  return found;
}

/** 从 KML XML 里提取 Document 下的 ExtendedData（Data name=... value=...） */
function extractExtendedData(xmlDoc) {
  const result = {};
  const docEl = xmlDoc.getElementsByTagName('Document')[0];
  if (!docEl) return result;
  const eds = docEl.getElementsByTagName('ExtendedData');
  for (let i = 0; i < eds.length; i++) {
    // 仅取直接挂在 Document 下的 ExtendedData（避免 Placemark 里的）
    if (eds[i].parentNode !== docEl) continue;
    const datas = eds[i].getElementsByTagName('Data');
    for (let j = 0; j < datas.length; j++) {
      const name = datas[j].getAttribute('name');
      const valueEl = datas[j].getElementsByTagName('value')[0];
      const value = valueEl?.textContent?.trim() ?? '';
      if (name) result[name] = value;
    }
  }
  return result;
}

/** 取 Document 下的 name，没有则返回 null */
function extractDocumentName(xmlDoc) {
  const docEl = xmlDoc.getElementsByTagName('Document')[0];
  if (!docEl) return null;
  // 找 Document 直接子节点 <name>
  const children = docEl.childNodes;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType === 1 && c.nodeName === 'name') {
      return c.textContent?.trim() || null;
    }
  }
  return null;
}

/** 加载 registry 里 46 个保护区的 merged.geojson（合并 MultiPolygon） */
async function loadReservePolygons() {
  const txt = await fs.readFile(REGISTRY_PATH, 'utf8');
  const registry = JSON.parse(txt);
  const out = [];
  for (const r of registry.reserves) {
    let feature = null;
    try {
      const mergedPath = path.join(
        PROJECT_ROOT,
        'public',
        r.merged_geojson_path.replace(/^\/+/, ''),
      );
      const fc = JSON.parse(await fs.readFile(mergedPath, 'utf8'));
      const cand = fc.features?.find(
        (f) =>
          f.geometry &&
          (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
      );
      if (cand) feature = cand;
    } catch (e) {
      console.log(`  [保护区] ${r.code} ${r.name_short} → 几何加载失败：${e.message}`);
    }
    if (!feature) continue;
    out.push({
      code: r.code,
      name: r.name_full,
      name_short: r.name_short,
      level: r.level,
      feature,
    });
  }
  console.log(`  [保护区] 共载入 ${out.length} 个 (registry 总数 ${registry.reserves.length})`);
  return out;
}

/** 严格 point-in-polygon：返回所有命中的保护区 */
function strictHits(lng, lat, reserves) {
  const pt = turfPoint([lng, lat]);
  const hits = [];
  for (const r of reserves) {
    try {
      if (booleanPointInPolygon(pt, r.feature)) hits.push(r);
    } catch {
      // 几何异常就跳过
    }
  }
  return hits;
}

/** 一个点到 polygon/multipolygon 边界（任意环）的最短距离（km） */
function distanceKmToBoundary(lng, lat, feature) {
  const pt = turfPoint([lng, lat]);
  const polys =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  let min = Infinity;
  for (const poly of polys) {
    for (const ring of poly) {
      try {
        const ln = turfLineString(ring);
        const np = nearestPointOnLine(ln, pt, { units: 'kilometers' });
        const d = np.properties.dist;
        if (d < min) min = d;
      } catch {
        // 退化环 (不足 2 点) 等异常跳过
      }
    }
  }
  return min;
}

/**
 * 多层归属：
 *   1) 严格命中（start/middle/end 任一点落入）→ match_type=strict
 *   2) 近似命中（任一点距离某保护区边界 ≤ BUFFER_KM km）→ approximate，取最近
 *   3) 否则 → null
 *
 * 返回 { code, name, match_type, distance_km, warning, candidates } 或 null
 */
function assignReserveMultiLayer(probePoints, reserves) {
  // 1) 严格
  for (const p of probePoints) {
    const hits = strictHits(p.lng, p.lat, reserves);
    if (hits.length > 0) {
      const warning = hits.length > 1 ? 'multi_strict' : null;
      return {
        code: hits[0].code,
        name: hits[0].name,
        match_type: 'strict',
        distance_km: 0,
        warning,
        candidates: hits.map((h) => h.code),
        which_point: p.label,
      };
    }
  }

  // 2) 近似：对所有探测点 × 所有保护区，找全局最小距离
  const ranked = [];
  for (const r of reserves) {
    let minD = Infinity;
    let whichPt = null;
    for (const p of probePoints) {
      const d = distanceKmToBoundary(p.lng, p.lat, r.feature);
      if (d < minD) {
        minD = d;
        whichPt = p.label;
      }
    }
    ranked.push({ r, distance: minD, which: whichPt });
  }
  ranked.sort((a, b) => a.distance - b.distance);
  const best = ranked[0];
  if (best && best.distance <= BUFFER_KM) {
    const second = ranked[1];
    const warning =
      second && second.distance <= BUFFER_KM ? 'near_boundary' : null;
    return {
      code: best.r.code,
      name: best.r.name,
      match_type: 'approximate',
      distance_km: +best.distance.toFixed(3),
      warning,
      candidates:
        warning === 'near_boundary'
          ? [best.r.code, second.r.code]
          : [best.r.code],
      which_point: best.which,
    };
  }

  // 3) 都不命中
  return null;
}

/** 从 togeojson 转出的 FeatureCollection 里，找 LineString/MultiLineString 主轨迹 */
function findTrackFeature(geo) {
  if (!geo?.features) return null;
  // 优先 LineString；其次 MultiLineString 的第一段
  const line = geo.features.find((f) => f.geometry?.type === 'LineString');
  if (line) return { feature: line, coords: line.geometry.coordinates, coordTimes: line.properties?.coordTimes };
  const multi = geo.features.find((f) => f.geometry?.type === 'MultiLineString');
  if (multi) {
    const coords = multi.geometry.coordinates[0] || [];
    const times = Array.isArray(multi.properties?.coordTimes)
      ? multi.properties.coordTimes[0]
      : undefined;
    return { feature: multi, coords, coordTimes: times };
  }
  return null;
}

/** 汇总一条轨迹的统计信息 */
function computeStats(coords, coordTimes) {
  let distance = 0;
  let elevMin = Infinity;
  let elevMax = -Infinity;
  let gain = 0;
  let loss = 0;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat, altRaw] = coords[i];
    const alt = typeof altRaw === 'number' ? altRaw : null;
    if (alt !== null) {
      if (alt < elevMin) elevMin = alt;
      if (alt > elevMax) elevMax = alt;
    }
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;

    if (i > 0) {
      const prev = coords[i - 1];
      distance += haversineMeters(prev[1], prev[0], lat, lng);
      if (alt !== null && typeof prev[2] === 'number') {
        const dz = alt - prev[2];
        if (dz > 0) gain += dz;
        else loss += -dz;
      }
    }
  }

  const start = coords[0];
  const end = coords[coords.length - 1];

  let startTime = null;
  let endTime = null;
  let durationSeconds = null;
  if (Array.isArray(coordTimes) && coordTimes.length > 0) {
    startTime = coordTimes[0] || null;
    endTime = coordTimes[coordTimes.length - 1] || null;
    if (startTime && endTime) {
      const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
      if (Number.isFinite(ms) && ms >= 0) durationSeconds = Math.round(ms / 1000);
    }
  }

  return {
    point_count: coords.length,
    distance_meters: +distance.toFixed(2),
    elevation_min: elevMin === Infinity ? null : +elevMin.toFixed(2),
    elevation_max: elevMax === -Infinity ? null : +elevMax.toFixed(2),
    elevation_gain: +gain.toFixed(2),
    elevation_loss: +loss.toFixed(2),
    start_point: start ? { lng: start[0], lat: start[1] } : null,
    end_point: end ? { lng: end[0], lat: end[1] } : null,
    bbox: [minLng, minLat, maxLng, maxLat],
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
  };
}

// === 主流程 ===

async function main() {
  const DATA_ROOT = process.env.WIEEMONITOR_DATA_ROOT;
  if (!DATA_ROOT) {
    console.error('✗ 未设置 WIEEMONITOR_DATA_ROOT。');
    console.error('  请在项目根目录创建 .env.local 并加入：');
    console.error('    WIEEMONITOR_DATA_ROOT=/path/to/your/data');
    console.error('  然后运行：npm run scan:transects');
    process.exit(1);
  }

  console.log(`[数据根目录] ${DATA_ROOT}`);

  // 确认目录存在
  try {
    const s = await fs.stat(DATA_ROOT);
    if (!s.isDirectory()) throw new Error('不是目录');
  } catch (e) {
    console.error(`✗ 无法访问数据根目录：${e.message}`);
    process.exit(1);
  }

  // 清理并创建输出目录
  await fs.rm(OUT_TRANSECTS_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_TRANSECTS_DIR, { recursive: true });

  // 加载保护区
  console.log('\n[加载保护区]');
  const reserves = await loadReservePolygons();

  // 扫描 KML
  console.log(`\n[扫描 KML] 在 ${DATA_ROOT} 下递归搜索 .kml`);
  const kmlPaths = await walkKml(DATA_ROOT);
  console.log(`  找到 ${kmlPaths.length} 个 KML 文件`);

  const manifest = [];
  const errors = [];
  const unassigned = [];
  const idSeen = new Map(); // name → seen count，用于去重

  for (const fullPath of kmlPaths) {
    const relPath = path.relative(DATA_ROOT, fullPath);
    console.log(`\n=== ${relPath} ===`);
    let xml, xmlDoc, geo;
    try {
      xml = await fs.readFile(fullPath, 'utf8');
      xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
      geo = togeojson(xmlDoc);
    } catch (e) {
      console.log(`  ✗ 解析失败：${e.message}`);
      errors.push({ file: relPath, stage: 'parse', message: e.message });
      continue;
    }

    const track = findTrackFeature(geo);
    if (!track || !track.coords || track.coords.length < 2) {
      console.log(`  ✗ 没有找到有效轨迹（LineString/MultiLineString）`);
      errors.push({ file: relPath, stage: 'no_track', message: 'no track found' });
      continue;
    }

    // ID：优先 Document/name，其次文件名
    const docName = extractDocumentName(xmlDoc);
    const baseName = path.basename(fullPath, path.extname(fullPath));
    let id = (docName || baseName).trim();
    // 去重
    const seen = idSeen.get(id) || 0;
    if (seen > 0) {
      const uniq = `${id}_${seen + 1}`;
      console.log(`  ⚠ id "${id}" 重复，改为 "${uniq}"`);
      errors.push({ file: relPath, stage: 'duplicate_id', message: `renamed to ${uniq}` });
      id = uniq;
    }
    idSeen.set(id, seen + 1);

    const ed = extractExtendedData(xmlDoc);

    const stats = computeStats(track.coords, track.coordTimes);

    // 归属判定：strict (start/middle/end) → approximate (≤ BUFFER_KM) → unassigned
    const probePoints = [];
    if (stats.start_point) {
      probePoints.push({
        label: 'start',
        lng: stats.start_point.lng,
        lat: stats.start_point.lat,
      });
    }
    if (track.coords.length >= 3) {
      const mid = track.coords[Math.floor(track.coords.length / 2)];
      probePoints.push({ label: 'middle', lng: mid[0], lat: mid[1] });
    }
    if (stats.end_point) {
      probePoints.push({
        label: 'end',
        lng: stats.end_point.lng,
        lat: stats.end_point.lat,
      });
    }

    const assignment = assignReserveMultiLayer(probePoints, reserves);
    let assignedCode = null;
    let assignedName = null;
    let matchType = 'unassigned';
    let matchDistanceKm = null;
    if (assignment) {
      assignedCode = assignment.code;
      assignedName = assignment.name;
      matchType = assignment.match_type;
      matchDistanceKm =
        assignment.match_type === 'approximate' ? assignment.distance_km : null;

      if (assignment.warning === 'multi_strict') {
        console.log(
          `  ⚠ 多个保护区都严格包含该点 → 取 ${assignment.code}（${assignment.candidates.join(', ')}）`,
        );
        errors.push({
          file: relPath,
          stage: 'multi_strict',
          message: assignment.candidates.join(','),
        });
      }
      if (assignment.warning === 'near_boundary') {
        console.log(
          `  ⚠ 接近多个保护区边界（${assignment.candidates.join(', ')}）→ 取 ${assignment.code}`,
        );
        errors.push({
          file: relPath,
          stage: 'near_boundary',
          message: assignment.candidates.join(','),
        });
      }
      if (assignment.match_type === 'approximate') {
        console.log(
          `  ℹ 近似归属：${assignment.code} (距 ${assignment.which_point} 点 ${assignment.distance_km} km)`,
        );
      }
    } else {
      unassigned.push({
        id,
        file: relPath,
        start_point: stats.start_point,
        end_point: stats.end_point,
      });
    }

    const commonMeta = {
      id,
      name: id,
      reserve_code: assignedCode,
      reserve_name: assignedName,
      match_type: matchType,
      match_distance_km: matchDistanceKm,
      ...stats,
      extra: {
        pos_start_name: ed.PosStartName ?? null,
        pos_end_name: ed.PosEndName ?? null,
        track_tags: ed.TrackTags ?? null,
        creator: ed.OriginCreaterNickname ?? null,
      },
    };

    // 写单条 geojson
    const outGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: track.feature.geometry,
          properties: commonMeta,
        },
      ],
    };
    const outPath = path.join(OUT_TRANSECTS_DIR, `${id}.geojson`);
    await fs.writeFile(outPath, JSON.stringify(outGeoJson), 'utf8');

    // 加到 manifest
    manifest.push({
      ...commonMeta,
      source_file: relPath,
      geojson_path: `/data/transects/${id}.geojson`,
    });

    const km = (stats.distance_meters / 1000).toFixed(2);
    const tag =
      matchType === 'strict'
        ? '严格'
        : matchType === 'approximate'
          ? `近似 ${matchDistanceKm}km`
          : '未归属';
    console.log(
      `  ✓ id=${id} | ${km} km | ${stats.point_count} pts ` +
        `| 归属=${assignedCode ?? '(未归属)'} [${tag}]`,
    );
  }

  // 排序 manifest：按 reserve_code 再按 start_time
  manifest.sort((a, b) => {
    const ra = a.reserve_code ?? 'ZZZ';
    const rb = b.reserve_code ?? 'ZZZ';
    if (ra !== rb) return ra.localeCompare(rb);
    return (a.start_time ?? '').localeCompare(b.start_time ?? '');
  });

  await fs.writeFile(OUT_MANIFEST, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n[manifest] 写入 ${path.relative(PROJECT_ROOT, OUT_MANIFEST)}`);

  // 按保护区分组统计
  const byReserve = new Map();
  for (const m of manifest) {
    const key = m.reserve_code ?? '(未归属)';
    byReserve.set(key, (byReserve.get(key) || 0) + 1);
  }

  const report = {
    scanned_at: new Date().toISOString(),
    data_root: DATA_ROOT,
    total_kml_files: kmlPaths.length,
    success: manifest.length,
    unassigned: unassigned.length,
    errors,
    by_reserve: Object.fromEntries(byReserve),
    unassigned_items: unassigned,
  };
  await fs.writeFile(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[报告] 写入 ${path.relative(PROJECT_ROOT, OUT_REPORT)}`);

  // 按 match_type 分组
  const byMatch = { strict: 0, approximate: 0, unassigned: 0 };
  const approxList = [];
  for (const m of manifest) {
    byMatch[m.match_type] = (byMatch[m.match_type] || 0) + 1;
    if (m.match_type === 'approximate') {
      approxList.push(
        `    ${m.id} → ${m.reserve_code} (距边界 ${m.match_distance_km} km)`,
      );
    }
  }

  console.log('\n=== 汇总 ===');
  console.log(`  扫描 KML：${kmlPaths.length}`);
  console.log(`  成功解析：${manifest.length}`);
  console.log(`  ── 严格归属：${byMatch.strict}`);
  console.log(`  ── 近似归属：${byMatch.approximate}（容差 ${BUFFER_KM} km）`);
  console.log(`  ── 未归属：  ${byMatch.unassigned}`);
  console.log(`  错误/警告：${errors.length}`);
  console.log('  按保护区分组：');
  for (const [k, v] of byReserve) {
    console.log(`    ${k}: ${v} 条`);
  }
  if (approxList.length > 0) {
    console.log('  近似归属明细：');
    approxList.forEach((l) => console.log(l));
  }
  if (unassigned.length > 0) {
    console.log('\n  未归属样线的起点坐标（帮助诊断）：');
    for (const u of unassigned) {
      console.log(
        `    ${u.id} (${u.file}) 起点=${u.start_point?.lng.toFixed(6)},${u.start_point?.lat.toFixed(6)}`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
