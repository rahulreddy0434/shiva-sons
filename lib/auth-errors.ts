/**
 * Supabase's sign-in messages are written for developers ("email rate limit
 * exceeded"). These are the ones people actually meet, in plain words; any
 * other message is shown as it is.
 */
const FRIENDLY: [RegExp, string][] = [
  [
    /rate limit/i,
    'We could not send the email just now because too many have been sent in the last hour. Please try again later.',
  ],
  [/invalid login credentials/i, 'That email and password do not match an account.'],
  [/email not confirmed/i, 'Please confirm your email first: open the link we sent you, then sign in.'],
  [/already registered|already been registered/i, 'An account with this email already exists. Sign in, or reset your password.'],
  [/should be different from the old password/i, 'Choose a password different from your current one.'],
  [/(auth session missing|link is invalid|expired)/i, 'This link has expired or was already used. Ask for a new one.'],
]

export function friendlyAuthError(message: string): string {
  return FRIENDLY.find(([pattern]) => pattern.test(message))?.[1] ?? message
}
