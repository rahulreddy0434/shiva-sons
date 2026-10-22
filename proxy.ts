import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Pages for signed-out people; someone signed in is sent to the dashboard instead
  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/sign-in') || request.nextUrl.pathname.startsWith('/sign-up')

  // Open to everyone, signed in or not: the marketing site, and the pages email
  // links lead to. A password-reset link signs the person in, and they must
  // still reach the new-password form.
  const isPublicRoute =
    ['/', '/privacy', '/terms', '/link-problem'].includes(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith('/reset-password') ||
    request.nextUrl.pathname.startsWith('/auth/')

  // Scheduled jobs carry their own secret instead of a session (see app/api/cron);
  // the uptime monitor checks /api/health without signing in
  const isCronRoute = request.nextUrl.pathname.startsWith('/api/cron/') || request.nextUrl.pathname === '/api/health'

  if (!user && !isAuthRoute && !isPublicRoute && !isCronRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  // pdfjs/: the PDF viewer's worker and decoders (public, no data in them).
  // monitoring: error reports on their way to Sentry (next.config.ts), from signed-out pages too
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pdfjs/|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs)$).*)'],
}