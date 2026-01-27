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
  const payload = {
    message,
    source,
    quickKey,
    mode,
    asOf,
    includeHidden,
    visibleAccountIds,
    debugAi,
  };
  if (snapshot) payload.snapshot = snapshot;

  const endpoint =
    source === 'quick_button' && snapshot
      ? `${apiBaseUrl}/ai/query_snapshot`
      : `${apiBaseUrl}/ai/query`;

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
