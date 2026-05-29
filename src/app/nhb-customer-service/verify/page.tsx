'use client';

import { useState, useEffect } from 'react';

const USER_ID_KEY = 'nhb_customer_service_user_id';

export default function VerifyPage() {
  const [name, setName] = useState('吴超');
  const [idCard, setIdCard] = useState('340123199301215013');
  const [phone, setPhone] = useState('15055151510');
  const [code, setCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [userId, setUserId] = useState('');
  const [maskCountdown, setMaskCountdown] = useState(0); // 遮罩层倒计时

  // 从 localStorage 获取 userId
  useEffect(() => {
    const storedUserId = localStorage.getItem(USER_ID_KEY);
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 遮罩层倒计时
  useEffect(() => {
    if (maskCountdown > 0) {
      const timer = setTimeout(() => setMaskCountdown(maskCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [maskCountdown]);

  // 发送验证码
  const sendCode = async () => {
    if (!name) {
      alert('请输入姓名');
      return;
    }

    if (!idCard || idCard.length !== 18) {
      alert('请输入正确的身份证号码');
      return;
    }

    if (!phone || phone.length !== 11) {
      alert('请输入正确的手机号码');
      return;
    }

    setSendingCode(true);
    try {
      const res = await fetch('/nhb-customer-service-api/verify/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, idCard, phone }),
      });
      const result = await res.json();

      if (result.code === 200) {
        setCountdown(30);
        alert('验证码已发送');
      } else {
        alert(result.msg || '发送失败');
      }
    } catch {
      alert('发送失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  // 提交实名认证
  const submit = async () => {
    if (!userId) {
      alert('未找到用户信息，请返回聊天页面');
      return;
    }

    if (!name || !idCard || !phone || !code) {
      alert('请填写完整信息');
      return;
    }

    if (idCard.length !== 18) {
      alert('请输入正确的身份证号码');
      return;
    }

    if (phone.length !== 11) {
      alert('请输入正确的手机号码');
      return;
    }

    setSubmitting(true);
    setMaskCountdown(15); // 启动15秒遮罩层倒计时
    try {
      const res = await fetch('/nhb-customer-service-api/verify/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, name, idCard, phone, code }),
      });
      setMaskCountdown(0); // 收到响应后关闭遮罩层
      const result = await res.json();

      if (result.code === 200) {
        alert('实名认证成功');
        // 返回聊天页面
        window.location.href = '/nhb-customer-service/chat';
      } else {
        alert(result.msg || '认证失败');
      }
    } catch {
      setMaskCountdown(0); // 出错时也关闭遮罩层
      alert('认证失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      {/* 遮罩层 */}
      {maskCountdown > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-lg text-center">
            <div className="text-4xl font-bold text-teal-500 mb-2">{maskCountdown}</div>
            <div className="text-gray-600">正在处理，请稍候...</div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h1 className="text-xl font-bold text-center mb-6">实名认证</h1>
        <p className="text-sm text-gray-500 text-center mb-6">
          为保护您的个人信息安全，查询订单或理赔进度需先完成实名认证
        </p>

        {/* 姓名 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="请输入姓名"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
          />
        </div>

        {/* 身份证号 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">身份证号</label>
          <input
            type="text"
            value={idCard}
            onChange={(e) => setIdCard(e.target.value.replace(/\D/g, '').slice(0, 18))}
            placeholder="请输入18位身份证号"
            maxLength={18}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
          />
        </div>

        {/* 手机号码 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">手机号码</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="请输入手机号"
              maxLength={11}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
            />
            <button
              onClick={sendCode}
              disabled={sendingCode || countdown > 0 || !name || idCard.length !== 18 || phone.length !== 11}
              className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap ${
                countdown > 0
                  ? 'bg-gray-200 text-gray-500'
                  : 'bg-teal-500 text-white hover:bg-teal-600'
              } disabled:opacity-50`}
            >
              {countdown > 0 ? `${countdown}秒` : '发送验证码'}
            </button>
          </div>
        </div>

        {/* 验证码 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">验证码</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="请输入验证码"
            maxLength={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-teal-500"
          />
        </div>

        {/* 提交按钮 */}
        <button
          onClick={submit}
          disabled={submitting || !name || !idCard || !phone || !code}
          className={`w-full py-3 rounded-lg font-medium ${
            submitting || !name || !idCard || !phone || !code
              ? 'bg-gray-200 text-gray-500'
              : 'bg-teal-500 text-white hover:bg-teal-600'
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