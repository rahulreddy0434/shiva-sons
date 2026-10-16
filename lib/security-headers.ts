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
export function securityHeaders({ supabaseUrl, isDev }: { supabaseUrl: string; isDev: boolean }) {
  const supabase = new URL(supabaseUrl).origin
  const supabaseSocket = supabase.replace(/^http/, 'ws')

  const policy = [
    "default-src 'self'",
    // React needs eval only in development, for its error overlay
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseSocket}`,
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
