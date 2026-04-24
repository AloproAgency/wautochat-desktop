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
    <div className="flex h-screen overflow-hidden bg-wa-bg">
      <Sidebar />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar with hamburger */}
        <div className="flex items-center gap-3 border-b border-wa-border px-4 shrink-0 md:hidden" style={{ height: 56 }}>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-wa-text-secondary hover:bg-wa-hover transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <img
            src="/wautochat_logo.png"
            alt="WAutoChat"
            className="h-7 w-7 rounded-lg"
          />
          <span className="text-base font-bold text-wa-teal">WAutoChat</span>
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
  );
}
