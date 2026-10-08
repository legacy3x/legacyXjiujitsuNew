// Checks that a request comes from a signed-in CMS admin (Supabase session token in the
// Authorization header). Returns null when it does, or a { status, error } to send back.

export async function requireAdmin(req) {
  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return { status: 500, error: 'The admin is not connected to Supabase yet.' };

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return { status: 401, error: 'Please sign in again.' };
  const auth = { apikey: anonKey, Authorization: `Bearer ${token}` };

  const user = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: auth });
  if (!user.ok) return { status: 401, error: 'Please sign in again.' };

  // Row-level security only returns the caller's own row when they're an admin.
  const admins = await fetch(`${supabaseUrl}/rest/v1/cms_admins?select=email`, { headers: auth });
  const rows = admins.ok ? await admins.json() : [];
  if (!rows.length) return { status: 403, error: 'This account does not have admin access.' };
  return null;
}
