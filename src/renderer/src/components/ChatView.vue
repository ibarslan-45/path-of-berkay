<script setup lang="ts">
// ChatView.vue — uygulama-içi "Yardım / Sohbet" botu (Cila ADIM 2).
// Program VEYA PoE2 sorularını yanıtlar. LLM varsa main `chat:send` (kullanıcı sağlayıcısı/anahtarı);
// anahtar yok/hata → gömülü yerel SSS (program-kullanımı). Gizlilik: yalnız soru + program-bağlamı gider.
import { ref, onMounted, nextTick, computed } from 'vue'
import { localAnswer } from '../lib/help-faq'
import { CONTACT } from '../../../config/contact'

const props = defineProps<{ isTr: boolean }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

interface Msg {
  role: 'user' | 'assistant'
  content: string
  source?: 'llm' | 'faq' | 'fallback'
}
const messages = ref<Msg[]>([])
const input = ref('')
const busy = ref(false)
const hasKey = ref(false)
const provider = ref('')
const listEl = ref<HTMLElement | null>(null)

const suggestions = computed(() => [
  tr('Build nasıl içe aktarılır?', 'How do I import a build?'),
  tr('Fiyat kontrolü nasıl çalışır?', 'How does price check work?'),
  tr('Tehlike kontrolü nedir?', 'What is the danger check?'),
  tr('PoE2\'de direnç nasıl çalışır?', 'How do resistances work in PoE2?')
])

async function scrollDown(): Promise<void> {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function send(text?: string): Promise<void> {
  const q = (text ?? input.value).trim()
  if (!q || busy.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: q })
  busy.value = true
  await scrollDown()

  // LLM dene (anahtar varsa); yoksa/başarısızsa yerel SSS
  let answered = false
  if (hasKey.value) {
    try {
      const hist = messages.value.map((m) => ({ role: m.role, content: m.content }))
      const r = await window.api?.chat?.send(hist, props.isTr ? 'tr' : 'en')
      if (r?.ok && r.text) {
        messages.value.push({ role: 'assistant', content: r.text, source: 'llm' })
        answered = true
      }
    } catch {
      /* hata → fallback */
    }
  }
  if (!answered) {
    const faq = localAnswer(q, props.isTr)
    if (faq) {
      messages.value.push({ role: 'assistant', content: faq, source: 'faq' })
    } else {
      messages.value.push({
        role: 'assistant',
        source: 'fallback',
        content: hasKey.value
          ? tr(
              'Şu an yanıtlayamadım (sağlayıcıya ulaşılamadı veya internet yok). Program kullanımı için sorularını "build", "fiyat", "tehlike", "craft", "filter", "ayarlar" gibi anahtar kelimelerle sorabilirsin.',
              'I couldn\'t answer right now (provider unreachable or no internet). For app usage, try keywords like "build", "price", "danger", "craft", "filter", "settings".'
            )
          : tr(
              'Tam yanıt için Ayarlar\'dan bir LLM sağlayıcı + anahtar gir. Anahtarsız da program kullanımına dair temel soruları yanıtlayabilirim — "build", "fiyat", "tehlike", "craft", "filter", "ayarlar", "overlay", "dil" gibi konuları sor.',
              'For full answers, add an LLM provider + key in Settings. Without a key I can still answer basic app-usage questions — ask about "build", "price", "danger", "craft", "filter", "settings", "overlay", "language".'
            )
      })
    }
  }
  busy.value = false
  await scrollDown()
}

// İletişim (ADIM D) — sohbet botu altı
const contact = CONTACT
const discordCopied = ref(false)
async function copyDiscord(): Promise<void> {
  try {
    await navigator.clipboard.writeText(contact.discord)
    discordCopied.value = true
    setTimeout(() => (discordCopied.value = false), 1500)
  } catch {
    /* sessiz */
  }
}
function openEmail(): void {
  window.api?.openExternal?.('mailto:' + contact.email)
}
function openSite(): void {
  if (contact.site) window.api?.openExternal?.(contact.site)
}

// minik markdown: **kalın** + satır sonları
function render(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
}

onMounted(async () => {
  const s = (await window.api?.settings?.get()) as
    | { advisor?: { mode: string; hasKey: boolean; provider: string } }
    | undefined
  if (s?.advisor) {
    hasKey.value = !!s.advisor.hasKey
    provider.value = s.advisor.provider || ''
  }
  window.api?.settings?.onChanged((st) => {
    const a = (st as { advisor?: { hasKey: boolean; provider: string } }).advisor
    if (a) {
      hasKey.value = !!a.hasKey
      provider.value = a.provider || ''
    }
  })
})
</script>

<template>
  <div class="cv">
    <div class="cv-head panel-frame">
      <div class="cv-head-title">💬 {{ tr('Yardım / Sohbet', 'Help / Chat') }}</div>
      <div class="cv-head-note">
        {{ tr('Programı kullanma VEYA Path of Exile 2 hakkında soru sor.', 'Ask about using the app OR about Path of Exile 2.') }}
        <span v-if="hasKey" class="cv-badge cv-badge--on">{{ tr('LLM açık', 'LLM on') }}<span v-if="provider"> · {{ provider }}</span></span>
        <span v-else class="cv-badge cv-badge--off">{{ tr('anahtarsız (yerel SSS)', 'no key (local FAQ)') }}</span>
      </div>
    </div>

    <div ref="listEl" class="cv-list panel-frame">
      <div v-if="!messages.length" class="cv-empty">
        <div class="cv-empty-text">{{ tr('Bir soru sor ya da bir öneriye tıkla:', 'Ask a question or pick a suggestion:') }}</div>
        <div class="cv-sugs">
          <button v-for="(s, i) in suggestions" :key="i" class="cv-sug" @click="send(s)">{{ s }}</button>
        </div>
      </div>
      <div v-for="(m, i) in messages" :key="i" class="cv-msg" :class="'cv-msg--' + m.role">
        <div class="cv-bubble" :class="'cv-bubble--' + m.role">
          <span v-if="m.role === 'assistant'" class="cv-who">
            PoBe<span v-if="m.source === 'faq'" class="cv-src">· {{ tr('yerel SSS', 'local FAQ') }}</span><span v-else-if="m.source === 'fallback'" class="cv-src">· {{ tr('not', 'note') }}</span>
          </span>
          <div class="cv-text" v-html="render(m.content)"></div>
        </div>
      </div>
      <div v-if="busy" class="cv-msg cv-msg--assistant">
        <div class="cv-bubble cv-bubble--assistant cv-typing">⋯ {{ tr('yazıyor…', 'typing…') }}</div>
      </div>
    </div>

    <div class="cv-input panel-frame">
      <textarea
        v-model="input"
        class="cv-box"
        rows="1"
        :placeholder="tr('Sorunu yaz… (Enter ile gönder)', 'Type your question… (Enter to send)')"
        @keydown.enter.exact.prevent="send()"
      ></textarea>
      <button class="cv-send" :disabled="busy || !input.trim()" @click="send()">
        <svg viewBox="0 0 16 16" fill="none" width="15" height="15"><path d="M2 8 L14 2 L9 14 L7.5 9 Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        {{ tr('Gönder', 'Send') }}
      </button>
    </div>

    <!-- İletişim (ADIM D) -->
    <div class="cv-contact">
      {{ tr('İletişim', 'Contact') }}: Discord <code>{{ contact.discord }}</code>
      <button class="cv-contact-btn" @click="copyDiscord">{{ discordCopied ? tr('Kopyalandı ✓', 'Copied ✓') : tr('Kopyala', 'Copy') }}</button>
      · <code>{{ contact.email }}</code>
      <button class="cv-contact-btn" @click="openEmail">{{ tr('E-posta', 'Email') }}</button>
      <template v-if="contact.site">· <button class="cv-contact-btn" @click="openSite">{{ tr('Web sitesi ↗', 'Website ↗') }}</button></template>
    </div>
  </div>
</template>

<style scoped>
.cv {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  max-width: 820px;
  margin: 0 auto;
  width: 100%;
  height: calc(100vh - 96px);
  box-sizing: border-box;
}
.cv-head {
  flex: none;
  padding: 10px 14px;
}
.cv-head-title {
  color: #e0b46a;
  font-variant: small-caps;
  letter-spacing: 0.03em;
  font-size: 15px;
}
.cv-head-note {
  color: var(--text-muted, #9a8d70);
  font-size: 12px;
  margin-top: 3px;
}
.cv-badge {
  display: inline-block;
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: 3px;
  margin-left: 6px;
  vertical-align: middle;
}
.cv-badge--on {
  color: #cfe8c4;
  background: rgba(127, 207, 106, 0.14);
  border: 1px solid rgba(127, 207, 106, 0.4);
}
.cv-badge--off {
  color: #d8b888;
  background: rgba(180, 140, 70, 0.12);
  border: 1px solid rgba(180, 140, 70, 0.35);
}
.cv-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.cv-empty {
  margin: auto;
  text-align: center;
  color: var(--text-muted, #9a8d70);
}
.cv-empty-text {
  font-size: 12.5px;
  margin-bottom: 10px;
}
.cv-sugs {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: center;
}
.cv-sug {
  font-size: 11.5px;
  padding: 5px 11px;
  border-radius: 14px;
  cursor: pointer;
  color: #d8c9a8;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(160, 130, 70, 0.4);
  transition: border-color 0.12s, background 0.12s;
}
.cv-sug:hover {
  border-color: rgba(216, 168, 87, 0.8);
  background: rgba(40, 30, 12, 0.45);
}
.cv-msg {
  display: flex;
}
.cv-msg--user {
  justify-content: flex-end;
}
.cv-bubble {
  max-width: 76%;
  padding: 7px 11px;
  border-radius: 9px;
  font-size: 12.5px;
  line-height: 1.5;
}
.cv-bubble--user {
  color: #1f1708;
  background: linear-gradient(#e0b46a, #c89446);
  border-bottom-right-radius: 2px;
}
.cv-bubble--assistant {
  color: #dccfae;
  background: rgba(20, 16, 9, 0.85);
  border: 1px solid rgba(150, 120, 60, 0.4);
  border-bottom-left-radius: 2px;
}
.cv-who {
  display: block;
  font-size: 10px;
  color: #b89a5e;
  font-variant: small-caps;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}
.cv-src {
  color: #8a7a52;
  margin-left: 4px;
}
.cv-text :deep(b) {
  color: #ecc24a;
}
.cv-typing {
  color: #b89a5e;
  font-style: normal;
}
.cv-input {
  flex: none;
  display: flex;
  gap: 8px;
  padding: 9px 11px;
  align-items: flex-end;
}
.cv-box {
  flex: 1;
  resize: none;
  max-height: 110px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid #4a3c1e;
  border-radius: 5px;
  color: #cdbf9f;
  font-size: 12.5px;
  padding: 8px 10px;
  box-sizing: border-box;
  font-family: inherit;
}
.cv-box:focus {
  outline: none;
  border-color: #8a6d35;
}
.cv-send {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  color: #2a1f08;
  background: linear-gradient(#e0b46a, #c89446);
  border: 1px solid #9a7330;
  border-radius: 5px;
  font-weight: 600;
  font-size: 12.5px;
  padding: 7px 14px;
  cursor: pointer;
  transition: filter 0.12s, transform 0.06s;
}
.cv-send:hover:not(:disabled) {
  filter: brightness(1.08);
}
.cv-send:active:not(:disabled) {
  transform: translateY(1px);
}
.cv-send:disabled {
  opacity: 0.5;
  cursor: default;
}
.cv-contact {
  flex: none;
  font-size: 11px;
  color: #9a8d70;
  text-align: center;
  padding: 2px 0;
}
.cv-contact code {
  color: #d8b888;
}
.cv-contact-btn {
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: #d8c9a8;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(160, 130, 70, 0.4);
  margin: 0 2px;
}
.cv-contact-btn:hover {
  border-color: rgba(216, 168, 87, 0.8);
}
.cv-list::-webkit-scrollbar {
  width: 8px;
}
.cv-list::-webkit-scrollbar-thumb {
  background: #5a461f;
  border-radius: 4px;
}
.cv-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
}
</style>
