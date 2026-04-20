/**
 * 根布局：渲染全局 Header（在所有路由共享），下方放页面内容。
 * - lang="zh-CN"，全站中文
 * - body 设为 flex flex-col，使 Header + 内容垂直堆叠
 * - 字体使用系统默认 + 中文字体回退；不引入 Geist
 */

import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/layout/Header';

export const metadata: Metadata = {
  title: 'WIEE Monitor · 沃成生态环境研究所监测平台',
  description: 'WIEE 生态监测多模态数据平台 — 聚合样线、红外相机、生物信息、声音数据',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Header />
        {children}
      </body>
    </html>
  );
}
