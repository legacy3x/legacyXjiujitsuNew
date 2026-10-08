// Minimal Printful API client (https://developers.printful.com/docs/). Needs PRINTFUL_API_KEY —
// a private token with: view stores, view sync products, view and manage orders.

export const printfulConfigured = () => Boolean(process.env.PRINTFUL_API_KEY);

// storeId is sent as X-PF-Store-Id, which account-level tokens need for store endpoints.
export async function printful(path, { method = 'GET', body, storeId } = {}) {
  const request = () => fetch(`https://api.printful.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
      'Content-Type': 'application/json',
      ...(storeId ? { 'X-PF-Store-Id': String(storeId) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let res = await request();
  if (res.status === 429) { // 120 calls/minute: wait briefly and try once more
    const wait = Math.min(Number(res.headers.get('retry-after')) || 2, 5);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await request();
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || (typeof data?.result === 'string' ? data.result : '') || `Printful ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data; // { code, result, paging? }
}
