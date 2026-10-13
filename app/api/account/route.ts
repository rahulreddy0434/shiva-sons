import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeAllUnder } from '@/lib/storage/list-paths'

/**
 * Permanently deletes the signed-in user's account and everything in it.
 * Body: { confirmEmail } — must match the account's email.
 *
 * Files first (with the user's own session), then the sign-in itself, which
 * cascades through every table. The elevated client is used for that last
 * step only, and only on the caller's own id.
 */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const typed = typeof body?.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : ''
  if (!user.email || typed !== user.email.toLowerCase()) {
    return NextResponse.json({ error: 'Type your account email exactly to confirm.' }, { status: 400 })
  }

  try {
    await removeAllUnder(supabase, user.id)
  } catch (err) {
    console.error(`Account deletion: files for ${user.id} not removed:`, err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Your files could not be removed, so nothing was deleted. Please try again.' },
      { status: 500 }
    )
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(user.id)
  if (error) {
    console.error(`Account deletion: sign-in for ${user.id} not removed: ${error.message}`)
    return NextResponse.json(
      { error: 'Your files were removed but the account could not be closed. Please try again.' },
      { status: 500 }
    )
  }

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
