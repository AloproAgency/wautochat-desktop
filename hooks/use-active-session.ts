'use client';

import { useEffect } from 'react';
import { useSessionStore } from '@/lib/store';

/**
 * Ensures an active session is selected.
 * Auto-fetches sessions and selects the first connected one (or first available).
 * Returns the activeSessionId.
 */
export function useActiveSession(): string | null {
  const { activeSessionId, sessions, setSessions, setActiveSession } = useSessionStore();

  useEffect(() => {
    // If a sessionId is already pinned, only keep it if it still resolves to
    // a real, non-failed session. Stale ids (deleted session or hard-failed)
    // would otherwise silently break every API call that depends on them.
    if (activeSessionId) {
      const current = sessions.find((s) => s.id === activeSessionId);
      const stale = current && (current.status === 'failed');
      const missing = sessions.length > 0 && !current;
      if (!stale && !missing) return;
      // Fall through to re-pick a better candidate.
      setActiveSession(null);
    }

    if (sessions.length > 0) {
      const connected = sessions.find((s) => s.status === 'connected');
      const usable = connected || sessions.find((s) => s.status !== 'failed') || sessions[0];
      setActiveSession(usable.id);
      return;
    }

    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.length > 0) {
          setSessions(data.data);
          const connected = data.data.find(
            (s: { status: string }) => s.status === 'connected'
          );
          const usable = connected
            || data.data.find((s: { status: string }) => s.status !== 'failed')
            || data.data[0];
          setActiveSession(usable.id);
        }
      })
      .catch(() => {});
  }, [activeSessionId, sessions, setSessions, setActiveSession]);

  return activeSessionId;
}
