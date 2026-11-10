import "/src/assets/main.css";
import { createApp, h, ref } from "vue";
import { createPinia } from "pinia";
import Inspector from "/src/components/TeamFileInspector.vue";
import { teamApi, useTeamChatStore } from "/src/stores/teamChatStore.js";
const pinia = createPinia(),
  chat = useTeamChatStore(pinia),
  file = ref(null),
  show = ref(true),
  requests = [];
chat.me = {
  actorId: "reader-owner",
  workspaceId: "reader-workspace",
  status: "active",
  owner: true,
};
const names = [
  "Таблица.xlsx",
  "Таблица.xls",
  "Таблица.xlsb",
  "Таблица.ods",
  "Таблица.fods",
  "Таблица.csv",
  "Таблица.tsv",
  "Таблица.mxl",
  "Старый.mxl",
  "Страница.html",
  "Страница.htm",
  "Страница.xhtml",
  "Документ.docx",
  "Документ.odt",
  "Документ.doc",
  "Документ.rtf",
  "Выгрузка.doc",
  "Презентация.pptx",
  "Заметки.txt",
  "Данные.json",
  "Markdown.md",
  "Ссылка.gsheet",
  "Повреждённый.docx",
];
function select(name) {
  file.value = {
    fileId: "document-" + names.indexOf(name),
    name,
    mimeType: "application/octet-stream",
    size: 100,
    type: name.startsWith("Таблица") ? "spreadsheet" : "document",
    uploadedBy: { actorId: "reader-owner", name: "Тест" },
    projects: [],
    sources: [],
    tags: [],
    description: "",
    version: 0,
    canEdit: true,
    viewedBy: [],
    createdAt: new Date().toISOString(),
  };
}
teamApi.defaults.adapter = async (config) => {
  requests.push({ url: config.url, method: config.method });
  if (config.method !== "get") return { status: 200, data: { ok: true } };
  const index = Number(config.url.split("/").at(-1).replace("document-", "")),
    response = await fetch(
      "/__document-file?name=" + encodeURIComponent(names[index]),
    );
  return { status: 200, data: new Blob([await response.arrayBuffer()]) };
};
select(names[0]);
createApp({
  render: () =>
    show.value
      ? h(
          "main",
          {
            style:
              "position:fixed;inset:0;display:flex;flex-direction:column;background:var(--color-background)",
          },
          [
            h(Inspector, {
              file: file.value,
              tags: [],
              style: "flex:1;width:100%;height:100%",
            }),
          ],
        )
      : null,
})
  .use(pinia)
  .mount("#app");
window.documentFixture = { select, show, requests };
