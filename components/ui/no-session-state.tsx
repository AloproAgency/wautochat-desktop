'use client';

import Link from 'next/link';
import { Smartphone, Plus, Wifi } from 'lucide-react';
import { useSessionStore } from '@/lib/store';

interface NoSessionStateProps {
  feature?: string;
}

export function NoSessionState({ feature = 'cette page' }: NoSessionStateProps) {
  const sessions = useSessionStore((s) => s.sessions);
  const hasSessions = sessions.length > 0;
  const hasConnected = sessions.some((s) => s.status === 'connected');

  let title: string;
  let description: string;
  let ctaLabel: string;

  if (!hasSessions) {
    title = 'Aucune session WhatsApp';
    description = `Pour utiliser ${feature}, créez une session et scannez le QR code WhatsApp pour la connecter.`;
    ctaLabel = 'Créer une session';
  } else if (!hasConnected) {
    title = 'Aucune session connectée';
    description = `Aucune de vos sessions n'est actuellement connectée à WhatsApp. Connectez-en une pour utiliser ${feature}.`;
    ctaLabel = 'Gérer les sessions';
  } else {
    title = 'Aucune session sélectionnée';
    description = `Sélectionnez une session active dans la barre latérale pour accéder à ${feature}.`;
    ctaLabel = 'Voir les sessions';
  }

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-wa-bg dark:bg-zinc-800 border border-wa-border dark:border-zinc-700">
          {hasConnected ? (
            <Smartphone className="h-6 w-6 text-wa-text-secondary dark:text-zinc-400" />
          ) : (
            <Wifi className="h-6 w-6 text-wa-text-secondary dark:text-zinc-400" />
          )}
        </div>
        <h2 className="text-base font-semibold text-wa-text dark:text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm text-wa-text-secondary dark:text-zinc-400 leading-relaxed">
          {description}
        </p>
        <Link
          href="/sessions"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-wa-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-wa-teal-dark"
        >
          {!hasSessions && <Plus className="h-4 w-4" />}
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
