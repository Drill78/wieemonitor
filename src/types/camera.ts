/**
 * 相机（camera）相关类型。
 * 字段与 scripts/scan-cameras.mjs 输出的 public/data/cameras-manifest.json 严格对齐。
 */

export type CameraMatchType = 'by_grid_id' | 'by_proximity' | 'unassigned';

export interface CameraAddress {
  province?: string | null;
  city?: string | null;
  county?: string | null;
  township?: string | null;
  village?: string | null;
  locality?: string | null;
  group?: string | null;
}

export interface CameraManifestEntry {
  // === 标识与归属 ===
  id: string;                   // 相机编号，如 "LS18-01"
  seq?: number | null;
  geographic_unit?: string | null;
  grid_id_raw?: string | null;  // Excel 原始网格编号
  transect_id: string | null;   // 归属的样线 id（与 transect manifest 一致）
  reserve_code: string | null;  // 继承样线的保护区编码
  match_type: CameraMatchType;
  match_distance_m?: number | null;

  // === 位置 ===
  lng: number;
  lat: number;
  elevation_m?: number | null;

  // === 行政地址与微观环境 ===
  address: CameraAddress;
  slope?: string | null;
  slope_position?: string | null;
  aspect?: string | null;
  vegetation?: string | null;
  dominant_species?: string | null;
  coverage_pct?: string | number | null;

  // === 设备参数 ===
  model?: string | null;
  status?: string | null;
  storage?: string | null;
  capture_mode?: string | null;
  interval_s?: number | null;
  video_duration_s?: number | null;
  video_format?: string | null;
  photo_format?: string | null;
  burst_count?: number | null;
  sensitivity?: string | null;
  date_tag?: string | null;
  battery?: string | null;
  interference?: string | null;
  bilateral?: string | null;
  height_cm?: number | null;
  facing?: string | null;
  path_width_cm?: number | null;

  // === 部署记录 ===
  deployed_by?: string | null;
  deployed_at?: string | null;     // ISO8601
  retrieved_by?: string | null;
  retrieved_at?: string | null;    // ISO8601

  source_file: string;
}
