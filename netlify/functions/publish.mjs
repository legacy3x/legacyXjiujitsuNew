// "Publish" button in /admin → rebuilds the site with the latest Supabase content.
// Only signed-in CMS admins can trigger it.
// Needs in Netlify: SUPABASE_URL, SUPABASE_ANON_KEY, and either
//   NETLIFY_AUTH_TOKEN (personal access token; works on every plan), or
//   NETLIFY_BUILD_HOOK_URL (build hook, if your plan has them).

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function startBuild(context) {
  const hook = process.env.NETLIFY_BUILD_HOOK_URL;
  if (hook) {
    return fetch(`${hook}?trigger_title=${encodeURIComponent('Published from admin')}`, { method: 'POST' });
  }
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = context?.site?.id || process.env.SITE_ID;
  return fetch(`https://api.netlify.com/api/v1/sites/${siteId}/builds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Published from admin' }),
  });
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const canBuild = process.env.NETLIFY_BUILD_HOOK_URL || process.env.NETLIFY_AUTH_TOKEN;
  if (!supabaseUrl || !anonKey || !canBuild) {
    console.error('publish: missing SUPABASE_URL, SUPABASE_ANON_KEY, or NETLIFY_AUTH_TOKEN / NETLIFY_BUILD_HOOK_URL');
    return json(500, { error: 'Publishing is not set up yet.' });
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Please sign in again.' });
  const auth = { apikey: anonKey, Authorization: `Bearer ${token}` };

  const user = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: auth });
  if (!user.ok) return json(401, { error: 'Please sign in again.' });

  // Row-level security only returns the caller's own row when they're an admin.
  const admins = await fetch(`${supabaseUrl}/rest/v1/cms_admins?select=email`, { headers: auth });
  const rows = admins.ok ? await admins.json() : [];
  if (!rows.length) return json(403, { error: 'This account is not allowed to publish.' });

  const build = await startBuild(context);
  if (!build.ok) {
    console.error('publish: could not start build', build.status, await build.text().catch(() => ''));
    return json(502, { error: 'Could not start the rebuild. Please try again.' });
  }
  return json(200, { ok: true });
};

export const config = { path: '/api/publish' };
