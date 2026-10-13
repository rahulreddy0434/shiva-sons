import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { storeWorkbook, WorkbookError } from '@/lib/excel/store-workbook'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const jobId = formData.get('jobId') as string | null

  if (!file || !jobId) {
    return NextResponse.json({ error: 'Missing file or jobId' }, { status: 400 })
  }

  try {
    const result = await storeWorkbook(supabase, {
      userId: user.id,
      jobId,
      filename: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof WorkbookError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Workbook upload failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'The workbook could not be saved. Please try again.' }, { status: 500 })
  }
}
