import { describe, expect, it, vi } from 'vitest'

import { createFrogbotSDK, FrogBotSDK, FrogBotSDKError } from './index'

describe('FrogBotSDK', () => {
  it('composes URLs and configured headers', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    const sdk = createFrogbotSDK({
      baseURL: 'https://frogbot.example/api/',
      fetch,
      headers: { Authorization: 'Bearer token' },
    })

    await sdk.request('files/file-123')

    expect(fetch).toHaveBeenCalledWith(
      'https://frogbot.example/api/files/file-123',
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe('Bearer token')
  })

  it('sends JSON and merges request headers', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    const sdk = new FrogBotSDK({
      baseURL: 'https://frogbot.example/api',
      fetch,
      headers: { 'X-Base': 'base' },
    })

    await sdk.request('/agents', {
      headers: { 'X-Request': 'request' },
      json: { name: 'Support' },
      method: 'POST',
    })

    const init = fetch.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(init?.body).toBe('{"name":"Support"}')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-base')).toBe('base')
    expect(headers.get('x-request')).toBe('request')
  })

  it('sends multipart bodies without setting content type', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('{}')))
    const sdk = createFrogbotSDK({ baseURL: 'https://frogbot.example/api', fetch })
    const body = new FormData()
    body.append('_payload', JSON.stringify({ alt: 'Frog' }))
    body.append('file', new Blob(['frog']), 'frog.txt')

    await sdk.request('/media', { body, method: 'POST' })

    const init = fetch.mock.calls[0]?.[1]
    expect(init?.body).toBe(body)
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
  })

  it('uploads a file to a collection', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({
      doc: { id: 'file-1', filename: 'frog.txt', mimeType: 'text/plain' },
      message: 'Document successfully created.',
    })))
    const sdk = createFrogbotSDK({ baseURL: 'https://frogbot.example/api', fetch })

    await expect(sdk.upload('documents', new File(['frog'], 'frog.txt', { type: 'text/plain' }))).resolves.toEqual({ id: 'file-1', filename: 'frog.txt', mimeType: 'text/plain' })

    expect(fetch.mock.calls[0]?.[0]).toBe('https://frogbot.example/api/documents')
    const body = fetch.mock.calls[0]?.[1]?.body as FormData
    expect(body.get('file')).toBeInstanceOf(File)
    expect(body.get('_payload')).toBe('{}')
  })

  it('throws a typed error with API details', async () => {
    const response = new Response(JSON.stringify({ errors: [{ field: 'name', message: 'Required' }] }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
      statusText: 'Bad Request',
    })
    const sdk = createFrogbotSDK({
      baseURL: 'https://frogbot.example/api',
      fetch: vi.fn(() => Promise.resolve(response)),
    })

    const error = await sdk.request('/agents').catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(FrogBotSDKError)
    expect(error).toMatchObject({
      errors: [{ field: 'name', message: 'Required' }],
      message: 'Required',
      response,
      status: 400,
    })
  })

  it('uses the HTTP status when an error body is not JSON', async () => {
    const sdk = createFrogbotSDK({
      baseURL: 'https://frogbot.example/api',
      fetch: vi.fn(() => Promise.resolve(new Response('Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      }))),
    })

    await expect(sdk.request('/agents')).rejects.toMatchObject({
      errors: [{ message: 'Service Unavailable' }],
      message: 'Service Unavailable',
      status: 503,
    })
  })

  it('surfaces gateway error messages', async () => {
    const sdk = createFrogbotSDK({
      baseURL: 'https://frogbot.example/api',
      fetch: vi.fn(() => Promise.resolve(Response.json({
        error: { message: 'Model not found', type: 'not_found_error' },
      }, { status: 404, statusText: 'Not Found' }))),
    })

    await expect(sdk.request('/ai/v1/models')).rejects.toMatchObject({
      errors: [{ message: 'Model not found' }],
      message: 'Model not found',
      status: 404,
    })
  })

  it('transcribes audio through the configured fetch', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ text: 'ribbit' })))
    const sdk = createFrogbotSDK({
      baseURL: 'https://frogbot.example/api',
      fetch,
      headers: { Authorization: 'Bearer token' },
    })
    const file = new File(['audio'], 'frog.webm', { type: 'audio/webm' })

    await expect(sdk.ai.transcribe({
      file,
      language: 'en',
      model: 'openai/whisper-1',
      timestamp_granularities: ['word', 'segment'],
    })).resolves.toEqual({ text: 'ribbit' })

    expect(fetch.mock.calls[0]?.[0]).toBe('https://frogbot.example/api/ai/v1/audio/transcriptions')
    const init = fetch.mock.calls[0]?.[1]
    const body = init?.body as FormData
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token')
    expect(new Headers(init?.headers).has('content-type')).toBe(false)
    expect(body.get('model')).toBe('openai/whisper-1')
    expect(body.get('file')).toBe(file)
    expect(body.get('language')).toBe('en')
    expect(body.getAll('timestamp_granularities[]')).toEqual(['word', 'segment'])
  })

  it('sends chat completion requests through the shared request path', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ id: 'chat-1' })))
    const sdk = createFrogbotSDK({ baseURL: 'https://frogbot.example/api', fetch })

    const response = await sdk.ai.chat({
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    expect(response).toBeInstanceOf(Response)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://frogbot.example/api/ai/v1/chat/completions')
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'Hello' }] }),
      method: 'POST',
    })
  })
})
