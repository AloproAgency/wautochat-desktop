'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { useSessionStore } from '@/lib/store';

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
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { sessions, activeSessionId } = useSessionStore();

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const isConnected = activeSession?.status === 'connected';

  // On mobile, hide entirely - the layout handles the mobile top bar
  if (isMobile) return null;

  return (
    <aside
      className="flex flex-col items-center shrink-0"
      style={{
        width: 60,
        minWidth: 60,
        backgroundColor: '#075E54',
        height: '100vh',
      }}
    >
      {/* Logo */}
      <div className="flex items-center justify-center py-4">
        <Link href="/">
          <img
            src="/wautochat_logo.png"
            alt="WAutoChat"
            className="rounded-full"
            style={{
              width: 36,
              height: 36,
              border: '2px solid rgba(255,255,255,0.8)',
            }}
          />
        </Link>
      </div>

      {/* Navigation icons */}
      <nav className="flex-1 flex flex-col items-center gap-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className="relative flex items-center justify-center rounded-full transition-all duration-150"
              style={{
                width: 36,
                height: 36,
                backgroundColor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
              }}
            >
              <Icon
                style={{
                  width: 22,
                  height: 22,
                  color: '#ffffff',
                  opacity: active ? 1 : 0.6,
                }}
              />
            </Link>
          );
        })}
      </nav>

      {/* Bottom section: Settings + session indicator */}
      <div className="flex flex-col items-center gap-3 pb-4">
        <Link
          href="/settings"
          title="Settings"
          className="relative flex items-center justify-center rounded-full transition-all duration-150"
          style={{
            width: 36,
            height: 36,
            backgroundColor: pathname.startsWith('/settings')
              ? 'rgba(255,255,255,0.2)'
              : 'transparent',
          }}
        >
          <Settings
            style={{
              width: 22,
              height: 22,
              color: '#ffffff',
              opacity: pathname.startsWith('/settings') ? 1 : 0.6,
            }}
          />
        </Link>

        {/* Session indicator dot */}
        <div
          title={isConnected ? 'Session connected' : 'Session disconnected'}
          className="rounded-full"
          style={{
            width: 10,
            height: 10,
            backgroundColor: isConnected ? '#25D366' : '#ef4444',
          }}
        />
      </div>
    </aside>
  );
}
