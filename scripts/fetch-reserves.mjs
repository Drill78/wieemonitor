/**
 * 一次性脚本：从 OpenStreetMap (Overpass API) 抓取山西省 8 个国家级
 * 自然保护区的边界几何，转成 GeoJSON 存到 public/geo/reserves/。
 *
 * 用法：npm run fetch:reserves
 *
 * 行为：
 *   - 每个保护区按 search 关键字查 relation/way（boundary=protected_area
 *     或 leisure=nature_reserve）
 *   - 三个 Overpass 端点 fallback
 *   - 每个保护区之间 sleep 5 秒，避免 rate limit
 *   - 多个候选时优先 protected_area，再按面积取最大；要求名称包含 search 关键字
 *   - 找不到 → 标记 not_found，不编造
 *   - 三个端点都连不上 → 标记 network_error
 *
 * 产出：
 *   - public/geo/reserves/<CODE>.geojson  （成功的保护区）
 *   - scripts/fetch-reserves-report.json  （汇总报告）
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import osmtogeojson from 'osmtogeojson';

// === 8 个目标保护区 ===
const RESERVES = [
  { code: 'SXNR-01', name: '芦芽山国家级自然保护区',       search: '芦芽山', centerLat: 38.75, centerLng: 111.95, radiusDeg: 0.15 },
  { code: 'SXNR-02', name: '庞泉沟国家级自然保护区',       search: '庞泉沟', centerLat: 37.83, centerLng: 111.46, radiusDeg: 0.09 },
  { code: 'SXNR-03', name: '黑茶山国家级自然保护区',       search: '黑茶山', centerLat: 38.38, centerLng: 111.25, radiusDeg: 0.12 },
  { code: 'SXNR-04', name: '五鹿山国家级自然保护区',       search: '五鹿山', centerLat: 36.68, centerLng: 111.16, radiusDeg: 0.12 },
  { code: 'SXNR-05', name: '灵空山国家级自然保护区',       search: '灵空山', centerLat: 36.65, centerLng: 112.18, radiusDeg: 0.09 },
  { code: 'SXNR-06', name: '历山国家级自然保护区',         search: '历山',   centerLat: 35.45, centerLng: 111.92, radiusDeg: 0.17 },
  { code: 'SXNR-07', name: '太宽河国家级自然保护区',       search: '太宽河', centerLat: 35.28, centerLng: 111.65, radiusDeg: 0.10 },
  { code: 'SXNR-08', name: '阳城蟒河猕猴国家级自然保护区', search: '蟒河',   centerLat: 35.25, centerLng: 112.45, radiusDeg: 0.07 },
];

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

const OUT_DIR = path.resolve('public/geo/reserves');
const REPORT_PATH = path.resolve('scripts/fetch-reserves-report.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildQuery(search) {
  return `[out:json][timeout:90];
(
  relation["name"~"${search}"]["boundary"="protected_area"];
  relation["name"~"${search}"]["leisure"="nature_reserve"];
  way["name"~"${search}"]["boundary"="protected_area"];
  way["name"~"${search}"]["leisure"="nature_reserve"];
);
out geom;`;
}

async function fetchOverpass(query) {
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`    → 尝试 ${endpoint}`);
      // 关键修复：Overpass 拒绝默认 Node UA（HTTP 406）；改用原始 query body + 标准 UA
      const res = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'User-Agent':
            'wieemonitor-fetch-script/0.1 (ecology monitoring platform)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        console.log(`      HTTP ${res.status}，切换下一个`);
        continue;
      }
      const json = await res.json();
      return { json, endpoint };
    } catch (e) {
      console.log(`      请求失败：${e.message}，切换下一个`);
    }
  }
  return null;
}

// 简单 shoelace 计算 ring 面积（度²，用于比较大小）
function ringArea(coords) {
  let s = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

function featureArea(feat) {
  const g = feat.geometry;
  if (!g) return 0;
  if (g.type === 'Polygon') return ringArea(g.coordinates[0] || []);
  if (g.type === 'MultiPolygon') {
    return g.coordinates.reduce(
      (acc, poly) => acc + ringArea(poly[0] || []),
      0,
    );
  }
  return 0;
}

// 取 feature 上的一个参考纬度（用于 deg² → km² 转换）
function refLat(feat, fallback) {
  try {
    const g = feat.geometry;
    if (g.type === 'Polygon') return g.coordinates[0][0][1];
    if (g.type === 'MultiPolygon') return g.coordinates[0][0][0][1];
  } catch {
    // ignore
  }
  return fallback;
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const report = [];

  for (const r of RESERVES) {
    console.log(`\n=== ${r.code} ${r.name} (search="${r.search}") ===`);
    const result = await fetchOverpass(buildQuery(r.search));

    if (!result) {
      console.log(`  ✗ 所有 endpoint 都失败`);
      report.push({
        code: r.code,
        name: r.name,
        status: 'network_error',
      });
      await sleep(5000);
      continue;
    }

    let geo;
    try {
      geo = osmtogeojson(result.json);
    } catch (e) {
      console.log(`  ✗ osmtogeojson 转换失败：${e.message}`);
      report.push({
        code: r.code,
        name: r.name,
        status: 'parse_error',
        source_endpoint: result.endpoint,
      });
      await sleep(5000);
      continue;
    }

    const polys = (geo.features || []).filter(
      (f) =>
        f.geometry &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
    );

    // 名称必须包含 search 关键字
    const matched = polys.filter((f) => {
      const n = f.properties?.name || '';
      return n.includes(r.search);
    });

    if (matched.length === 0) {
      console.log(
        `  ✗ 未找到 (返回 ${geo.features?.length ?? 0} 个 feature，` +
          `${polys.length} 个 polygon，0 个名称匹配)`,
      );
      report.push({
        code: r.code,
        name: r.name,
        status: 'not_found',
        source_endpoint: result.endpoint,
        raw_polygon_count: polys.length,
      });
      await sleep(5000);
      continue;
    }

    // 排序：优先 protected_area；再按面积取最大
    const ranked = [...matched].sort((a, b) => {
      const ap = a.properties?.boundary === 'protected_area' ? 1 : 0;
      const bp = b.properties?.boundary === 'protected_area' ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return featureArea(b) - featureArea(a);
    });

    const best = ranked[0];
    const fc = { type: 'FeatureCollection', features: [best] };
    const outPath = path.join(OUT_DIR, `${r.code}.geojson`);
    await fs.writeFile(outPath, JSON.stringify(fc), 'utf8');

    // 估算面积：deg² × 111² × cos(lat) ≈ km²
    const lat0 = refLat(best, r.centerLat);
    const area_km2 = featureArea(best) * 111 * 111 * Math.cos((lat0 * Math.PI) / 180);

    // OSM 来源信息（osmtogeojson 输出的 id 形如 "relation/123456"）
    const osmIdRaw = best.id || '';
    const [osm_type, osm_id] = String(osmIdRaw).split('/');

    console.log(
      `  ✓ 保存 → ${path.relative(process.cwd(), outPath)}` +
        `  | osm=${osm_type}/${osm_id} | ≈${area_km2.toFixed(1)} km²` +
        ` | 候选 ${matched.length}`,
    );

    report.push({
      code: r.code,
      name: r.name,
      status: 'ok',
      osm_type: osm_type || null,
      osm_id: osm_id || null,
      area_km2: Math.round(area_km2 * 10) / 10,
      source_endpoint: result.endpoint,
      candidates_count: matched.length,
      tag_boundary: best.properties?.boundary || null,
      tag_leisure: best.properties?.leisure || null,
      osm_name: best.properties?.name || null,
    });

    await sleep(5000);
  }

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\n报告已保存：${path.relative(process.cwd(), REPORT_PATH)}`);
  console.log(`\n=== 汇总 ===`);
  for (const x of report) {
    const tag = x.status === 'ok' ? '✓' : '✗';
    const extra =
      x.status === 'ok' ? ` (${x.area_km2} km², osm=${x.osm_type}/${x.osm_id})` : '';
    console.log(`  ${tag} ${x.code}  ${x.name}  - ${x.status}${extra}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
