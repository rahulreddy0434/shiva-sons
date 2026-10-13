/**
 * Mock mode replaces Azure Document Intelligence and the LLM with canned,
 * obviously fake output, so the whole workflow can be exercised without
 * credentials, quota or cost. It is switched on with MOCK_AI=true and is
 * announced on every signed-in page — mock results are never real readings.
 */
export function isMockMode(): boolean {
  return process.env.MOCK_AI === 'true'
}

export const MOCK_LABEL = 'MOCK'
