/**
 * Turns a provider failure into something a business owner can act on,
 * without leaking provider internals or document contents.
 */
export function describeLlmError(err: unknown): string {
  const status = (err as { status?: number } | null)?.status

  if (status === 429) {
    return 'The AI service has reached its usage limit for now. Wait a minute and try again; if it keeps happening, the free daily limit is used up until tomorrow.'
  }
  if (status === 503) {
    return 'The AI service is busy right now. Try again in a few minutes.'
  }
  if (status === 401 || status === 403) {
    return 'The AI service rejected the app’s credentials. Check the API key in the server settings.'
  }
  const message = err instanceof Error ? err.message : ''
  if (message.startsWith('Gemini')) {
    return 'The AI service returned a response the app could not use. Try again.'
  }
  return 'Something went wrong on our side. Try again.'
}
