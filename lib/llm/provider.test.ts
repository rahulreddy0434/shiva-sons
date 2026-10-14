import { describe, expect, it, vi } from 'vitest'
import { callWithFallback, geminiModels } from './provider'

const failure = (status: number) => Object.assign(new Error(`status ${status}`), { status })
const noWait = async () => {}

describe('geminiModels', () => {
  it('uses the default model then the default fallbacks', () => {
    expect(geminiModels({})).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash'])
  })

  it('takes the models from the environment, without repeats or blanks', () => {
    expect(geminiModels({ GEMINI_MODEL: 'a', GEMINI_FALLBACK_MODELS: ' b, a ,,c ' })).toEqual(['a', 'b', 'c'])
  })

  it('uses only the main model when fallbacks are switched off', () => {
    expect(geminiModels({ GEMINI_MODEL: 'paid-model', GEMINI_FALLBACK_MODELS: '' })).toEqual(['paid-model'])
  })
})

describe('callWithFallback', () => {
  it('returns the first model’s answer when it works', async () => {
    const call = vi.fn(async (model: string) => `answer from ${model}`)
    expect(await callWithFallback(['a', 'b'], call, noWait)).toBe('answer from a')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('moves to the next model when the first is out of quota', async () => {
    const call = vi.fn(async (model: string) => {
      if (model === 'a') throw failure(429)
      return `answer from ${model}`
    })
    expect(await callWithFallback(['a', 'b'], call, noWait)).toBe('answer from b')
    expect(call.mock.calls.map(([m]) => m)).toEqual(['a', 'b'])
  })

  it('retries an overloaded model before moving on', async () => {
    const call = vi.fn(async (model: string) => {
      if (model === 'a') throw failure(503)
      return 'ok'
    })
    await callWithFallback(['a', 'b'], call, noWait)
    expect(call.mock.calls.map(([m]) => m)).toEqual(['a', 'a', 'a', 'b'])
  })

  it('stops at once on an error another model would not fix', async () => {
    const call = vi.fn(async () => {
      throw failure(401)
    })
    await expect(callWithFallback(['a', 'b'], call, noWait)).rejects.toMatchObject({ status: 401 })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('throws the last error when every model is out of quota', async () => {
    const call = vi.fn(async () => {
      throw failure(429)
    })
    await expect(callWithFallback(['a', 'b'], call, noWait)).rejects.toMatchObject({ status: 429 })
    expect(call).toHaveBeenCalledTimes(2)
  })
})
