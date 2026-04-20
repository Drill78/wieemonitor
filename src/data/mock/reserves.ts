/**
 * 山西省 8 个国家级自然保护区元数据。
 *
 * 几何（边界多边形）由 scripts/fetch-reserves.mjs 从 OSM 下载并存到
 * public/geo/reserves/<CODE>.geojson。本文件只保存元数据 + geojson_path。
 *
 * TODO: 阶段 3 改为从 /api/reserves 获取；
 *       几何从 PostGIS 直接取并以 GeoJSON 返回。
 */

import type { Reserve } from '@/types';

export const reserves: Reserve[] = [
  {
    id: 1,
    code: 'SXNR-01',
    name: '芦芽山国家级自然保护区',
    province: '山西',
    description:
      '位于管涔山北端，主要保护褐马鸡及其栖息地、华北落叶松原始林、亚高山草甸。海拔变化大，垂直生态带分明。',
    color: '#2563eb', // blue-600（统一保护区色）
    geojson_path: '/geo/reserves/SXNR-01.geojson',
    centerLat: 38.75,
    centerLng: 111.95,
    radiusDeg: 0.15,
  },
  {
    id: 2,
    code: 'SXNR-02',
    name: '庞泉沟国家级自然保护区',
    province: '山西',
    description:
      '位于吕梁山中段，主要保护褐马鸡（中国特有珍稀雉类）和云杉林等森林生态系统，面积约 104 km²。',
    color: '#2563eb', // blue-600（统一保护区色）
    geojson_path: '/geo/reserves/SXNR-02.geojson',
    centerLat: 37.83,
    centerLng: 111.46,
    radiusDeg: 0.09,
  },
  {
    id: 3,
    code: 'SXNR-03',
    name: '黑茶山国家级自然保护区',
    province: '山西',
    description:
      '位于吕梁山中段（兴县），保护对象包括褐马鸡、原麝、金钱豹及其森林栖息地。',
    color: '#2563eb', // blue-600（统一保护区色）
    geojson_path: '/geo/reserves/SXNR-03.geojson',
    centerLat: 38.38,
    centerLng: 111.25,
    radiusDeg: 0.12,
  },
  {
    id: 4,
    code: 'SXNR-04',
    name: '五鹿山国家级自然保护区',
    province: '山西',
    description:
      '位于吕梁山南端（蒲县、隰县一带），主要保护对象为褐马鸡和白皮松等珍稀物种。',
    color: '#2563eb', // blue-600（统一保护区色）
    geojson_path: '/geo/reserves/SXNR-04.geojson',
    centerLat: 36.68,
    centerLng: 111.16,
    radiusDeg: 0.12,
  },
  {
    id: 5,
    code: 'SXNR-05',
    name: '灵空山国家级自然保护区',
    province: '山西',
    description:
      '位于太岳山脉，以油松为主的暖温带针阔叶森林生态系统是主要保护对象。',
    color: '#2563eb', // blue-600（统一保护区色）
    geojson_path: '/geo/reserves/SXNR-05.geojson',
    centerLat: 36.65,
    centerLng: 112.18,
    radiusDeg: 0.09,
  },
  {
    id: 6,
    code: 'SXNR-06',
    name: '历山国家级自然保护区',
    province: '山西',
    description:
      '位于中条山主峰，是华北地区唯一保存较完整的原始森林。野生猕猴种群、金钱豹、原麝等。',
    color: '#2563eb', // blue-600（统一保护区色）
    geojson_path: '/geo/reserves/SXNR-06.geojson',
    centerLat: 35.45,
    centerLng: 111.92,
    radiusDeg: 0.17,
  },
  {
    id: 7,
    code: 'SXNR-07',
    name: '太宽河国家级自然保护区',
    province: '山西',
    description:
      '位于中条山西端（垣曲县），2018 年由省级晋升为国家级，保护暖温带森林生态系统。',
    color: '#2563eb', // blue-600（统一保护区色）
    // OSM 当前没有 boundary=protected_area / leisure=nature_reserve 的条目；
    // ReserveLayer 会渲染为虚线占位圆。后续可由用户上传 shapefile 补齐。
    geojson_path: null,
    centerLat: 35.28,
    centerLng: 111.65,
    radiusDeg: 0.10,
  },
  {
    id: 8,
    code: 'SXNR-08',
    name: '阳城蟒河猕猴国家级自然保护区',
    province: '山西',
    description:
      '位于中条山东端，是太行猕猴（华北亚种）分布的最北限，重要的灵长类栖息地。',
    color: '#2563eb', // blue-600（统一保护区色）
    // OSM 当前没有 boundary=protected_area / leisure=nature_reserve 的条目；
    // ReserveLayer 会渲染为虚线占位圆。后续可由用户上传 shapefile 补齐。
    geojson_path: null,
    centerLat: 35.25,
    centerLng: 112.45,
    radiusDeg: 0.07,
  },
];
