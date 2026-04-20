/**
 * 在地图上渲染所有保护区。
 *
 * 三态样式（统一蓝色）：
 *   - 默认：     fill #2563eb / 0.25  border #1e40af / 2px
 *   - hover：     fill 0.40           border 3px
 *   - selected：  fill 0.45           border #1e3a8a / 3.5px
 *
 * 两种渲染形式：
 *   1) reserve.geojson_path 非 null 且 fetch 成功 → 真实多边形（GeoJSON）
 *   2) geojson_path 为 null 或 fetch 失败 → 虚线占位圆（Circle）
 *
 * 永久标签：在形状中央常显简化名（zoom < 7 时整体隐藏）
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, GeoJSON, Tooltip, useMap } from 'react-leaflet';
import type { Circle as LeafletCircle, GeoJSON as LeafletGeoJSON, PathOptions } from 'leaflet';
import type { FeatureCollection } from 'geojson';
import type { Reserve } from '@/types';

interface ReserveLayerProps {
  reserves: Reserve[];
  selectedReserveCode: string | null;
  onReserveClick: (reserve: Reserve) => void;
}

/** 去掉末尾的"国家级自然保护区"，得到核心简称 */
function shortName(name: string): string {
  return name.replace(/国家级自然保护区$/, '');
}

// === 统一颜色常量 ===
const FILL = '#3b82f6';            // blue-500，比之前 blue-600 浅一档
const BORDER = '#2563eb';          // blue-600，未选中边框
const BORDER_SELECTED = '#1e3a8a'; // blue-900，选中边框（深，承担"选中"视觉）

/**
 * 三态样式（选中主要靠边框区分，填充始终很浅）：
 *   default  : fill 0.12 / border 1.5
 *   hover    : fill 0.22 / border 2.5
 *   selected : fill 0.22 / border 4   color 深蓝
 *
 * 占位圆（SXNR-07/08）保持 weight 2 + 虚线 6 6，不随交互改变粗细，
 * 但填充与边框颜色仍随 hover/selected 切换。
 */
function pathStyle(
  isSelected: boolean,
  hover: boolean,
  isPlaceholder: boolean,
): PathOptions {
  if (isPlaceholder) {
    return {
      color: isSelected ? BORDER_SELECTED : BORDER,
      weight: 2,
      dashArray: '6 6',
      fillColor: FILL,
      fillOpacity: isSelected ? 0.22 : hover ? 0.22 : 0.12,
    };
  }
  return {
    color: isSelected ? BORDER_SELECTED : BORDER,
    weight: isSelected ? 4 : hover ? 2.5 : 1.5,
    fillColor: FILL,
    fillOpacity: isSelected ? 0.22 : hover ? 0.22 : 0.12,
    dashArray: undefined,
  };
}

export default function ReserveLayer({
  reserves,
  selectedReserveCode,
  onReserveClick,
}: ReserveLayerProps) {
  const map = useMap();

  // zoom < 7 时给 map 容器加 .low-zoom，让标签隐藏
  useEffect(() => {
    const container = map.getContainer();
    const update = () => {
      container.classList.toggle('low-zoom', map.getZoom() < 7);
    };
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  return (
    <>
      {reserves.map((r) => (
        <ReserveItem
          key={r.id}
          reserve={r}
          isSelected={r.code === selectedReserveCode}
          onClick={() => onReserveClick(r)}
        />
      ))}
    </>
  );
}

function ReserveItem({
  reserve,
  isSelected,
  onClick,
}: {
  reserve: Reserve;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hover, setHover] = useState(false);
  const label = shortName(reserve.name);

  useEffect(() => {
    if (!reserve.geojson_path) return;
    let cancelled = false;
    fetch(reserve.geojson_path)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: FeatureCollection) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) {
          console.warn(`[ReserveLayer] ${reserve.code} 几何加载失败：`, e);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reserve.geojson_path, reserve.code]);

  const isPlaceholder = !reserve.geojson_path || loadFailed;
  const style = useMemo(
    () => pathStyle(isSelected, hover, isPlaceholder),
    [isSelected, hover, isPlaceholder],
  );

  // === 占位圆 ===
  const circleRef = useRef<LeafletCircle | null>(null);
  useEffect(() => {
    if (isPlaceholder) circleRef.current?.setStyle(style);
  }, [isPlaceholder, style]);

  if (isPlaceholder) {
    return (
      <Circle
        ref={circleRef}
        center={[reserve.centerLat, reserve.centerLng]}
        radius={reserve.radiusDeg * 111000}
        pathOptions={style}
        eventHandlers={{
          mouseover: () => setHover(true),
          mouseout: () => setHover(false),
          click: onClick,
        }}
      >
        <Tooltip permanent direction="center" className="reserve-label" opacity={1}>
          {label}
        </Tooltip>
      </Circle>
    );
  }

  // === 真实 GeoJSON 多边形 ===
  // GeoJSON ref 拿到 layer，靠 useEffect + setStyle 同步样式（style prop 只在 mount 时执行）
  const geoRef = useRef<LeafletGeoJSON | null>(null);
  useEffect(() => {
    geoRef.current?.setStyle(style);
  }, [style]);

  if (!data) return null;

  return (
    <GeoJSON
      ref={geoRef}
      data={data}
      style={() => style}
      onEachFeature={(_feat, layer) => {
        layer.on({
          mouseover: () => setHover(true),
          mouseout: () => setHover(false),
          click: onClick,
        });
        layer.bindTooltip(label, {
          permanent: true,
          direction: 'center',
          className: 'reserve-label',
          opacity: 1,
        });
      }}
    />
  );
}
