import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Always run: a cached answer would say the site is up when it is not
export const dynamic = 'force-dynamic'

/**
 * For the uptime monitor (docs/DEPLOYMENT.md → Monitoring): answers
 * {"status":"ok"} when the site is up and can reach its database. No
 * sign-in, and nothing about any account is read or returned.
 */
export async function GET() {
  const started = Date.now()
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  })
  // Row level security returns nothing to a visitor, but the query proves the database answers
  const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' }).limit(1)
  const body = { status: error ? 'degraded' : 'ok', database: error ? 'unreachable' : 'ok', ms: Date.now() - started }
  return NextResponse.json(body, { status: error ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
}
