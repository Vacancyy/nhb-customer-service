'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MenuItem {
  name: string;
  path: string;
  icon: string;
}

const menuItems: MenuItem[] = [
  { name: '审核管理', path: '/web/admin/review', icon: '📋' },
  { name: '提示词配置', path: '/web/admin/prompt', icon: '💬' },
  { name: '知识库管理', path: '/web/admin/knowledge', icon: '📚' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* 左侧菜单 */}
      <div
        className={`bg-gray-800 text-white transition-all duration-300 flex flex-col ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* 菜单头部 */}
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {!collapsed && <h1 className="text-lg font-bold">管理端</h1>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-700 rounded"
          >
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* 菜单列表 */}
        <nav className="flex-1 py-4">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`flex items-center px-4 py-3 transition-colors ${
                pathname === item.path
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {!collapsed && <span className="ml-3">{item.name}</span>}
            </Link>
          ))}
        </nav>

        {/* 底部链接 */}
        <div className="p-4 border-t border-gray-700">
          <Link
            href="/web/app/chat"
            className={`flex items-center text-gray-400 hover:text-white ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <span>🏠</span>
            {!collapsed && <span className="ml-3">返回首页</span>}
          </Link>
        </div>
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}