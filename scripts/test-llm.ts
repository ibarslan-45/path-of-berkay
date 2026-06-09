/**
 * test-llm.ts — çoklu sağlayıcı LLM istek-kurma + cevap-normalize birim testi (saf, ağsız).
 * Çalıştırma: npx tsx scripts/test-llm.ts
 */
import { buildLlmRequest, parseLlmResponse, DEFAULT_MODELS, notesCacheKey, chunkNotes } from '../src/main/llm'

let pass = 0,
  fail = 0
function check(name: string, cond: boolean, got?: unknown): void {
  if (cond) (pass++, console.log(`  ✓ ${name}`))
  else (fail++, console.log(`  ✗ ${name}` + (got !== undefined ? `  (got: ${JSON.stringify(got)})` : '')))
}
const SYS = 'You are a translator.'
const USER = 'Merhaba'

console.log('Varsayılan modeller:')
check('claude', DEFAULT_MODELS.claude === 'claude-3-5-haiku-latest', DEFAULT_MODELS.claude)
check('openai = gpt-4o-mini', DEFAULT_MODELS.openai === 'gpt-4o-mini', DEFAULT_MODELS.openai)
check('gemini = gemini-2.0-flash', DEFAULT_MODELS.gemini === 'gemini-2.0-flash', DEFAULT_MODELS.gemini)

console.log('\nClaude (Anthropic) isteği:')
const c = buildLlmRequest('claude', 'claude-3-5-haiku-latest', 'KEYC', SYS, USER, 300)
const cb = JSON.parse(c.body)
check('url', c.url === 'https://api.anthropic.com/v1/messages', c.url)
check('x-api-key header', c.headers['x-api-key'] === 'KEYC')
check('anthropic-version', c.headers['anthropic-version'] === '2023-06-01')
check('browser-access header', c.headers['anthropic-dangerous-direct-browser-access'] === 'true')
check('body system ayrı', cb.system === SYS)
check('body messages[user]', cb.messages[0].role === 'user' && cb.messages[0].content === USER)
check('body max_tokens', cb.max_tokens === 300)

console.log('\nChatGPT (OpenAI) isteği:')
const o = buildLlmRequest('openai', 'gpt-4o-mini', 'KEYO', SYS, USER, 300)
const ob = JSON.parse(o.body)
check('url', o.url === 'https://api.openai.com/v1/chat/completions', o.url)
check('Bearer auth', o.headers['authorization'] === 'Bearer KEYO', o.headers['authorization'])
check('messages[system]+[user]', ob.messages[0].role === 'system' && ob.messages[1].role === 'user')
check('system içeriği', ob.messages[0].content === SYS)

console.log('\nGemini (Google) isteği:')
const g = buildLlmRequest('gemini', 'gemini-2.0-flash', 'KEYG', SYS, USER, 300)
const gb = JSON.parse(g.body)
check('url model + key param', g.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEYG', g.url)
check('systemInstruction', gb.systemInstruction.parts[0].text === SYS)
check('contents[user]', gb.contents[0].role === 'user' && gb.contents[0].parts[0].text === USER)
check('maxOutputTokens', gb.generationConfig.maxOutputTokens === 300)
check('anahtar header’da DEĞİL (query’de)', !JSON.stringify(g.headers).includes('KEYG'))

console.log('\nCevap normalize (her sağlayıcı → tek metin):')
check('claude', parseLlmResponse('claude', { content: [{ text: 'CevapC' }] }) === 'CevapC')
check('openai', parseLlmResponse('openai', { choices: [{ message: { content: 'CevapO' } }] }) === 'CevapO')
check('gemini', parseLlmResponse('gemini', { candidates: [{ content: { parts: [{ text: 'Ce' }, { text: 'vapG' }] } }] }) === 'CevapG')
check('boş/bozuk → ""', parseLlmResponse('claude', null) === '' && parseLlmResponse('openai', {}) === '')

console.log('\nYazar notları cache anahtarı (Faz 5):')
const k1 = notesCacheKey('claude', 'Hello build notes')
check('aynı not+sağlayıcı → aynı anahtar (cache hit)', k1 === notesCacheKey('claude', 'Hello build notes'))
check('farklı sağlayıcı → farklı anahtar', k1 !== notesCacheKey('openai', 'Hello build notes'))
check('farklı not → farklı anahtar', k1 !== notesCacheKey('claude', 'Different notes'))
check('anahtar provider ön-ekli', k1.startsWith('claude|'), k1)

console.log('\nUzun not parçalama (chunk):')
const short = chunkNotes('tek paragraf')
check('kısa → tek parça', short.length === 1 && short[0] === 'tek paragraf')
const long = 'A'.repeat(2000) + '\n\n' + 'B'.repeat(2000) + '\n\n' + 'C'.repeat(2000)
const chunks = chunkNotes(long, 3000)
check('uzun → birden çok parça', chunks.length >= 2, chunks.length)
check('her parça ≤ ~3000', chunks.every((c) => c.length <= 3100), chunks.map((c) => c.length))
check('birleştirince içerik korunur', chunks.join('\n\n').replace(/\n/g, '').length === long.replace(/\n/g, '').length)

console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı`)
process.exit(fail ? 1 : 0)
