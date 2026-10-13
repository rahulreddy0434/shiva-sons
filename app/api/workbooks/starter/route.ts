import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildStarterTemplate, STARTER_TEMPLATE_FILENAME } from '@/lib/excel/starter-template'
import { storeWorkbook, WorkbookError } from '@/lib/excel/store-workbook'

/**
 * Gives a job the standard timecard template, for customers with no workbook of their own.
 * Body: { jobId }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (typeof body?.jobId !== 'string') {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
  }

  try {
    const result = await storeWorkbook(supabase, {
      userId: user.id,
      jobId: body.jobId,
      filename: STARTER_TEMPLATE_FILENAME,
      buffer: await buildStarterTemplate(),
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof WorkbookError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Starter template failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The template could not be created. Please try again.' }, { status: 500 })
  }
}
