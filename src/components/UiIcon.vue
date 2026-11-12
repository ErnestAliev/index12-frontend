<script setup>
defineProps({ name: { type: String, required: true } });
const paths = {
  wallet: 'M20 8V5H5a2 2 0 0 1 0-4h14v7M3 3v16a2 2 0 0 0 2 2h15V8H5a2 2 0 0 1-2-2M20 12h-6v5h6M16 14.5h.01',
  play: 'm9 5 11 7-11 7V5Z',
  people: 'M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 21v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75',
  'folder-open': 'M3 8V4h6l2 3h10v4M3 20h16l3-9H6l-3 9ZM3 8v12',
  'file-types': 'M14 2H6v15h13V7l-5-5ZM14 2v5h5M3 6v15h12M9 11h7M9 14h5',
  folder: 'M3 7V4h6l2 3h10v13H3V7Z',
  file: 'M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 13h8M8 17h6',
  sheet: 'M5 3h14v18H5ZM5 9h14M5 15h14M11 9v12',
  image: 'M3 3h18v18H3ZM3 17l5-6 5 5 3-3 5 6M16 7h.01',
  video: 'M3 5h13v14H3ZM16 10l5-4v12l-5-4',
  audio: 'M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3h3M21 16a3 3 0 1 1-3-3h3',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  maximize: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
  minimize: 'M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5',
  key: "M15 7h.01M21 7a5 5 0 0 1-7.5 4.3L4 21H1v-3l3-3h3v-3l3.7-3.5A5 5 0 1 1 21 7Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  ban: "M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0M6.4 6.4l11.2 11.2",
  view: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  minus: "M5 12h14",
  "chevron-up": "m6 15 6-6 6 6",
  back: "m15 6-6 6 6 6",
  calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8",
  filter: "M4 6h16M7 12h10M10 18h4",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",

  menu: "M4 6h16M4 12h16M4 18h16",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sun: "M12 3V1m0 22v-2M3 12H1m22 0h-2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  moon: "M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z",
  logout: "M9 4H4v16h5M14 8l4 4-4 4M8 12h13",
  reply: "m9 5-7 7 7 7M2 12h12a7 7 0 0 1 7 7",
  refresh: "M20 7V3l-3 3a8 8 0 1 0 3 8M20 3h-5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  share: "M12 16V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3",
  chat: "M21 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5A7.5 7.5 0 0 1 9.5 4h4a7.5 7.5 0 0 1 7.5 7.5ZM7 10h9M7 14h6",
  month: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16M10 14l-2 2 2 2m4-4 2 2-2 2",
  send: "m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3",
  copy: "M9 9h12v12H9zM15 9V3H3v12h6",
  settings: "M4 7h16M4 17h16M8 4v6m8 4v6",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  info: "M12 8h.01M11 12h1v5h1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  edit: "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  check: "m5 12 4 4L19 6",
  checks: "M18 6 7 17l-5-5M22 6 11 17l-2-2",
  undo: "M9 4 4 9l5 5M4 9h9a6 6 0 0 1 0 12",
  plus: "M12 5v14M5 12h14",
  attach:
    "m21 11-9 9a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7L9 17.5a2 2 0 0 1-2.8-2.8l8.5-8.5",
  external:
    "M14 4h6v6M20 4 10 14M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  close: "M6 6l12 12M6 18 18 6",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-left": "m15 6-6 6 6 6",
  "chevron-right": "m9 6 6 6-6 6",
};
</script>
<template>
  <svg
    class="ui-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name]" />
  </svg>
</template>
<style scoped>
.ui-icon {
  display: block;
  width: 16px;
  height: 16px;
  flex: none;
}
</style>
