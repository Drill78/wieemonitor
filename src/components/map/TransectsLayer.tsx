/**
 * 当前保护区下所有样线的渲染层。
 *
 * 行为：
 *   - transects 为空 → 什么都不渲染
 *   - 默认状态（selectedTransectId=null）：所有样线"等亮度"（weight 3, opacity 0.7）
 *   - 选中某条：该条 weight 7 / opacity 1，其余 opacity 0.35
 *   - 起止点 marker 只显示选中那条的（避免堆叠）
 *   - selectedTransectId 变化时（且非 null）→ fitBounds 到该样线 bbox
 *   - selectedTransectId 变 null → 不调整视图（保留用户当前视角）
 *
 * 切换保护区：transects 数组替换，旧 polylines 自然 unmount。
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSON as LeafletGeoJSON } from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { TransectManifestEntry } from '@/types';
import { loadTransectGeoJson } from '@/lib/transects';

interface TransectsLayerProps {
  transects: TransectManifestEntry[];
  selectedTransectId: string | null;
  /** 样线主色，默认红 #dc2626 */
  color: string;
}

const START_MARKER_COLOR = '#16a34a'; // green-600
const END_MARKER_COLOR = '#111827';   // gray-900

export default function TransectsLayer({
  transects,
  selectedTransectId,
  color,
}: TransectsLayerProps) {
  const map = useMap();
  const [geos, setGeos] = useState<Record<string, FeatureCollection>>({});

  // 拉所有样线的 geojson（loadTransectGeoJson 自带缓存）
  useEffect(() => {
    let cancelled = false;
    for (const t of transects) {
      if (geos[t.id]) continue;
      loadTransectGeoJson(t.geojson_path)
        .then((fc) => {
          if (cancelled) return;
          setGeos((prev) => ({ ...prev, [t.id]: fc }));
        })
        .catch((e) => {
          console.warn(`[TransectsLayer] ${t.id} 加载失败：`, e);
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transects]);

  // 选中变化 → fitBounds（仅在选中非 null 时）
  useEffect(() => {
    if (!selectedTransectId) return;
    const sel = transects.find((t) => t.id === selectedTransectId);
    if (!sel) return;
    const [minLng, minLat, maxLng, maxLat] = sel.bbox;
    const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        paddingTopLeft: [60, 60],
        paddingBottomRight: [430, 60],
      });
    }
  }, [selectedTransectId, transects, map]);

  if (transects.length === 0) return null;

  const selected = selectedTransectId
    ? transects.find((t) => t.id === selectedTransectId) ?? null
    : null;

  return (
    <>
      {transects.map((t) => {
        const data = geos[t.id];
        if (!data) return null;
        const isSelected = t.id === selectedTransectId;
        const isDimmed = selectedTransectId !== null && !isSelected;
        return (
          <TransectPolyline
            key={t.id}
            data={data}
            color={color}
            weight={isSelected ? 7 : 3}
            opacity={isSelected ? 1 : isDimmed ? 0.35 : 0.7}
          />
        );
      })}

      {/* 起止点 marker：只给选中那条 */}
      {selected?.start_point && (
        <CircleMarker
          center={[selected.start_point.lat, selected.start_point.lng]}
          radius={8}
          pathOptions={{
            color: '#ffffff',
            weight: 3,
            fillColor: START_MARKER_COLOR,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            起点
          </Tooltip>
        </CircleMarker>
      )}

      {selected?.end_point && (
        <CircleMarker
          center={[selected.end_point.lat, selected.end_point.lng]}
          radius={8}
          pathOptions={{
            color: '#ffffff',
            weight: 3,
            fillColor: END_MARKER_COLOR,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            终点
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

/**
 * 单条轨迹线。把 weight/opacity 通过 setStyle 同步到 Leaflet 层，
 * 避免 react-leaflet GeoJSON 的 style 函数仅在挂载时执行的限制。
 */
function TransectPolyline({
  data,
  color,
  weight,
  opacity,
}: {
  data: FeatureCollection;
  color: string;
  weight: number;
  opacity: number;
}) {
  const layerRef = useRef<LeafletGeoJSON | null>(null);

  useEffect(() => {
    layerRef.current?.setStyle({ color, weight, opacity });
  }, [color, weight, opacity]);

  return (
    <GeoJSON
      ref={layerRef}
      data={data}
      style={() => ({ color, weight, opacity })}
    />
  );
}
