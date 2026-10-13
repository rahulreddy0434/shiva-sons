import { createClient } from '@supabase/supabase-js'

/**
 * A client with the service-role key, which bypasses row level security.
 *
 * It exists for the few operations a user's own session cannot perform
 * (deleting their sign-in). Rules: server only; never import this from a
 * client component; always establish who the caller is with the normal
 * client first and act only on that user's own id.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('The admin client must never be created in the browser')
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
