'use client';

import { useEffect, useState, useRef } from 'react';
import { API_BASE_URL, PAGE_PATHS } from '../config';

// 扩展 window 类型 - 我的南京 SDK
declare global {
  interface Window {
    auth?: {
      getAccessToken: (params: string) => void;
      getUserInfoByToken: (params: string) => void;
    };
    getAccessTokenCallback?: (paramsStr: string) => void;
    getUserInfoByTokenCallback?: (paramsStr: string) => void;
  }
}

// localStorage key
const TOKEN_KEY = 'nhb_customer_service_token';
const CHANNEL_KEY = 'nhb_customer_service_channel';

// 我的南京 appId
const MYNJ_APP_ID = 'cs_sblpcs';

// 从 URL 获取 channel 参数
function getChannelFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('channel');
}

// 从 URL 获取 token 参数
function getTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('token');
}

// 判断是否为我的南京渠道（仅通过 SDK 判断）
function isMyNanjingChannel(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.auth?.getAccessToken === 'function';
}

export default function NHBCustomerServiceRoot() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const initializedRef = useRef(false); // 防止重复初始化

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initializedRef.current) return; // 已初始化，跳过

    initializedRef.current = true;

    // 1. 检查 URL 中是否带有 token（外部直接传入 token，跳过初始化）
    const urlToken = getTokenFromUrl();
    if (urlToken) {
      const urlChannel = getChannelFromUrl() || 'default';
      console.log('[根页面] URL 中带有 token，直接跳转');
      localStorage.setItem(TOKEN_KEY, urlToken);
      localStorage.setItem(CHANNEL_KEY, urlChannel);
      setStatus('ready');
      return;
    }

    // 2. 检查 localStorage 中是否已有 token（已登录用户，跳过初始化）
    const cachedToken = localStorage.getItem(TOKEN_KEY);
    if (cachedToken) {
      console.log('[根页面] 已有缓存的 token，直接跳转');
      setStatus('ready');
      return;
    }

    // 3. 无 token，需要初始化
    const urlChannel = getChannelFromUrl();
    const isMynj = isMyNanjingChannel();
    const channel = urlChannel || 'default';

    console.log('[根页面] channel:', channel, 'isMynj:', isMynj);

    if (isMynj) {
      initMyNanjingUser(channel);
    } else {
      initNormalUser(channel);
    }
  }, []);

  // 状态变为 ready 后跳转
  useEffect(() => {
    if (status === 'ready') {
      window.location.href = PAGE_PATHS.chat;
    }
  }, [status]);

  // 初始化普通渠道用户
  const initNormalUser = async (channel: string) => {
    try {
      console.log('[根页面] 普通渠道，调用 user 接口');

      const res = await fetch(`${API_BASE_URL}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
        }),
      });

      const result = await res.json();
      console.log('[根页面] user 接口结果:', result);

      if (result.code === 200 && result.data?.token) {
        localStorage.setItem(TOKEN_KEY, result.data.token);
        localStorage.setItem(CHANNEL_KEY, channel);
        setStatus('ready');
      } else {
        setErrorMsg(result.msg || '初始化失败');
        setStatus('error');
      }
    } catch (e) {
      console.error('[根页面] user 接口调用失败:', e);
      setErrorMsg('初始化失败');
      setStatus('error');
    }
  };

  // 初始化我的南京用户
  const initMyNanjingUser = (channel: string) => {
    console.log('[根页面] 我的南京渠道，开始获取加密数据...');

    // 设置回调函数
    window.getAccessTokenCallback = (paramsStr: string) => {
      try {
        const params = JSON.parse(paramsStr);
        console.log('[根页面] getAccessTokenCallback:', params);

        if (params.success === true || params.success === 'true') {
          const accessToken = params.data?.accessToken;
          if (accessToken) {
            console.log('[根页面] 获取 accessToken 成功');
            const userInfoParams = `{"accessToken": "${accessToken}", "appId": "${MYNJ_APP_ID}"}`;
            window.auth?.getUserInfoByToken?.(userInfoParams);
          } else {
            setErrorMsg('获取 accessToken 失败');
            setStatus('error');
          }
        } else {
          setErrorMsg(params.msg || '获取 accessToken 失败');
          setStatus('error');
        }
      } catch (e) {
        setErrorMsg('解析响应失败');
        setStatus('error');
      }
    };

    window.getUserInfoByTokenCallback = (paramsStr: string) => {
      try {
        const params = JSON.parse(paramsStr);
        console.log('[根页面] getUserInfoByTokenCallback:', params);

        if (params.success === true || params.success === 'true') {
          const wdnjUser = params.data;
          if (wdnjUser) {
            console.log('[根页面] 获取加密数据成功');
            callUserApiWithWdnjUser(wdnjUser, channel);
          } else {
            setErrorMsg('加密数据为空');
            setStatus('error');
          }
        } else {
          setErrorMsg(params.msg || '获取用户信息失败');
          setStatus('error');
        }
      } catch (e) {
        setErrorMsg('解析响应失败');
        setStatus('error');
      }
    };

    // 调用 getAccessToken 开始流程
    window.auth?.getAccessToken?.(`{"appId": "${MYNJ_APP_ID}"}`);
  };

  // 调用 user 接口（带我的南京加密数据）
  const callUserApiWithWdnjUser = async (wdnjUser: string, channel: string) => {
    try {
      console.log('[根页面] 调用 user 接口（带加密数据）');

      const res = await fetch(`${API_BASE_URL}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wdnjUser,
          channel,
        }),
      });

      const result = await res.json();
      console.log('[根页面] user 接口结果:', result);

      if (result.code === 200 && result.data?.token) {
        localStorage.setItem(TOKEN_KEY, result.data.token);
        localStorage.setItem(CHANNEL_KEY, channel);
        setStatus('ready');
      } else {
        setErrorMsg(result.msg || '初始化失败');
        setStatus('error');
      }
    } catch (e) {
      console.error('[根页面] user 接口调用失败:', e);
      setErrorMsg('初始化失败');
      setStatus('error');
    }
  };

  // 显示加载状态
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f5f5f5]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-500 mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">正在初始化...</p>
        </div>
      </div>
    );
  }

  // 显示错误状态
  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f5f5f5]">
        <div className="text-center bg-white rounded-xl shadow-sm p-6 max-w-xs">
          <p className="text-red-500 mb-4">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-teal-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-teal-600 transition"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return null;
}