'use client';

import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { useUIStore } from '@/lib/store';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setMobileSidebarOpen } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <div
          className="flex items-center gap-3 px-4 shrink-0 md:hidden"
          style={{
            height: 56,
            backgroundColor: '#075E54',
          }}
        >
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
            style={{ color: '#ffffff' }}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img
            src="/wautochat_logo.png"
            alt="WAutoChat"
            className="h-7 w-7 rounded-full"
            style={{ border: '2px solid rgba(255,255,255,0.6)' }}
          />
          <span className="text-base font-bold" style={{ color: '#ffffff' }}>
            WAutoChat
          </span>
        </div>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
