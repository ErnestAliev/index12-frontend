import "/src/assets/main.css";
import { createApp, h, ref } from "vue";
import { createPinia } from "pinia";
import Thumbnail from "/src/components/TeamFileThumbnail.vue";
import Navigation from "/src/components/mobile/MobileActionPanel.vue";
import { useMainStore } from "/src/stores/mainStore.js";
import { useTeamChatStore, teamApi } from "/src/stores/teamChatStore.js";
const pinia = createPinia(),
  main = useMainStore(pinia),
  chat = useTeamChatStore(pinia);
main.user = { name: "Fixture", role: "admin", workspaceRole: "admin" };
chat.me = {
  workspaceId: "thumbnail-fixture",
  actorId: "owner:fixture",
  status: "active",
  owner: true,
};
const show = ref(true),
  gets = [],
  writes = [],
  events = [],
  files = [],
  blobs = new Map();
if (!new URLSearchParams(location.search).has("nav")) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const paint = canvas.getContext("2d");
  paint.fillStyle = "#3b6763";
  paint.fillRect(0, 0, 1200, 800);
  paint.fillStyle = "#e2ac65";
  paint.fillRect(0, 0, 600, 800);
  const photo = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg"),
  );
  const movie = await (
    await fetch("/tests/browser/fixtures/thumbnail-frame.mp4")
  ).blob();
  for (const [id, name, type, mimeType, blob] of [
    ["photo", "Фото.JPG", "image", "application/octet-stream", photo],
    ["video", "Ролик.mov", "video", movie.type, movie],
    [
      "broken",
      "Повреждённый.mp4",
      "video",
      "video/mp4",
      new Blob(["not a movie"]),
    ],
  ]) {
    files.push({ fileId: id, name, type, mimeType, size: blob.size });
    blobs.set(id, blob);
  }
}
teamApi.defaults.adapter = async (config) => {
  if (config.method !== "get") {
    writes.push(config.url);
    return { status: 200, data: {} };
  }
  const id = config.url.split("/").at(-1);
  gets.push(id);
  return { status: 200, data: blobs.get(id) };
};
createApp({
  render: () =>
    new URLSearchParams(location.search).has("nav")
      ? h(
          "main",
          {
            style: "position:fixed;inset:0;background:var(--color-background)",
          },
          h(
            "div",
            { style: "position:absolute;bottom:0;left:0;right:0" },
            h(Navigation, {
              currentMonthLabel: "Ноябрь",
              onOpenCodex: () => events.push("codex"),
              onOpenCalendar: () => events.push("calendar"),
              onOpenTeamChat: () => events.push("chat"),
              onOpenUserMenu: () => events.push("menu"),
            }),
          ),
        )
      : h(
          "main",
          { style: "display:flex;gap:10px" },
          show.value
            ? files.map((file) =>
                h(
                  "div",
                  {
                    "data-thumb": file.fileId,
                    style: "width:200px;height:150px",
                  },
                  h(Thumbnail, { file }),
                ),
              )
            : [],
        ),
})
  .use(pinia)
  .mount("#app");
window.fileMedia = { show, gets, writes, events, chat };
