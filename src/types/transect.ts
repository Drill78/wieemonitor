/**
 * 样线（transect）相关类型。
 * 字段与 scripts/scan-transects.mjs 输出的
 *   - public/data/transects-manifest.json
 *   - public/data/transects/<id>.geojson
 * 严格对齐。
 */

export type MatchType = 'strict' | 'approximate' | 'unassigned';

export interface LngLatPoint {
  lng: number;
  lat: number;
}

export interface TransectExtra {
  pos_start_name: string | null; // KML 里 ExtendedData 的 PosStartName
  pos_end_name: string | null;
  track_tags: string | null;
  creator: string | null; // 原始作者（OriginCreaterNickname）
}

export interface TransectManifestEntry {
  // === 标识 ===
  id: string;            // 唯一 id，例如 "LS-20"
  name: string;          // 显示名（与 id 同源）
  source_file: string;   // 相对 DATA_ROOT 的源文件路径
  geojson_path: string;  // 前端 fetch 用，如 "/data/transects/LS-20.geojson"

  // === 归属 ===
  reserve_code: string | null;     // 例如 "SXNR-06"
  reserve_name: string | null;     // 例如 "历山国家级自然保护区"
  match_type: MatchType;            // strict / approximate / unassigned
  match_distance_km: number | null; // approximate 时填，距边界多少 km

  // === 时间 ===
  start_time: string | null;       // ISO8601
  end_time: string | null;
  duration_seconds: number | null;

  // === 几何统计 ===
  point_count: number;
  distance_meters: number;          // haversine 重算
  elevation_min: number | null;
  elevation_max: number | null;
  elevation_gain: number;
  elevation_loss: number;           // 绝对值
  start_point: LngLatPoint | null;
  end_point: LngLatPoint | null;
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

  // === 辅助元数据（来自 KML ExtendedData，不依赖） ===
  extra: TransectExtra;
}
