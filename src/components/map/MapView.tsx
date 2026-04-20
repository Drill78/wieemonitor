/**
 * 地图主组件（Client only）。
 *
 * 注意事项：
 *  1. 必须是 Client Component，Leaflet 访问 window/document
 *  2. 在 page.tsx 通过 next/dynamic ssr:false 引入，避免 SSR 报错
 *  3. 修复 Leaflet 默认 marker 图标的打包路径问题（阶段 2 红外相机要用）
 *  4. 坐标系：所有数据 WGS84；底图也是 WGS84 兼容
 *
 * 本轮新增：
 *  - 山西省轮廓底层（ShanxiBoundary）
 *  - 三种底图通过 LayersControl 切换：标准/卫星/等高线
 *  - 比例尺 ScaleControl
 *  - 滚轮缩放调速 + zoom 步长 0.5
 */

'use client';

import { useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  LayersControl,
  ScaleControl,
} from 'react-leaflet';
import L from 'leaflet';
import type { Map as LeafletMap } from 'leaflet';

// Leaflet 默认 marker 图标修复（Webpack 打包后路径丢失）
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

import ReserveLayer from './ReserveLayer';
import ShanxiBoundary from './ShanxiBoundary';
import TransectsLayer from './TransectsLayer';
import CameraLayer from './CameraLayer';
import { reserves } from '@/data/mock/reserves';
import type {
  CameraManifestEntry,
  Reserve,
  TransectManifestEntry,
} from '@/types';

const TRANSECT_COLOR = '#dc2626'; // red-600

// 模块顶层只在浏览器执行（dynamic ssr:false）
L.Icon.Default.mergeOptions({
  iconRetinaUrl: (iconRetinaUrl as unknown as { src: string }).src,
  iconUrl: (iconUrl as unknown as { src: string }).src,
  shadowUrl: (shadowUrl as unknown as { src: string }).src,
});

interface MapViewProps {
  onReserveClick: (reserve: Reserve) => void;
  selectedReserve: Reserve | null;
  transects: TransectManifestEntry[];
  selectedTransectId: string | null;
  cameras: CameraManifestEntry[];
  selectedCameraId: string | null;
  onCameraClick: (camera: CameraManifestEntry) => void;
}

// 山西省中心略偏北
const SHANXI_CENTER: [number, number] = [37.8, 112.4];
const SHANXI_ZOOM = 7;

export default function MapView({
  onReserveClick,
  selectedReserve,
  transects,
  selectedTransectId,
  cameras,
  selectedCameraId,
  onCameraClick,
}: MapViewProps) {
  const mapRef = useRef<LeafletMap | null>(null);

  return (
    <MapContainer
      center={SHANXI_CENTER}
      zoom={SHANXI_ZOOM}
      minZoom={6}
      maxZoom={19}
      zoomSnap={0.5}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      wheelDebounceTime={40}
      className="h-full w-full"
      ref={mapRef}
    >
      {/* 比例尺：左下角，米制 */}
      <ScaleControl position="bottomleft" imperial={false} metric maxWidth={200} />

      {/* 底图切换：左上角（避开右侧 Sidebar 弹出区域） */}
      <LayersControl position="topleft">
        <LayersControl.BaseLayer checked name="标准图">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxNativeZoom={19}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="卫星图">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
            maxNativeZoom={19}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="等高线">
          <TileLayer
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenTopoMap (CC-BY-SA)"
            maxNativeZoom={17}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* 山西省轮廓（鼠标穿透，渲染在保护区图层之前） */}
      <ShanxiBoundary />

      {/* 保护区图层 */}
      <ReserveLayer
        reserves={reserves}
        selectedReserveCode={selectedReserve?.code ?? null}
        onReserveClick={(r) => {
          onReserveClick(r);
          // 飞到保护区中心，稍微放大观察内部
          mapRef.current?.flyTo([r.centerLat, r.centerLng], 11, {
            duration: 1.2,
          });
        }}
      />

      {/* 当前保护区下所有样线（默认全展示，选中态高亮）。渲染在保护区之上 */}
      <TransectsLayer
        transects={transects}
        selectedTransectId={selectedTransectId}
        color={TRANSECT_COLOR}
      />

      {/* 当前样线下所有相机点位。最上层，确保压在轨迹之上 */}
      <CameraLayer
        cameras={cameras}
        selectedCameraId={selectedCameraId}
        onCameraClick={onCameraClick}
      />
    </MapContainer>
  );
}
