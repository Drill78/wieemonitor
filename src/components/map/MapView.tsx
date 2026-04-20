/**
 * 地图主组件（Client only）。
 *
 * 阶段 1.4：保护区数据从 props 传入（46 个 ReserveRegistryEntry），
 *           增加 displayMode（zones/merged）+ levelFilter 两个 props。
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
import type {
  CameraManifestEntry,
  ReserveLevel,
  ReserveRegistryEntry,
  TransectManifestEntry,
} from '@/types';
import type { DisplayMode } from '@/components/layout/Sidebar';

const TRANSECT_COLOR = '#dc2626'; // red-600

L.Icon.Default.mergeOptions({
  iconRetinaUrl: (iconRetinaUrl as unknown as { src: string }).src,
  iconUrl: (iconUrl as unknown as { src: string }).src,
  shadowUrl: (shadowUrl as unknown as { src: string }).src,
});

interface MapViewProps {
  reserves: ReserveRegistryEntry[];
  selectedReserve: ReserveRegistryEntry | null;
  onReserveClick: (reserve: ReserveRegistryEntry) => void;
  displayMode: DisplayMode;
  levelFilter: Record<ReserveLevel, boolean>;

  transects: TransectManifestEntry[];
  selectedTransectId: string | null;

  cameras: CameraManifestEntry[];
  selectedCameraId: string | null;
  onCameraClick: (camera: CameraManifestEntry) => void;
}

const SHANXI_CENTER: [number, number] = [37.8, 112.4];
const SHANXI_ZOOM = 7;

export default function MapView({
  reserves,
  selectedReserve,
  onReserveClick,
  displayMode,
  levelFilter,
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
      <ScaleControl position="bottomleft" imperial={false} metric maxWidth={200} />

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

      <ShanxiBoundary />

      <ReserveLayer
        reserves={reserves}
        selectedReserveCode={selectedReserve?.code ?? null}
        onReserveClick={(r) => {
          onReserveClick(r);
          mapRef.current?.flyTo([r.center.lat, r.center.lng], 11, {
            duration: 1.2,
          });
        }}
        displayMode={displayMode}
        levelFilter={levelFilter}
      />

      <TransectsLayer
        transects={transects}
        selectedTransectId={selectedTransectId}
        color={TRANSECT_COLOR}
      />

      <CameraLayer
        cameras={cameras}
        selectedCameraId={selectedCameraId}
        onCameraClick={onCameraClick}
      />
    </MapContainer>
  );
}
