/**
 * 全局顶栏（Client Component）。
 *
 * 三栏布局：
 *   左 (flex-1)：Logo「WIEE Monitor」（点击回首页）
 *   中 (flex-none)：4 个数据模块导航按钮
 *   右 (flex-1)：副标题「沃成生态环境研究所 · 生态监测数据平台」（窄屏隐藏）
 *
 * 注意：模块按钮跳转到独立列表页（/transects 等），与"地图上点保护区弹 Sidebar"
 * 是两种独立交互。
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/transects', label: '样线数据' },
  { href: '/cameras', label: '红外相机' },
  { href: '/biology', label: '生物信息' },
  { href: '/acoustic', label: '声音数据' },
];

export default function Header() {
  const pathname = usePathname() ?? '/';

  return (
    <header className="h-16 bg-emerald-900 text-white flex items-center px-6 shadow-md shrink-0">
      {/* 左：Logo */}
      <div className="flex-1 flex justify-start">
        <Link
          href="/"
          className="text-2xl font-bold tracking-wide hover:opacity-90 transition"
        >
          WIEE Monitor
        </Link>
      </div>

      {/* 中：导航 */}
      <nav className="flex-none flex items-center gap-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative px-3 py-2 rounded-md text-base transition ${
                isActive ? 'bg-white/20' : 'hover:bg-white/10'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="pointer-events-none absolute left-3 right-3 -bottom-1 h-0.5 bg-white rounded" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* 右：副标题（窄屏隐藏） */}
      <div className="flex-1 flex justify-end">
        <span className="hidden lg:block text-sm text-emerald-100">
          沃成生态环境研究所 · 生态监测数据平台
        </span>
      </div>
    </header>
  );
}
