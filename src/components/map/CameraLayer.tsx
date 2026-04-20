/**
 * 相机图层。
 *
 * - 用 L.divIcon + 📷 emoji 渲染（无需图片资源；HiDPI 屏幕清晰）
 * - 选中态：图标更大 + 黄色光晕
 * - hover：tooltip 显示 id + 小地名
 * - click：调父组件 onCameraClick
 */

'use client';

import { useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { CameraManifestEntry } from '@/types';

interface CameraLayerProps {
  cameras: CameraManifestEntry[];
  selectedCameraId: string | null;
  onCameraClick: (camera: CameraManifestEntry) => void;
}

function makeCameraIcon(selected: boolean): L.DivIcon {
  const size = selected ? 34 : 26;
  const scale = selected ? 1.3 : 1;
  const glow = selected
    ? 'drop-shadow(0 0 8px #facc15) drop-shadow(0 0 4px #fff)'
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))';
  const html = `<div style="
    font-size: ${size}px;
    line-height: 1;
    text-align: center;
    filter: ${glow};
    transform: scale(${scale});
    transition: transform 120ms ease;
    cursor: pointer;
    user-select: none;
  ">📷</div>`;
  return L.divIcon({
    html,
    className: 'wiee-camera-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function CameraLayer({
  cameras,
  selectedCameraId,
  onCameraClick,
}: CameraLayerProps) {
  // 简单缓存图标避免每次重新构造（两种状态足够）
  const iconNormal = useMemo(() => makeCameraIcon(false), []);
  const iconSelected = useMemo(() => makeCameraIcon(true), []);

  return (
    <>
      {cameras.map((cam) => {
        const isSelected = cam.id === selectedCameraId;
        const subLabel =
          cam.address?.locality?.trim() ||
          cam.address?.village?.trim() ||
          '';
        return (
          <Marker
            key={cam.id}
            position={[cam.lat, cam.lng]}
            icon={isSelected ? iconSelected : iconNormal}
            eventHandlers={{ click: () => onCameraClick(cam) }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              <div className="font-semibold">{cam.id}</div>
              {subLabel && (
                <div className="text-xs text-slate-600">{subLabel}</div>
              )}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
