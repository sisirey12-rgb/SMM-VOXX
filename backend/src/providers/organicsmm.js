const DEFAULT_URL = 'https://organicsmm.online/functions/v1/public-api';

/** Read-only OrganicSMM adapter. Order placement is deliberately not supported. */
export async function organicRead(action, fields = {}) {
  if (!['services', 'balance'].includes(action)) {
    const error = new Error('OrganicSMM order and order-status actions are disabled in VOX.');
    error.status = 403;
    throw error;
  }

  const key = process.env.ORGANIC_SMM_API_KEY;
  if (!key) {
    const error = new Error('OrganicSMM API key is not configured on the server.');
    error.status = 503;
    throw error;
  }

  let response;
  try {
    response = await fetch(process.env.ORGANIC_SMM_BASE_URL || DEFAULT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ key, action, ...fields }),
      signal: AbortSignal.timeout(12_000)
    });
  } catch {
    const error = new Error('OrganicSMM could not be reached.');
    error.status = 502;
    throw error;
  }

  let data;
  try { data = await response.json(); }
  catch {
    const error = new Error('OrganicSMM returned an unreadable response.');
    error.status = 502;
    throw error;
  }

  if (!response.ok || data?.error || data?.status === 'error') {
    const error = new Error(data?.error || data?.message || `OrganicSMM request failed (${response.status}).`);
    error.status = 502;
    throw error;
  }

  if (action === 'services') {
    if (data?.status !== 'ok' || !Array.isArray(data.services)) {
      const error = new Error('OrganicSMM returned an unexpected services response.');
      error.status = 502;
      throw error;
    }
    return data.services;
  }

  if (action === 'balance') {
    if (data?.status !== 'ok' || data.balance == null || typeof data.currency !== 'string') {
      const error = new Error('OrganicSMM returned an unexpected balance response.');
      error.status = 502;
      throw error;
    }
    return { balance: String(data.balance), currency: data.currency };
  }
}
