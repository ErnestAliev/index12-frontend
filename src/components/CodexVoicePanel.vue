<script setup>
import CodexGlyph from './CodexGlyph.vue';
defineProps({ status: String, phase: String, muted: Boolean, caption: String, playbackBlocked: Boolean });
defineEmits(['stop', 'mute', 'play']);
</script>

<template>
  <section class="codex-voice-panel" :class="[phase, { muted }]" aria-label="Голосовой диалог" @keydown.esc.stop="$emit('stop')">
    <div class="codex-voice-orb" aria-hidden="true"><span v-for="i in 5" :key="i" :style="{ '--bar': i }" /></div>
    <div class="codex-voice-status" role="status">{{ status }}</div>
    <div v-if="caption" class="codex-voice-caption">{{ caption }}</div>
    <div class="codex-voice-controls">
      <button v-if="playbackBlocked" type="button" class="codex-voice-control" title="Включить звук" aria-label="Включить звук" @click="$emit('play')"><CodexGlyph name="volume" /></button>
      <button type="button" class="codex-voice-control" :class="{ selected: muted }" :aria-pressed="muted" :title="muted ? 'Включить микрофон' : 'Выключить микрофон'" :aria-label="muted ? 'Включить микрофон' : 'Выключить микрофон'" @click="$emit('mute')"><CodexGlyph :name="muted ? 'microphoneOff' : 'microphone'" /></button>
      <button type="button" class="codex-voice-control end" title="Завершить голосовой диалог" aria-label="Завершить голосовой диалог" @click="$emit('stop')"><CodexGlyph name="close" /></button>
    </div>
  </section>
</template>

<style scoped>
.codex-voice-panel { flex: none; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 18px var(--chat-composer-bottom-space, 16px); border-top: 1px solid var(--codex-pane-border); background: var(--codex-pane-bg); color: var(--codex-pane-text); }
.codex-voice-orb { width: 84px; height: 84px; display: flex; align-items: center; justify-content: center; gap: 5px; border-radius: 50%; background: radial-gradient(circle at 30% 25%, #86b6fc, #4285d8 58%, #4261a5); box-shadow: 0 4px 24px #4285d825; }
.codex-voice-orb span { display: block; width: 5px; height: calc(12px + var(--bar) * 3px); max-height: 32px; border-radius: 4px; background: #fff; opacity: .9; animation: codex-voice-wave 1.2s ease-in-out infinite; animation-delay: calc(var(--bar) * -150ms); }
.thinking .codex-voice-orb, .connecting .codex-voice-orb { animation: codex-voice-pulse 1.6s ease-in-out infinite; }
.thinking .codex-voice-orb span, .connecting .codex-voice-orb span, .muted .codex-voice-orb span { animation: none; height: 8px; }
.muted .codex-voice-orb { filter: grayscale(.7); opacity: .65; }
.codex-voice-status { font-size: 14px; font-weight: 500; }
.codex-voice-caption { color: var(--codex-pane-muted); font-size: 13px; line-height: 1.45; text-align: center; max-width: 100%; max-height: 56px; overflow: auto; overflow-wrap: anywhere; }
.codex-voice-controls { display: flex; align-items: center; justify-content: center; gap: 18px; }
.codex-voice-control { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--codex-pane-border); border-radius: 50%; background: var(--codex-pane-surface); color: var(--codex-pane-text); cursor: pointer; }
.codex-voice-control:hover { background: var(--codex-pane-hover); }
.codex-voice-control.end, .codex-voice-control.selected { color: var(--codex-pane-danger); background: var(--codex-pane-danger-soft); border-color: transparent; }
.codex-voice-control:focus-visible { outline: 2px solid var(--codex-pane-focus); outline-offset: 3px; }
@keyframes codex-voice-wave { 0%, 100% { transform: scaleY(.55); } 50% { transform: scaleY(1); } }
@keyframes codex-voice-pulse { 50% { opacity: .6; } }
@container codex-window (max-height: 480px) { .codex-voice-panel { padding: 10px 10px var(--chat-composer-bottom-space, 10px); gap: 6px; } .codex-voice-orb { width: 52px; height: 52px; } .codex-voice-caption { max-height: 38px; } }
@media (prefers-reduced-motion: reduce) { .codex-voice-orb, .codex-voice-orb span { animation: none !important; } }
</style>
