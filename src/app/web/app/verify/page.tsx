'use client';

import { useState, useEffect } from 'react';
import { API_BASE_URL, PAGE_PATHS } from '../../config';

const TOKEN_KEY = 'nhb_customer_service_token';
const CODE_COUNTDOWN_SECONDS = 30;
const SUBMIT_COUNTDOWN_SECONDS = 15;

// 表单字段验证
function validateForm(name: string, idCard: string, phone: string, code?: string): string | null {
  if (!name) return '请输入姓名';
  if (!idCard || idCard.length !== 18) return '请输入正确的身份证号码';
  if (!phone || phone.length !== 11) return '请输入正确的手机号码';
  if (code !== undefined && !code) return '请输入验证码';
  return null;
}

// 倒计时 hook
function useCountdown(initialValue: number = 0) {
  const [countdown, setCountdown] = useState(initialValue);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const start = (seconds: number) => setCountdown(seconds);
  const stop = () => setCountdown(0);
  const isActive = countdown > 0;

  return { countdown, start, stop, isActive };
}

// 输入框组件
function InputField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  filter,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  filter?: (value: string) => string;
  error?: string;
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = filter ? filter(e.target.value) : e.target.value;
    onChange(newValue);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`w-full px-3 py-2 border rounded-lg focus:outline-none ${
          error ? 'border-red-500' : 'border-gray-300 focus:border-teal-500'
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

export default function VerifyPage() {
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const codeCountdown = useCountdown();
  const maskCountdown = useCountdown();

  // 从 localStorage 获取 token
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  // 发送验证码
  const sendCode = async () => {
    const error = validateForm(name, idCard, phone);
    if (error) {
      setErrorMsg(error);
      return;
    }
    setErrorMsg('');

    setSendingCode(true);
    try {
      const res = await fetch(`${API_BASE_URL}/verify/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, idCard, phone }),
      });
      const result = await res.json();

      if (result.code === 200) {
        codeCountdown.start(CODE_COUNTDOWN_SECONDS);
        alert('验证码已发送');
      } else {
        setErrorMsg(result.msg || '发送失败');
      }
    } catch {
      setErrorMsg('发送失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  // 提交实名认证
  const submit = async () => {
    if (!token) {
      setErrorMsg('未找到用户信息，请返回聊天页面');
      return;
    }

    const error = validateForm(name, idCard, phone, code);
    if (error) {
      setErrorMsg(error);
      return;
    }
    setErrorMsg('');

    setSubmitting(true);
    maskCountdown.start(SUBMIT_COUNTDOWN_SECONDS);
    try {
      const res = await fetch(`${API_BASE_URL}/verify/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name, idCard, phone, code }),
      });
      maskCountdown.stop();
      const result = await res.json();

      if (result.code === 200) {
        alert('实名认证成功');
        window.location.href = PAGE_PATHS.chat;
      } else {
        setErrorMsg(result.msg || '认证失败');
      }
    } catch {
      maskCountdown.stop();
      setErrorMsg('认证失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  // 表单是否可提交
  const canSubmit = !submitting && name && idCard.length === 18 && phone.length === 11 && code;

  // 是否可发送验证码
  const canSendCode = !sendingCode && !codeCountdown.isActive && name && idCard.length === 18 && phone.length === 11;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {/* 处理中遮罩 */}
      {maskCountdown.isActive && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-lg text-center">
            <div className="text-4xl font-bold text-teal-500 mb-2">{maskCountdown.countdown}</div>
            <div className="text-gray-600">正在处理，请稍候...</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-center flex-1">实名认证</h1>
          <button
            onClick={() => window.history.back()}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            返回
          </button>
        </div>
        <p className="text-sm text-gray-500 text-center mb-4">
          为保护您的个人信息安全，查询订单或理赔进度需先完成实名认证
        </p>

        {/* 错误提示 */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-sm text-red-600">
            {errorMsg}
          </div>
        )}

        {/* 姓名 */}
        <InputField
          label="姓名"
          value={name}
          onChange={setName}
          placeholder="请输入姓名"
        />

        {/* 身份证号 */}
        <InputField
          label="身份证号"
          value={idCard}
          onChange={setIdCard}
          placeholder="请输入18位身份证号"
          maxLength={18}
          filter={(v) => v.replace(/[^\dXx]/g, '').toUpperCase().slice(0, 18)}
        />

        {/* 手机号码 + 发送验证码 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">手机号码</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="请输入手机号"
              maxLength={11}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={sendCode}
              disabled={!canSendCode}
              className={`w-full sm:w-auto px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                codeCountdown.isActive
                  ? 'bg-gray-200 text-gray-500'
                  : 'bg-teal-500 text-white hover:bg-teal-600'
              } disabled:opacity-50`}
            >
              {codeCountdown.isActive ? `${codeCountdown.countdown}秒` : '发送验证码'}
            </button>
          </div>
        </div>

        {/* 验证码 */}
        <InputField
          label="验证码"
          value={code}
          onChange={setCode}
          placeholder="请输入验证码"
          maxLength={6}
          filter={(v) => v.replace(/\D/g, '').slice(0, 6)}
        />

        {/* 提交按钮 */}
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`w-full py-3 rounded-lg font-medium ${
            canSubmit
              ? 'bg-teal-500 text-white hover:bg-teal-600'
              : 'bg-gray-200 text-gray-500'
          }`}
        >
          {submitting ? '提交中...' : '提交认证'}
        </button>

        {/* 提示 */}
        <p className="text-xs text-gray-400 text-center mt-4">
          您的信息仅用于身份验证，我们将严格保护您的隐私
        </p>
      </div>
    </div>
  );
}