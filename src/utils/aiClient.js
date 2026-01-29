// Lightweight AI client: builds payload and sends to backend
import axios from 'axios';

/**
 * Send AI request (either main /query or snapshot-only /query_snapshot).
 * Does not depend on Vue; safe to reuse across views.
 */
export async function sendAiRequest({
  apiBaseUrl,
  message,
  source = 'chat',
  quickKey = null,
  mode = 'freeform',
  asOf = null,
  includeHidden = false,
  visibleAccountIds = null,
  snapshot = null,
  debugAi = true,
  timeout = 20000,
}) {
  if (!apiBaseUrl) throw new Error('apiBaseUrl is required');
  const text = (message || '').toString();
  const wantsAccounts = /\b(сч[её]т|счета|касс[аы]|баланс)\b/i.test(text);
  const wantsCompanies = /компан/i.test(text);
  const wantsHidden = /\bскрыт(ые|ый|ая|ое|о|ы|ых)?\b/i.test(text);
  const wantsTransfers = /\b(перевод(?:ы|ов)?|transfer)s?\b/i.test(text);
  const autoIncludeHidden = includeHidden || wantsAccounts || wantsHidden || wantsTransfers;

  // If we auto-include hidden, drop visibleAccountIds to let backend взять все
  let effectiveIncludeHidden = autoIncludeHidden;
  let effectiveVisibleIds = effectiveIncludeHidden ? null : visibleAccountIds;

  const isSnapshotEligible = /(сч[её]т|счета|касс|баланс|компан)/i.test(text);

  const payload = {
    message: text,
    source,
    quickKey,
    mode,
    asOf,
    includeHidden: effectiveIncludeHidden,
    visibleAccountIds: effectiveVisibleIds,
    debugAi,
  };
  if (snapshot) payload.snapshot = snapshot;

  const endpoint =
    source === 'quick_button' && snapshot && isSnapshotEligible
      ? `${apiBaseUrl}/ai/query_snapshot`
      : `${apiBaseUrl}/ai/query`;

  // Важный фикс: для быстрых кнопок НЕ snapshot не ограничиваем счета видимостью,
  // иначе переводы и прочие запросы теряют «скрытые» счета.
  if (source === 'quick_button' && endpoint.endsWith('/ai/query')) {
    effectiveIncludeHidden = true;
    effectiveVisibleIds = null;
    payload.includeHidden = true;
    payload.visibleAccountIds = null;
  }

  const res = await axios.post(endpoint, payload, {
    withCredentials: true,
    timeout,
  });

  return {
    text: (res?.data?.text || '').toString(),
    debug: res?.data?.debug || null,
    backendResponse: res?.data || null,
    request: payload,
  };
}

export default { sendAiRequest };
