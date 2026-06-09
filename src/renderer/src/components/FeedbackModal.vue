<script setup lang="ts">
// FeedbackModal.vue (0.15.1) — uygulamadan doğrudan geri bildirim/öneri/hata bildirme.
// Backend YOK: "E-posta gönder" varsayılan e-posta istemcisini mailto ile açar (konu/gövde
// URL-encode); "Discord'a yaz" kullanıcı adını panoya kopyalar. İletişim bilgisi contact.ts'ten.
import { ref } from 'vue'
import { CONTACT } from '../../../config/contact'

const props = defineProps<{ isTr: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const tr = (a: string, b: string): string => (props.isTr ? a : b)

const text = ref('')
const discordCopied = ref(false)
const sent = ref(false)

function sendEmail(): void {
  const subject = encodeURIComponent('PoBe Geri Bildirim')
  const body = encodeURIComponent(text.value.trim() || '')
  window.api?.openExternal?.(`mailto:${CONTACT.email}?subject=${subject}&body=${body}`)
  sent.value = true
  setTimeout(() => (sent.value = false), 1800)
}
async function copyDiscord(): Promise<void> {
  try {
    await navigator.clipboard.writeText(CONTACT.discord)
    discordCopied.value = true
    setTimeout(() => (discordCopied.value = false), 1600)
  } catch {
    /* sessiz */
  }
}
</script>

<template>
  <div class="fb-backdrop" @click.self="emit('close')">
    <div class="fb-panel">
      <header class="fb-head">
        <span class="fb-title">{{ tr('Geri Bildirim / Öneri', 'Feedback / Suggestion') }}</span>
        <button class="fb-x" :aria-label="tr('Kapat', 'Close')" @click="emit('close')">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" stroke-width="1.6" fill="none" />
          </svg>
        </button>
      </header>
      <div class="fb-body">
        <p class="fb-intro">
          {{ tr('Fikrini, önerini veya bir hatayı buraya yaz. "E-posta gönder"e basınca varsayılan e-posta uygulamanda hazır bir taslak açılır — gönder tuşuna basman yeter.', 'Write your idea, suggestion, or a bug here. Click "Send email" and a ready draft opens in your default mail app — just press send.') }}
        </p>
        <textarea
          v-model="text"
          class="fb-text"
          rows="7"
          :placeholder="tr('Buraya yaz… (ör. şu özellik eklenebilir / şurada hata var)', 'Write here… (e.g. add this feature / there is a bug here)')"
        ></textarea>
        <div class="fb-btnrow">
          <button class="fb-btn fb-btn--primary" @click="sendEmail">
            {{ sent ? tr('E-posta açıldı ✓', 'Mail opened ✓') : tr('✉ E-posta gönder', '✉ Send email') }}
          </button>
          <button class="fb-btn" @click="copyDiscord">
            {{ discordCopied ? tr('Kopyalandı ✓', 'Copied ✓') : tr('💬 Discord’a yaz (@' + CONTACT.discord + ')', '💬 Message on Discord (@' + CONTACT.discord + ')') }}
          </button>
        </div>
        <p class="fb-note">
          {{ tr('Sunucuya hiçbir şey gönderilmez — yalnız e-posta/Discord açılır. Discord: kullanıcı adı panoya kopyalanır, Discord’da @' + CONTACT.discord + ' kullanıcısını ara.', 'Nothing is sent to a server — only your email/Discord opens. Discord: the username is copied to your clipboard, search for @' + CONTACT.discord + ' on Discord.') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 210;
  background: rgba(0, 0, 0, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}
.fb-panel {
  width: 500px;
  max-width: 92vw;
  max-height: 88vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 26px solid transparent;
  border-image: url(../../assets/ui/frame-ornate.png) 68 repeat;
  background-color: #0b1011;
  filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.85));
}
.fb-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 2px 8px;
  border-bottom: 1px solid rgba(184, 154, 102, 0.2);
}
.fb-title {
  font-family: var(--font-serif);
  font-variant: small-caps;
  letter-spacing: 0.06em;
  font-size: 18px;
  color: var(--gem-teal);
}
.fb-x {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
}
.fb-x:hover {
  color: #fff;
}
.fb-body {
  overflow-y: auto;
  padding: 12px 4px 4px;
}
.fb-intro {
  margin: 0 0 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-default);
}
.fb-text {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-default);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid var(--frame-brown, #4a3d28);
  padding: 8px 10px;
}
.fb-text:focus {
  outline: none;
  border-color: var(--gold-line, #b89a66);
}
.fb-btnrow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.fb-btn {
  font-family: var(--font-serif);
  font-size: 12.5px;
  font-variant: small-caps;
  letter-spacing: 0.02em;
  color: var(--gold-title);
  background: linear-gradient(rgba(42, 36, 23, 0.9), rgba(26, 22, 16, 0.92));
  border: 1px solid var(--metal-edge, #6b5a36);
  padding: 7px 14px;
  cursor: pointer;
}
.fb-btn:hover {
  border-color: var(--gold-line, #b89a66);
  color: #fff;
}
.fb-btn--primary {
  color: #0a1614;
  background: var(--gem-teal);
  border-color: var(--gem-teal);
  font-weight: 600;
}
.fb-btn--primary:hover {
  color: #0a1614;
  filter: brightness(1.08);
}
.fb-note {
  margin: 12px 0 0;
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--text-muted);
}
</style>
