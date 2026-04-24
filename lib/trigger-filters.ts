// Shared trigger filter evaluation — used by both wppconnect-manager (real) and test route (simulated).

export interface FilterContext {
  body: string;
  caption: string;
  msgType: string;      // normalized: 'text'|'image'|'video'|'audio'|'ptt'|'document'|'sticker'|'location'|'contact'|'poll'|'list'
  isGroup: boolean;
  isBroadcast: boolean;
  sender: string;       // e.g. "2299xxxxxxx@c.us"
  chatId: string;       // group JID or contact JID
  fromMe: boolean;
  mentionedJidList: string[];
  isForwarded: boolean;
  quotedMsgId: string;  // empty string if not a reply
  quotedFromMe: boolean;
}

export function applyTriggerFilters(
  config: Record<string, unknown>,
  ctx: FilterContext
): boolean {
  // Always ignore own messages unless explicitly disabled
  const ignoreOwn = (config.ignoreOwnMessages as boolean) !== false;
  if (ignoreOwn && ctx.fromMe) return false;

  const filters = (config.filters as Record<string, unknown>) || {};

  // ── 1. Message event type ───────────────────────────────────────────────
  const messageTypeFilter = (filters.messageType as string) || 'any';
  if (messageTypeFilter !== 'any' && messageTypeFilter !== 'new') {
    const hasQuoted = !!ctx.quotedMsgId;
    if (messageTypeFilter === 'reply'     && !ctx.quotedFromMe)              return false;
    if (messageTypeFilter === 'mention'   && ctx.mentionedJidList.length === 0) return false;
    if (messageTypeFilter === 'reaction')                                    return false; // reactions never arrive via onMessage
    if (messageTypeFilter === 'forwarded' && !ctx.isForwarded)               return false;
    if (messageTypeFilter === 'quoted'    && !hasQuoted)                     return false;
  }

  // ── 2. Condition sur le contenu ─────────────────────────────────────────
  const contentFilter = (filters.content as Record<string, unknown>) || {};
  if (contentFilter.enabled === true) {
    const operator = (contentFilter.operator as string) || 'contains';
    const value = (contentFilter.value as string) || '';
    if (value) {
      const fullText = ctx.caption ? `${ctx.body} ${ctx.caption}` : ctx.body;
      const lowerFull = fullText.toLowerCase();
      const lowerValue = value.toLowerCase();
      let matched = false;
      switch (operator) {
        case 'contains':   matched = lowerFull.includes(lowerValue); break;
        case 'equals':     matched = lowerFull === lowerValue; break;
        case 'startsWith': matched = lowerFull.startsWith(lowerValue); break;
        case 'endsWith':   matched = lowerFull.endsWith(lowerValue); break;
        case 'regex': {
          try { matched = new RegExp(value, 'i').test(fullText); } catch { matched = false; }
          break;
        }
      }
      if (!matched) return false;
    }
  }

  // ── 3. Type de contenu (multi-select chips) ─────────────────────────────
  const contentTypes = (filters.contentTypes as string[]) || [];
  if (contentTypes.length > 0) {
    const NON_TEXT = ['image', 'video', 'audio', 'ptt', 'document', 'sticker', 'location', 'contact', 'poll', 'list'];
    const URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+/i;
    let matched = false;
    for (const ct of contentTypes) {
      if (ct === 'text'     && !NON_TEXT.includes(ctx.msgType))                        { matched = true; break; }
      if (ct === 'image'    && ctx.msgType === 'image')                                { matched = true; break; }
      if (ct === 'video'    && ctx.msgType === 'video')                                { matched = true; break; }
      if (ct === 'audio'    && (ctx.msgType === 'audio' || ctx.msgType === 'ptt'))     { matched = true; break; }
      if (ct === 'document' && ctx.msgType === 'document')                             { matched = true; break; }
      if (ct === 'sticker'  && ctx.msgType === 'sticker')                              { matched = true; break; }
      if (ct === 'location' && ctx.msgType === 'location')                             { matched = true; break; }
      if (ct === 'contact'  && ctx.msgType === 'contact')                              { matched = true; break; }
      if (ct === 'link'     && URL_RE.test(ctx.body))                                  { matched = true; break; }
      if (ct === 'poll'     && ctx.msgType === 'poll')                                 { matched = true; break; }
    }
    if (!matched) return false;
  }

  // ── 4. Expéditeur (include / exclude) ──────────────────────────────────
  const senderMode = (filters.senderMode as string) || 'all';
  if (senderMode !== 'all') {
    const senderList = (filters.senderList as string[]) || [];
    const legacySenderStr = (filters.sender as string) || '';
    const effectiveList = senderList.length > 0
      ? senderList
      : (legacySenderStr.trim()
        ? legacySenderStr.split(',').map((s) => s.trim()).filter(Boolean)
        : []);

    if (effectiveList.length > 0) {
      const normalizedList = effectiveList.map((s) => (s.includes('@') ? s : `${s}@c.us`));
      const senderPhone = ctx.sender.replace(/@.*$/, '');
      const matched = normalizedList.some((allowed) => {
        const allowedPhone = allowed.replace(/@.*$/, '');
        return ctx.sender === allowed || senderPhone === allowedPhone;
      });
      if (senderMode === 'include' && !matched) return false;
      if (senderMode === 'exclude' && matched) return false;
    }
  }

  // ── 5. Type de discussion ───────────────────────────────────────────────
  const chatTypeFilter = (filters.chatType as string) || 'all';
  if (chatTypeFilter !== 'all') {
    if (chatTypeFilter === 'private'   && (ctx.isGroup || ctx.isBroadcast)) return false;
    if (chatTypeFilter === 'group'     && !ctx.isGroup)                     return false;
    if (chatTypeFilter === 'broadcast' && !ctx.isBroadcast)                 return false;
  }
  const filterGroupId = (filters.groupId as string) || '';
  if (filterGroupId && ctx.isGroup && ctx.chatId !== filterGroupId) return false;

  // ── Legacy keyword filter ───────────────────────────────────────────────
  const keywordFilter = (filters.keyword as Record<string, unknown>) || {};
  if (keywordFilter.enabled === true) {
    const words = ((keywordFilter.words as string) || '')
      .split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.length > 0) {
      const searchText = (ctx.body + (ctx.caption ? ' ' + ctx.caption : '')).toLowerCase();
      const mode = (keywordFilter.mode as string) || 'contains';
      const matched = words.some((w) => {
        if (mode === 'exact') return ctx.body.toLowerCase() === w;
        if (mode === 'startsWith') return searchText.startsWith(w);
        return searchText.includes(w);
      });
      if (!matched) return false;
    }
  }

  return true;
}
