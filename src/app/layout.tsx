import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '宁惠保智能客服',
  description: '宁惠保智能客服系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
