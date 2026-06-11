'use client';

import { useEffect } from 'react';

/**
 * Eruda 调试控制台初始化组件
 * 通过 URL 参数 ?debug=1 启用，或在开发环境自动启用
 */
export default function ErudaInit() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 检查是否启用调试
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    const isDev = process.env.NODE_ENV === 'development';

    // 开发环境默认启用，生产环境需 ?debug=1
    const shouldEnable = debugParam === '1' || (isDev && debugParam !== '0');

    if (!shouldEnable) return;

    // 动态加载 eruda
    import('eruda').then((eruda) => {
      eruda.default.init();
    }).catch(() => {
      // 加载失败时静默处理
    });
  }, []);

  return null;
}