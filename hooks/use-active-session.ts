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
    if (activeSessionId) return;

    // If we have sessions in store, pick one
    if (sessions.length > 0) {
      const connected = sessions.find((s) => s.status === 'connected');
      setActiveSession(connected ? connected.id : sessions[0].id);
      return;
    }

    // Fetch sessions from API
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.length > 0) {
          setSessions(data.data);
          const connected = data.data.find(
            (s: { status: string }) => s.status === 'connected'
          );
          setActiveSession(connected ? connected.id : data.data[0].id);
        }
      })
      .catch(() => {});
  }, [activeSessionId, sessions, setSessions, setActiveSession]);

  return activeSessionId;
}
