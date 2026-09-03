import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client for server-side API routes.
 *
 * Built lazily on first use rather than at module scope: `next build` evaluates
 * every route module to collect its configuration, so a module-scope client
 * would make the build fail whenever the environment is not yet configured
 * (for example, the very first deploy before env vars are added).
 *
 * Never import this from client components — the service-role key bypasses
 * Row Level Security.
 *
 * NOTE: nothing in the app currently uses this. Reach for it only when a job
 * genuinely cannot run as the signed-in user (a cron task, a webhook with no
 * session). For anything a user triggers, use the session client in
 * ./server.ts instead and let RLS enforce access — bypassing RLS means
 * re-implementing every authorization rule by hand, which is how
 * wip/api-shops ended up returning customers' phone numbers to anyone.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
          'SUPABASE_SERVICE_ROLE_KEY in the deployment environment.'
      );
    }

    client = createClient(url, key);
  }

  return client;
}
