/**
 * 山西省边界图层。
 *
 * 启动时 fetch /geo/shanxi.geojson（来自 DataV.GeoAtlas），
 * 用 react-leaflet 的 GeoJSON 渲染极浅翠绿填充 + emerald-700 边框。
 * interactive=false：鼠标穿透，不挡保护区点击。
 *
 * 同时承担"首次自动 fitBounds 到山西省"的职责：
 *   - 数据加载完成、layer add 到 map 时，map.fitBounds(layer.getBounds())
 *   - 右下角额外留 430px padding 给 Sidebar 弹出空间
 *   - 用 useRef 保证只触发一次（不影响后续点保护区的 flyTo）
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';
import type { GeoJSON as LeafletGeoJSON } from 'leaflet';

export default function ShanxiBoundary() {
  const [data, setData] = useState<GeoJsonObject | null>(null);
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/geo/shanxi.geojson')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: GeoJsonObject) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        // 静默失败 —— 山西轮廓不影响主功能
        console.warn('[ShanxiBoundary] geojson 加载失败：', e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  return (
    <GeoJSON
      data={data}
      interactive={false}
      style={() => ({
        color: '#047857', // emerald-700
        weight: 2,
        fillColor: '#10b981', // emerald-500
        fillOpacity: 0.07,
      })}
      eventHandlers={{
        add: (e) => {
          // 只在第一次 add 时 fit；之后用户点保护区的 flyTo 不受影响
          if (fittedRef.current) return;
          const layer = e.target as LeafletGeoJSON;
          const bounds = layer.getBounds();
          if (!bounds.isValid()) return;
          map.fitBounds(bounds, {
            // 右下多留 400px 给 Sidebar + 30px 余量
            paddingTopLeft: [30, 30],
            paddingBottomRight: [430, 30],
          });
          fittedRef.current = true;
        },
      }}
    />
  );
}
