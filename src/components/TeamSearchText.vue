<script setup>
import { computed } from "vue";
import { searchTextParts } from "@/utils/teamSearchText";
const props = defineProps({ text: String, query: String });
const parts = computed(() => searchTextParts(props.text, props.query));
</script>
<template>
  <span
    ><template v-for="(part, index) in parts" :key="index"
      ><mark v-if="part.match" class="team-search-match">{{ part.text }}</mark
      ><template v-else>{{ part.text }}</template></template
    ></span
  >
</template>
