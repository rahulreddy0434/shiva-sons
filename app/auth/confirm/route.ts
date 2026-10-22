import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { destinationFor, isLinkType, linkProblem } from '@/lib/auth/confirm-link'

/**
 * Where every email link lands: sign-up confirmation, password reset and
 * email change.
 *
 * - `?token_hash=…&type=…` (our email templates, see docs/DEPLOYMENT.md): checked
 *   here on the server, so the link works on any phone or browser, not only
 *   the one that signed up.
 * - `?code=…` (Supabase's default templates): only works in the browser that
 *   asked for the email, which is why the templates are changed.
 *
 * Either way the person is signed in and sent on to the right page; a link
 * that failed goes to a page that says why and offers a new one.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const code = searchParams.get('code')
  const rawType = searchParams.get('type')
  const type = isLinkType(rawType) ? rawType : null
  const next = searchParams.get('next')
  const supabase = await createClient()

  let error: { message: string } | null = null
  if (tokenHash && type) {
    ;({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }))
  } else if (code) {
    ;({ error } = await supabase.auth.exchangeCodeForSession(code))
  } else {
    // Supabase reports a failed link in the address itself
    error = { message: searchParams.get('error_description') ?? 'The link is incomplete.' }
  }

  if (error) {
    const problem = new URL('/link-problem', origin)
    problem.searchParams.set('reason', linkProblem(error.message))
    if (type) problem.searchParams.set('type', type)
    return NextResponse.redirect(problem)
  }
  return NextResponse.redirect(new URL(destinationFor(type, next), origin))
}
