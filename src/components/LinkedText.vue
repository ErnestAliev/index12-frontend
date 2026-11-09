<script setup>
import { computed } from "vue";
import { textLinkParts } from "@/utils/textLinks";
import TeamSearchText from "./TeamSearchText.vue";
const props = defineProps({ text: String, highlight: String });
const parts = computed(() => textLinkParts(props.text));
</script>
<template>
  <span class="linked-text"
    ><template v-for="(part, index) in parts" :key="index"
      ><a
        v-if="part.href"
        :href="part.href"
        target="_blank"
        rel="noopener noreferrer"
        @pointerdown.stop
        @click.stop
        @contextmenu.stop
        @keydown.stop
        ><TeamSearchText :text="part.text" :query="highlight" /></a
      ><TeamSearchText v-else :text="part.text" :query="highlight" /></template
  ></span>
</template>
<style scoped>
.linked-text {
  white-space: inherit;
  overflow-wrap: anywhere;
}
.linked-text a {
  padding: 0;
  color: var(--codex-pane-link, var(--color-primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.linked-text a:hover {
  background: transparent;
  text-decoration-thickness: 2px;
}
.linked-text a:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
</style>
