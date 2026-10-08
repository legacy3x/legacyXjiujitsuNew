// Server-side Supabase access with the service key (bypasses row-level security).
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Never send this key to the browser.

const baseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    apikey: key,
    // Legacy JWT keys also go in Authorization; new sb_secret_ keys must not.
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
    ...extra,
  };
}

export const supabaseConfigured = () => Boolean(baseUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);

async function call(path, init) {
  const res = await fetch(`${baseUrl()}/rest/v1/${path}`, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(body?.message || `Supabase ${res.status}`);
    err.status = res.status;
    err.code = body?.message;
    throw err;
  }
  return body;
}

export const rpc = (name, args) => call(`rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });

export const select = (table, query) => call(`${table}?${query}`, { headers: headers() });

// Returns the updated rows.
export const update = (table, query, values) => call(`${table}?${query}`, {
  method: 'PATCH',
  headers: headers({ Prefer: 'return=representation' }),
  body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
});

// Inserts rows and returns them. With onConflict (comma-separated columns) it upserts,
// overwriting only the columns that are sent.
export const insert = (table, rows, { onConflict } = {}) => call(
  `${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`,
  {
    method: 'POST',
    headers: headers({ Prefer: `return=representation${onConflict ? ',resolution=merge-duplicates' : ''}` }),
    body: JSON.stringify(rows),
  },
);
