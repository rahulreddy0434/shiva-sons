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

  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/sign-in') ||
    request.nextUrl.pathname.startsWith('/sign-up') ||
    request.nextUrl.pathname.startsWith('/reset-password')

  // The marketing site is open to everyone
  const isPublicRoute = ['/', '/privacy', '/terms'].includes(request.nextUrl.pathname)

  // Scheduled jobs carry their own secret instead of a session (see app/api/cron)
  const isCronRoute = request.nextUrl.pathname.startsWith('/api/cron/')

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
  // pdfjs/: the PDF viewer's worker and decoders (public, no data in them)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs)$).*)'],
}