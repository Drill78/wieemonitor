import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 关闭 Next 16 左下角浮动的 dev indicator（会挡住 Leaflet 比例尺）
  devIndicators: false,
};

export default nextConfig;
