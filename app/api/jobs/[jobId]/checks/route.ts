import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseCheckPolicyInput } from '@/lib/validation/check-policy'

/**
 * Saves the job's check settings. Body: { policy: { maxHoursPerDay, … } }.
 * They change only what Review flags; extracted values are not touched.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { jobId } = await params
  const body = await request.json().catch(() => null)
  const parsed = parseCheckPolicyInput(body?.policy)
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  // Row level security limits the update to the user's own jobs
  const { data, error } = await supabase
    .from('extraction_jobs')
    .update({ check_policy: parsed.policy })
    .eq('id', jobId)
    .select('id')
  if (error) {
    const missingColumn = /check_policy/.test(error.message)
    return NextResponse.json(
      { error: missingColumn ? 'Settings cannot be saved until the latest database update is applied.' : error.message },
      { status: missingColumn ? 503 : 500 }
    )
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  return NextResponse.json({ policy: parsed.policy })
}
