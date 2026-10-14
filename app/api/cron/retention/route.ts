import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { purgeExpiredDocuments } from '@/lib/retention'

// Many accounts' files can be due at once
export const maxDuration = 300

/**
 * Daily retention run for every account, called by Vercel Cron (vercel.json).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else is refused.
 * It is not a user action, so it uses the service-role client, and it does
 * exactly one thing: what users' own dashboards already do for themselves.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  }

  const purged = await purgeExpiredDocuments(createAdminClient())
  return NextResponse.json({ purged })
}
