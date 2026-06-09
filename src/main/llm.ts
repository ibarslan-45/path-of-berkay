// llm.ts — provider-agnostik LLM istek kurma + cevap normalize (SAF, test edilebilir).
// Ağ yok: callLLM (main/index.ts) bunu kullanıp net.fetch ile gönderir. 3 sağlayıcı:
//   Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google). Hepsi tek metne normalize.
export type LlmProvider = 'claude' | 'openai' | 'gemini'

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  claude: 'claude-3-5-haiku-latest',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash'
}

export interface LlmRequest {
  url: string
  headers: Record<string, string>
  body: string
}

/** Seçili sağlayıcı için HTTP isteği (url + headers + body) kur. Anahtar yalnız header/url'de. */
export function buildLlmRequest(
  provider: LlmProvider,
  model: string,
  key: string,
  system: string,
  user: string,
  maxTokens: number
): LlmRequest {
  if (provider === 'claude') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true' // net.fetch (Chromium) için
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }]
      })
    }
  }
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    }
  }
  // gemini — anahtar query param, system ayrı alan (systemInstruction)
  return {
    url:
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=` +
      encodeURIComponent(key),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    })
  }
}

/** Yazar notları çeviri CACHE anahtarı = sağlayıcı + not içeriği hash'i (Faz 5).
 *  Aynı not + aynı sağlayıcı → aynı anahtar → cache hit (LLM çağrısı yapılmaz). */
export function notesCacheKey(provider: string, text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return provider + '|' + (h >>> 0).toString(36)
}

/** Uzun notları çift-satır paragraflara göre ~max ch'lik parçalara böl (token limiti için). */
export function chunkNotes(s: string, max = 3000): string[] {
  const paras = s.split(/\n\n+/)
  const out: string[] = []
  let cur = ''
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > max) {
      out.push(cur)
      cur = p
    } else cur = cur ? cur + '\n\n' + p : p
  }
  if (cur) out.push(cur)
  return out.length ? out : [s]
}

/** Sağlayıcı cevabını TEK düz metne normalize et (şema farklı; çıkmazsa ''). */
export function parseLlmResponse(provider: LlmProvider, json: unknown): string {
  const o = json as Record<string, unknown>
  if (provider === 'claude') {
    const content = o?.content as Array<{ text?: string }> | undefined
    return content?.[0]?.text ?? ''
  }
  if (provider === 'openai') {
    const choices = o?.choices as Array<{ message?: { content?: string } }> | undefined
    return choices?.[0]?.message?.content ?? ''
  }
  const cands = o?.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  return (cands?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
}
