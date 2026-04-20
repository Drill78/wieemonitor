/**
 * 保护区（reserve）相关类型。
 * 数据来源：scripts/scan-reserves.mjs 从山西省林草局 shapefile 生成的
 *   - public/geo/reserves-registry.json（46 个保护区元信息索引）
 *   - public/geo/reserves/<CODE>.geojson         三区分层
 *   - public/geo/reserves/<CODE>.merged.geojson  合并显示
 *
 * 编码规则：
 *   national   → SXNR-N01..N08
 *   provincial → SXPR-P01..P35
 *   other      → SXOR-O01..O03
 *
 * 兼容旧编码（OSM 时期硬编码的 SXNR-01..08）：
 *   ReserveRegistryEntry.legacy_code 字段保存映射。
 */

export type ReserveLevel = 'national' | 'provincial' | 'other';
export type ReserveZone = 'core' | 'buffer' | 'experimental' | 'unknown';

export interface ReserveZoneInfo {
  area_km2: number | null;
  feature_count: number;
  source_file?: string;
  official_area_ha?: number | null;
}

export interface ReserveRegistryEntry {
  code: string;                    // 例如 SXNR-N02
  legacy_code: string | null;      // 例如 SXNR-06；用于兼容旧 transects/cameras manifest
  name_full: string;               // 例如 山西历山国家级自然保护区
  name_short: string;              // 例如 历山，用于地图标签
  level: ReserveLevel;
  center: { lat: number; lng: number };
  bbox: [number, number, number, number]; // minLng minLat maxLng maxLat
  area_km2_total: number | null;
  zones: {
    core?: ReserveZoneInfo;
    buffer?: ReserveZoneInfo;
    experimental?: ReserveZoneInfo;
    unknown?: ReserveZoneInfo;
  };
  geojson_path: string;            // 三区分层 FeatureCollection
  merged_geojson_path: string;     // 合并 FeatureCollection（单 Feature）
  source_file: string;
}

export interface ReserveRegistry {
  generated_at: string;
  source: string;
  count: number;
  by_level: Record<ReserveLevel, number>;
  reserves: ReserveRegistryEntry[];
}
