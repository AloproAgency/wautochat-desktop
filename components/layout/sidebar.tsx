'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { useUIStore, useSessionStore } from '@/lib/store';

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Sessions', href: '/sessions', icon: Smartphone },
  { label: 'Flows', href: '/flows', icon: GitBranch },
  { label: 'Conversations', href: '/conversations', icon: MessageSquare },
  { label: 'Contacts', href: '/contacts', icon: Users },
  { label: 'Groups', href: '/groups', icon: UsersRound },
  { label: 'Broadcasts', href: '/broadcasts', icon: Megaphone },
  { label: 'Labels', href: '/labels', icon: Tag },
  { label: 'Business', href: '/business', icon: Briefcase },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { sessions, activeSessionId, setActiveSession } = useSessionStore();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`flex h-screen flex-col border-r border-wa-border bg-wa-panel transition-[width] duration-200 ${
        sidebarCollapsed ? 'w-[70px]' : 'w-[260px]'
      }`}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between border-b border-wa-border px-4 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <img
            src="/wautochat_logo.png"
            alt="WAutoChat"
            className="h-8 w-8 shrink-0 rounded-lg"
          />
          {!sidebarCollapsed && (
            <span className="text-lg font-bold text-wa-teal whitespace-nowrap">WAutoChat</span>
          )}
        </Link>
        <button
          onClick={toggleSidebar}
          className="shrink-0 rounded-lg p-1.5 text-wa-text-muted transition-colors hover:bg-wa-hover hover:text-wa-text"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <ul className="flex flex-col gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-wa-teal text-white'
                      : 'text-wa-text-secondary hover:bg-wa-hover hover:text-wa-text'
                  } ${sidebarCollapsed ? 'justify-center' : ''}`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Session Selector */}
      <div className="shrink-0 border-t border-wa-border p-3">
        {sidebarCollapsed ? (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-wa-bg text-wa-teal mx-auto"
            title={sessions.find((s) => s.id === activeSessionId)?.name || 'No session'}
          >
            <Smartphone className="h-5 w-5" />
          </div>
        ) : (
          <div className="relative">
            <select
              value={activeSessionId || ''}
              onChange={(e) => setActiveSession(e.target.value || null)}
              className="h-10 w-full appearance-none rounded-lg border border-wa-border bg-wa-input-bg px-3 pr-8 text-sm text-wa-text transition-colors focus:border-wa-green focus:outline-none focus:ring-2 focus:ring-wa-green/20"
            >
              <option value="">Select session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-wa-text-muted">
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
