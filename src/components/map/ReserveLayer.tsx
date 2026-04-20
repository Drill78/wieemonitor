/**
 * 在地图上渲染所有保护区（46 个）。
 *
 * 两种显示模式（由父组件 displayMode prop 控制）：
 *   - 'zones'   ：三区分层，深蓝核心 / 中蓝缓冲 / 浅蓝实验
 *   - 'merged'  ：合并显示，单层 blue-500
 *
 * 级别筛选（levelFilter prop）：勾选哪些级别才渲染。
 *
 * 选中态（selectedReserveCode）：边框色 #1e3a8a + 加粗。
 *
 * 标签策略（zoom 阈值）：
 *   - zoom < 8 ：全部隐藏
 *   - zoom 8-9：只显国家级
 *   - zoom ≥ 10：全部显示
 *
 * 每个保护区的 fetch + 渲染封装在 ReserveItem 子组件，
 * 切换 displayMode/code 时自然 unmount 重挂载（用 key 控制）。
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { GeoJSON, Tooltip, useMap } from 'react-leaflet';
import type { GeoJSON as LeafletGeoJSON, PathOptions } from 'leaflet';
import type { FeatureCollection, Feature } from 'geojson';
import type {
  ReserveLevel,
  ReserveRegistryEntry,
  ReserveZone,
} from '@/types';
import {
  BORDER_DEFAULT,
  BORDER_SELECTED,
  MERGED_COLOR,
  ZONE_COLORS,
} from '@/lib/reserves';
import type { DisplayMode } from '@/components/layout/Sidebar';

interface ReserveLayerProps {
  reserves: ReserveRegistryEntry[];
  selectedReserveCode: string | null;
  onReserveClick: (reserve: ReserveRegistryEntry) => void;
  displayMode: DisplayMode;
  levelFilter: Record<ReserveLevel, boolean>;
}

// ===== 标签可见性 ======
//   < 8       全隐藏
//   [8, 10)   只 national
//   ≥ 10      全显
function getLabelClassesForZoom(zoom: number): {
  hideAll: boolean;
  hideProvincialAndOther: boolean;
} {
  if (zoom < 8) return { hideAll: true, hideProvincialAndOther: false };
  if (zoom < 10) return { hideAll: false, hideProvincialAndOther: true };
  return { hideAll: false, hideProvincialAndOther: false };
}

export default function ReserveLayer({
  reserves,
  selectedReserveCode,
  onReserveClick,
  displayMode,
  levelFilter,
}: ReserveLayerProps) {
  const map = useMap();

  // 同步 zoom 决定的 label 显示状态到 map 容器的 class，由 CSS 控制 display
  useEffect(() => {
    const container = map.getContainer();
    const update = () => {
      const z = map.getZoom();
      const { hideAll, hideProvincialAndOther } = getLabelClassesForZoom(z);
      container.classList.toggle('reserve-labels-hidden-all', hideAll);
      container.classList.toggle(
        'reserve-labels-hidden-provincial',
        hideProvincialAndOther,
      );
    };
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);

  const visible = reserves.filter((r) => levelFilter[r.level]);

  return (
    <>
      {visible.map((r) => (
        <ReserveItem
          // key 含 displayMode → 切换模式时 unmount + remount，逻辑简单
          key={`${r.code}__${displayMode}`}
          reserve={r}
          isSelected={r.code === selectedReserveCode}
          onClick={() => onReserveClick(r)}
          displayMode={displayMode}
        />
      ))}
    </>
  );
}

// ===== 单个保护区 =====

function ReserveItem({
  reserve,
  isSelected,
  onClick,
  displayMode,
}: {
  reserve: ReserveRegistryEntry;
  isSelected: boolean;
  onClick: () => void;
  displayMode: DisplayMode;
}) {
  const [data, setData] = useState<FeatureCollection | null>(null);
  const [hover, setHover] = useState(false);
  const layerRef = useRef<LeafletGeoJSON | null>(null);

  // 拉对应模式的 geojson
  useEffect(() => {
    let cancelled = false;
    const url =
      displayMode === 'merged'
        ? reserve.merged_geojson_path
        : reserve.geojson_path;
    setData(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: FeatureCollection) => {
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        console.warn(`[ReserveLayer] ${reserve.code} 几何加载失败：`, e);
      });
    return () => {
      cancelled = true;
    };
  }, [reserve.code, reserve.geojson_path, reserve.merged_geojson_path, displayMode]);

  // 选中/hover 变化时刷新样式
  useEffect(() => {
    if (!layerRef.current) return;
    layerRef.current.eachLayer((sub) => {
      const f = (sub as unknown as { feature?: Feature }).feature;
      const zone = (f?.properties?.zone as ReserveZone | undefined) ?? 'unknown';
      const isMerged = displayMode === 'merged';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sub as any).setStyle(
        styleFor(isMerged ? 'merged' : zone, isSelected, hover),
      );
    });
  }, [isSelected, hover, displayMode]);

  if (!data) return null;

  return (
    <GeoJSON
      ref={layerRef}
      data={data}
      style={(feat) => {
        const zone =
          (feat?.properties?.zone as ReserveZone | undefined) ?? 'unknown';
        const isMerged = displayMode === 'merged';
        return styleFor(isMerged ? 'merged' : zone, isSelected, hover);
      }}
      onEachFeature={(feat, layer) => {
        layer.on({
          mouseover: () => setHover(true),
          mouseout: () => setHover(false),
          click: onClick,
        });

        // 永久标签：只挂在"代表性"的那个 feature 上
        //   - merged 模式：唯一的那个 Feature
        //   - zones 模式：core feature（如果没有则 buffer / experimental）
        const isMerged = displayMode === 'merged';
        const zone = (feat?.properties?.zone as ReserveZone | undefined) ?? 'unknown';
        const labelMain =
          isMerged || zone === 'core' || (zone === 'buffer' && !data.features.some((f) => f.properties?.zone === 'core'));

        if (labelMain) {
          layer.bindTooltip(reserve.name_short, {
            permanent: true,
            direction: 'center',
            className: `reserve-label reserve-label--${reserve.level}`,
            opacity: 1,
          });
        }
      }}
    />
  );
}

// ===== 样式表 =====

function styleFor(
  zoneOrMerged: ReserveZone | 'merged',
  isSelected: boolean,
  hover: boolean,
): PathOptions {
  // 选中：深蓝粗边框压一切
  if (isSelected) {
    return {
      color: BORDER_SELECTED,
      weight: 3.5,
      fillColor:
        zoneOrMerged === 'merged' ? MERGED_COLOR : ZONE_COLORS[zoneOrMerged],
      fillOpacity:
        zoneOrMerged === 'merged'
          ? 0.32
          : zoneOrMerged === 'core'
            ? 0.55
            : zoneOrMerged === 'buffer'
              ? 0.35
              : 0.22,
      dashArray: undefined,
    };
  }

  if (zoneOrMerged === 'merged') {
    return {
      color: BORDER_DEFAULT,
      weight: hover ? 2.5 : 1.5,
      fillColor: MERGED_COLOR,
      fillOpacity: hover ? 0.32 : 0.22,
      dashArray: undefined,
    };
  }

  // zones 模式
  if (zoneOrMerged === 'core') {
    return {
      color: BORDER_DEFAULT,
      weight: hover ? 2.5 : 2,
      fillColor: ZONE_COLORS.core,
      fillOpacity: hover ? 0.55 : 0.45,
      dashArray: undefined,
    };
  }
  if (zoneOrMerged === 'buffer') {
    return {
      color: BORDER_DEFAULT,
      weight: hover ? 2 : 1.5,
      fillColor: ZONE_COLORS.buffer,
      fillOpacity: hover ? 0.35 : 0.25,
      dashArray: '4 2',
    };
  }
  if (zoneOrMerged === 'experimental') {
    return {
      color: BORDER_DEFAULT,
      weight: hover ? 1.5 : 1,
      fillColor: ZONE_COLORS.experimental,
      fillOpacity: hover ? 0.25 : 0.15,
      dashArray: '6 4',
    };
  }
  // unknown
  return {
    color: '#94a3b8',
    weight: 1,
    fillColor: ZONE_COLORS.unknown,
    fillOpacity: 0.2,
    dashArray: '2 4',
  };
}
