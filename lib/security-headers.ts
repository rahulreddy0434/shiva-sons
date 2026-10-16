/**
 * Response headers that keep the browser from doing what the app never needs:
 * being framed by another site (clickjacking), guessing file types, sending the
 * full address to other sites, or loading code from anywhere but here.
 *
 * The content policy allows exactly what the pages use: Supabase for data,
 * sign-in, uploads and document images, and WebAssembly for the PDF viewer's
 * scan decoders. Inline scripts are allowed because Next.js needs them without
 * a nonce (see the Next.js content-security-policy guide, "Without Nonces").
 */
export function securityHeaders({ supabaseUrl, isDev }: { supabaseUrl: string | undefined; isDev: boolean }) {
  // A build without the Supabase address (say, a Vercel environment missing its
  // variables) still builds; the pages then simply cannot reach Supabase
  const supabase = parseOrigin(supabaseUrl)
  if (!supabase) console.warn('NEXT_PUBLIC_SUPABASE_URL is not set, so the content policy allows no Supabase address.')
  const supabaseSources = supabase ? ` ${supabase} ${supabase.replace(/^http/, 'ws')}` : ''

  const policy = [
    "default-src 'self'",
    // React needs eval only in development, for its error overlay
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ''}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabaseSources}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // No upgrade-insecure-requests: Vercel already forces https (Strict-Transport-Security),
    // and the rule breaks `next start` on http://localhost
    "frame-ancestors 'none'",
  ].join('; ')

  return [
    { key: 'Content-Security-Policy', value: policy },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ]
}

function parseOrigin(url: string | undefined): string | null {
  try {
    return url ? new URL(url).origin : null
  } catch {
    return null
  }
}
