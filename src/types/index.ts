/**
 * 全局 TypeScript 类型定义。
 *
 * 设计原则：字段命名尽量与 docs/DATA_MODEL.md 中的数据库表对齐，
 * 阶段 3 把 mock 数据切换为真实 API 时，前端类型几乎不用改。
 */

// 各模块的类型定义集中在子模块，这里 re-export 方便统一引用
export * from './transect';

/**
 * 保护区。对应 docs/DATA_MODEL.md → shared.reserves 表。
 *
 * 阶段 0：mock 数据；几何来自 public/geo/reserves/<code>.geojson
 *        （由 scripts/fetch-reserves.mjs 从 OSM 下载）
 * 阶段 3：改为从 /api/reserves 拉取，几何从数据库 PostGIS 字段派生
 */
export interface Reserve {
  id: number;
  code: string;              // 业务编号，例如 SXNR-01
  name: string;              // 中文名
  province: string;          // 所属省份
  description: string;       // 简介（用于侧边栏展示）
  color: string;             // CSS 颜色字符串，用作多边形 fill / 边框
  /**
   * 几何文件的 public 相对路径。null 表示 OSM 下载失败，
   * 渲染时会退化成虚线占位圆。
   * 示例："/geo/reserves/SXNR-01.geojson"
   */
  geojson_path: string | null;
  // 近似中心点，用于 flyTo 和占位圆中心（WGS84）
  centerLat: number;
  centerLng: number;
  // 占位圆半径（度，粗略，用 111km/° 近似换算为米）
  radiusDeg: number;
}
