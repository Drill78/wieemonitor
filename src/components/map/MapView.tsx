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
  LayerGroup,
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

// ── 天地图底图配置 ──────────────────────────────────────────────
// 天地图（国家测绘地理信息局）在国内访问稳定，作为默认底图。
// 浏览器端 key 通过 NEXT_PUBLIC_* 注入，会暴露在前端，需在天地图控制台配 referer 白名单。
const TIANDITU_KEY = process.env.NEXT_PUBLIC_TIANDITU_KEY ?? '';
const HAS_TIANDITU_KEY = TIANDITU_KEY.length > 0;

if (!HAS_TIANDITU_KEY) {
  // 没配 key 时不阻塞：天地图图层仍会渲染但请求 403，默认底图回退到「标准图（OSM）」。
  console.warn(
    '[MapView] 未配置 NEXT_PUBLIC_TIANDITU_KEY，天地图底图将无法加载，' +
      '默认底图回退到「标准图（OSM）」。请在 .env.local 中配置该变量。',
  );
}

// 天地图 8 个子域 t0~t7，配合 Leaflet 的 {s} 占位符自动轮询。
const TIANDITU_SUBDOMAINS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];

/**
 * 生成天地图 WMTS 瓦片 URL。
 * @param service 服务路径段，如 'vec_w' / 'cva_w' / 'img_w' …
 * @param layer   LAYER 参数，如 'vec' / 'cva' / 'img' …
 */
function tdtUrl(service: string, layer: string): string {
  return (
    `https://{s}.tianditu.gov.cn/${service}/wmts` +
    `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
    `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`
  );
}

const TIANDITU_ATTRIBUTION = '© 天地图 / 国家地理信息公共服务平台';

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
        {/* ── 天地图三项（国内稳定，默认）。每项 = 底图 + 中文注记两层叠加 ── */}
        <LayersControl.BaseLayer checked={HAS_TIANDITU_KEY} name="天地图·矢量">
          <LayerGroup>
            <TileLayer
              url={tdtUrl('vec_w', 'vec')}
              subdomains={TIANDITU_SUBDOMAINS}
              attribution={TIANDITU_ATTRIBUTION}
              maxNativeZoom={18}
              maxZoom={19}
            />
            <TileLayer
              url={tdtUrl('cva_w', 'cva')}
              subdomains={TIANDITU_SUBDOMAINS}
              maxNativeZoom={18}
              maxZoom={19}
            />
          </LayerGroup>
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="天地图·影像">
          <LayerGroup>
            <TileLayer
              url={tdtUrl('img_w', 'img')}
              subdomains={TIANDITU_SUBDOMAINS}
              attribution={TIANDITU_ATTRIBUTION}
              maxNativeZoom={18}
              maxZoom={19}
            />
            <TileLayer
              url={tdtUrl('cia_w', 'cia')}
              subdomains={TIANDITU_SUBDOMAINS}
              maxNativeZoom={18}
              maxZoom={19}
            />
          </LayerGroup>
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="天地图·地形">
          <LayerGroup>
            <TileLayer
              url={tdtUrl('ter_w', 'ter')}
              subdomains={TIANDITU_SUBDOMAINS}
              attribution={TIANDITU_ATTRIBUTION}
              maxNativeZoom={18}
              maxZoom={19}
            />
            <TileLayer
              url={tdtUrl('cta_w', 'cta')}
              subdomains={TIANDITU_SUBDOMAINS}
              maxNativeZoom={18}
              maxZoom={19}
            />
          </LayerGroup>
        </LayersControl.BaseLayer>

        {/* ── 备用底图三项（国内不稳定但保留）。无天地图 key 时「标准图」兜底默认选中 ── */}
        <LayersControl.BaseLayer checked={!HAS_TIANDITU_KEY} name="标准图（OSM）">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxNativeZoom={19}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="卫星图（Esri）">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri"
            maxNativeZoom={19}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="等高线（OpenTopoMap）">
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
