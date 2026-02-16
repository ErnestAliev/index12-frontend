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
  accounts = null,
  debugAi = false,
  periodFilter = null,
  timeline = null,
  tableContext = null,
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
    accounts: accounts || null,
    debugAi,
    periodFilter,
    timeline,
  };
  if (snapshot) payload.snapshot = snapshot;
  if (tableContext) payload.tableContext = tableContext;

  // Всегда идём на единый endpoint — сервер сам решает, отвечать из snapshot или БД
  const endpoint = `${apiBaseUrl}/ai/query`;

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
    timeout: mode === 'deep' ? 150000 : timeout, // Deep mode: 2.5 min for quality analysis
  });

  return {
    text: (res?.data?.text || '').toString(),
    debug: res?.data?.debug || null,
    backendResponse: res?.data || null,
    request: payload,
  };
}

// Fetch last N messages from backend session history
export async function fetchAiHistory({ apiBaseUrl, limit = 50, timeout = 8000 }) {
  if (!apiBaseUrl) throw new Error('apiBaseUrl is required');
  const endpoint = `${apiBaseUrl}/ai/history?limit=${encodeURIComponent(limit)}`;
  const res = await axios.get(endpoint, {
    withCredentials: true,
    timeout,
  });
  return Array.isArray(res?.data?.history) ? res.data.history : [];
}

// Reset backend chat history (per user)
export async function resetAiHistory({ apiBaseUrl, timeout = 8000 }) {
  if (!apiBaseUrl) throw new Error('apiBaseUrl is required');
  const endpoint = `${apiBaseUrl}/ai/history`;
  await axios.delete(endpoint, { withCredentials: true, timeout });
  return true;
}

export default { sendAiRequest };
