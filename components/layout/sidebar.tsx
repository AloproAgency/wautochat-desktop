'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Smartphone,
  GitBranch,
  MessageSquare,
  Users,
  UsersRound,
  Megaphone,
  Tag,
  Briefcase,
  Settings,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  X,
  Sparkles,
} from 'lucide-react';
import { useUIStore, useSessionStore } from '@/lib/store';

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Sessions', href: '/sessions', icon: Smartphone },
  { label: 'Flows', href: '/flows', icon: GitBranch },
  { label: 'Conversations', href: '/conversations', icon: MessageSquare },
  { label: 'Contacts', href: '/contacts', icon: Users },

  { label: 'Broadcasts', href: '/broadcasts', icon: Megaphone },
  { label: 'Labels', href: '/labels', icon: Tag },
  { label: 'Business', href: '/business', icon: Briefcase },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  const { sessions, activeSessionId, setActiveSession } = useSessionStore();

  // Track screen size for responsive behavior
  const [isTablet, setIsTablet] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1024);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  // Keyboard shortcuts — Ctrl/Cmd+B toggles sidebar, Ctrl/Cmd+1..9 jumps to
  // nav, Esc closes the mobile drawer.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && mobileSidebarOpen) {
        setMobileSidebarOpen(false);
        return;
      }
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      const digit = parseInt(e.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= navItems.length) {
        e.preventDefault();
        router.push(navItems[digit - 1].href);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMac, toggleSidebar, router, mobileSidebarOpen, setMobileSidebarOpen]);

  const modKey = isMac ? '⌘' : 'Ctrl';

  // On tablet, always show collapsed
  const effectiveCollapsed = isTablet ? true : sidebarCollapsed;

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [pathname, isMobile, setMobileSidebarOpen]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const sidebarWidth = effectiveCollapsed ? 64 : 210;

  const sidebarContent = (
    <aside
      className="flex h-screen flex-col border-r border-wa-border dark:border-zinc-700 bg-wa-panel dark:bg-zinc-900 transition-[width] duration-200"
      style={{ width: isMobile ? 280 : sidebarWidth }}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-wa-border dark:border-zinc-700 px-3 shrink-0">
        <Link href="/" className={`flex items-center gap-2.5 overflow-hidden ${effectiveCollapsed && !isMobile ? 'mx-auto' : ''}`}>
          <img
            src="/wautochat_logo.png"
            alt="WAutoChat"
            className="h-7 w-7 shrink-0 rounded-md"
          />
          {(!effectiveCollapsed || isMobile) && (
            <span className="text-sm font-semibold text-slate-900 dark:text-zinc-100 whitespace-nowrap tracking-tight">WAutoChat</span>
          )}
        </Link>
        {isMobile && (
          <button
            onClick={() => setMobileSidebarOpen(false)}
            className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 dark:text-zinc-500 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-slate-700 dark:hover:text-zinc-200"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-hidden py-1.5 px-2">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const showLabel = !effectiveCollapsed || isMobile;
            const shortcut = idx < 9 ? `${modKey}+${idx + 1}` : undefined;
            const tooltip = shortcut ? `${item.label} (${shortcut})` : item.label;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={tooltip}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-wa-teal text-white dark:bg-wa-teal dark:text-white'
                      : 'text-wa-text-secondary dark:text-zinc-400 hover:bg-wa-hover dark:hover:bg-zinc-700 hover:text-wa-text dark:hover:text-zinc-100'
                  } ${!showLabel ? 'justify-center' : ''}`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {showLabel && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Upgrade to Pro card */}
      <div className="shrink-0 px-2 pb-1.5">
        {effectiveCollapsed && !isMobile ? (
          <Link
            href="/settings"
            title="Upgrade to Pro"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-wa-teal text-white mx-auto transition-transform hover:scale-105"
          >
            <Sparkles className="h-4 w-4" />
          </Link>
        ) : (
          <div className="rounded-xl border border-wa-border dark:border-zinc-700 bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900 px-3 py-2.5">
            <p className="text-sm font-semibold text-wa-text dark:text-zinc-100 leading-tight">
              Upgrade to Pro
            </p>
            <p className="mt-0.5 text-[11px] text-wa-text-secondary dark:text-zinc-400 leading-snug">
              Unlimited sessions, advanced analytics.
            </p>
            <Link
              href="/settings"
              className="mt-2 flex h-7 items-center justify-center rounded-lg bg-wa-teal px-3 text-xs font-semibold text-white transition-colors hover:bg-wa-teal-dark"
            >
              Upgrade now
            </Link>
          </div>
        )}
      </div>

      {/* Collapse toggle — desktop only */}
      {!isMobile && !isTablet && (
        <div className={`shrink-0 px-2 pb-1.5 ${sidebarCollapsed ? '' : 'flex justify-end'}`}>
          <button
            onClick={toggleSidebar}
            title={`${sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} (${modKey}+B)`}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-wa-border dark:border-zinc-700 bg-wa-bg dark:bg-zinc-800 text-wa-text-secondary dark:text-zinc-400 transition-all hover:bg-wa-hover dark:hover:bg-zinc-700 hover:text-wa-text dark:hover:text-zinc-100 hover:border-wa-text-muted/40 dark:hover:border-zinc-500 hover:shadow-sm active:scale-95 ${
              sidebarCollapsed ? 'mx-auto' : ''
            }`}
          >
            <PanelLeft className={`h-3.5 w-3.5 transition-transform duration-200 ${sidebarCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      )}

      {/* Session Selector */}
      <div className="shrink-0 border-t border-wa-border dark:border-zinc-700 px-3 py-2.5">
        {effectiveCollapsed && !isMobile ? (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-wa-bg dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 mx-auto"
            title={sessions.find((s) => s.id === activeSessionId)?.name || 'No session'}
          >
            <Smartphone className="h-5 w-5" />
          </div>
        ) : (
          <div className="relative">
            <select
              value={activeSessionId || ''}
              onChange={(e) => setActiveSession(e.target.value || null)}
              className="h-10 w-full appearance-none rounded-lg border border-wa-border dark:border-zinc-700 bg-wa-input-bg dark:bg-zinc-800 px-3 pr-8 text-sm text-wa-text dark:text-zinc-100 transition-colors focus:border-wa-green focus:outline-none focus:ring-2 focus:ring-wa-green/20"
            >
              <option value="">Select session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-wa-text-muted dark:text-zinc-500">
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );

  // Mobile: render as overlay
  if (isMobile) {
    if (!mobileSidebarOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <div
          className="fixed inset-0"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileSidebarOpen(false)}
        />
        {/* Sidebar */}
        <div className="relative z-50">
          {sidebarContent}
        </div>
      </div>
    );
  }

  // Tablet & Desktop: render inline
  return sidebarContent;
}
