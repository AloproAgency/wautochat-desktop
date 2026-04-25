'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { useUIStore, useSessionStore } from '@/lib/store';
import { useKeepAlive } from '@/hooks/use-keep-alive';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { setMobileSidebarOpen } = useUIStore();
  const sessions = useSessionStore((s) => s.sessions);
  const connectedCount = sessions.filter((s) => s.status === 'connected').length;
  useKeepAlive(connectedCount);

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(window.electronAPI?.platform === 'darwin');
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-wa-bg dark:bg-zinc-950">
      {/* macOS titlebar drag region — keeps traffic lights clear of content */}
      {isMac && (
        <div
          className="h-11 shrink-0 bg-wa-bg dark:bg-zinc-950"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="flex items-center gap-3 border-b border-wa-border dark:border-zinc-700 bg-wa-panel dark:bg-zinc-900 px-4 shrink-0 md:hidden" style={{ height: 56 }}>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-wa-text-secondary dark:text-zinc-400 hover:bg-wa-hover dark:hover:bg-zinc-700 hover:text-wa-text dark:hover:text-zinc-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img
            src="/wautochat_logo.png"
            alt="WAutoChat"
            className="h-7 w-7 rounded-lg"
          />
          <span className="text-base font-bold text-slate-900 dark:text-zinc-100">WAutoChat</span>
        </div>

        {/* Pages render inside a padded container by default. Pages that want
            an edge-to-edge layout (Contacts, Conversations…) use the
            `page-full-bleed` class on their root element to compensate with
            negative margins. Uniform markup here avoids SSR/CSR hydration
            mismatches. */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto p-4 md:p-6 lg:max-w-7xl">{children}</div>
        </main>
      </div>
      </div>
    </div>
  );
}
