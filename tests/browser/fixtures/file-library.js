import "/src/assets/main.css";
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import Library from "/src/components/TeamFileLibrary.vue";
import Frame from "/src/components/ChatWindowFrame.vue";
import Header from "/src/components/TeamChatHeader.vue";
import Pane from "/src/components/TeamChatPane.vue";
import { teamApi, useTeamChatStore } from "/src/stores/teamChatStore.js";
const pinia = createPinia(),
  chat = useTeamChatStore(pinia),
  mobile = innerWidth <= 700;
chat.me = {
  workspaceId: "fixture",
  actorId: "owner:fixture",
  displayName: "Эрнест",
  name: "Эрнест",
  status: "active",
  owner: true,
  role: "manager",
};
const project = { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Проект системы" },
  taskId = crypto.randomUUID(),
  messageId = crypto.randomUUID();
const files = Array.from({ length: 83 }, (_, index) => ({
  fileId: crypto.randomUUID(),
  name:
    index === 0
      ? "Заметки.txt"
      : index === 1
        ? "Таблица.xlsx"
        : `Документ ${index}.pdf`,
  mimeType: index === 0 ? "text/plain" : "application/octet-stream",
  size: 512 + index,
  type: index === 0 ? "document" : index === 1 ? "spreadsheet" : "pdf",
  createdAt: new Date(
    Date.UTC(2026, 10, 10 - Math.floor(index / 5), 8),
  ).toISOString(),
  uploadedBy: { actorId: "owner:fixture", name: "Эрнест" },
  projects: index % 2 ? [project] : [],
  tags: [],
  description: index === 0 ? "Описание из коллекции" : "",
  version: 0,
  canEdit: true,
  viewedBy: [],
  sources: [
    {
      kind: "message",
      messageId: index === 1 ? taskId : messageId,
      taskId: index === 1 ? taskId : null,
      taskName: index === 1 ? "Задача с файлом" : "",
      text: index === 1 ? "Вложение задачи" : "Исходное сообщение",
      authorName: "Эрнест",
      authorId: "owner:fixture",
      createdAt: new Date().toISOString(),
      projectId: index % 2 ? project._id : null,
      projectName: index % 2 ? project.name : "",
    },
  ],
}));
const tags = [
    { id: "important", name: "Важное" },
    { id: "work", name: "В работу" },
    { id: "review", name: "Проверить" },
    { id: "reference", name: "Справочное" },
    { id: "archive", name: "Архив" },
  ],
  views = [],
  requests = [];
const task = {
  _id: taskId,
  description: "Задача с файлом",
  workspaceId: "fixture",
  creatorId: "owner:fixture",
  creatorName: "Эрнест",
  assigneeIds: ["owner:fixture"],
  assignees: [{ actorId: "owner:fixture", name: "Эрнест" }],
  timing: "none",
  status: "open",
  attachments: [{ fileId: files[1].fileId, name: files[1].name }],
  version: 0,
  createdAt: new Date().toISOString(),
};
const messages = [
  {
    _id: messageId,
    text: "Исходное сообщение",
    authorId: "owner:fixture",
    authorName: "Эрнест",
    createdAt: new Date().toISOString(),
    attachments: [
      { fileId: files[0].fileId, name: files[0].name, mimeType: "text/plain" },
    ],
  },
];
const snapshot = () => ({
  messages,
  tasks: [task],
  members: [],
  people: [{ _id: "owner:fixture", name: "Эрнест" }],
  hasMore: false,
});
chat.state = snapshot();
chat.historyReady = true;
chat.open = true;
chat.openFiles();
teamApi.defaults.adapter = async (config) => {
  requests.push({
    url: config.url,
    method: config.method,
    params: config.params,
  });
  const url = config.url,
    method = config.method;
  if (url === "/files/library") {
    const q = config.params || {};
    let filtered = files.filter(
      (file) =>
        (!q.q ||
          (file.name + " " + file.description)
            .toLowerCase()
            .includes(q.q.toLowerCase())) &&
        (!q.type || file.type === q.type) &&
        (!q.projectId ||
          (q.projectId === "__none__"
            ? !file.projects.length
            : file.projects.some((project) => project._id === q.projectId))) &&
        (!q.tag || file.tags.includes(q.tag)),
    );
    if (q.sort === "name")
      filtered.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    if (q.sort === "oldest") filtered.reverse();
    if (q.sort === "size") filtered.sort((a, b) => b.size - a.size);
    const offset = Number(q.offset || 0),
      limit = Number(q.limit || 80);
    return {
      status: 200,
      data: structuredClone({
        files: filtered.slice(offset, offset + limit),
        total: filtered.length,
        allTotal: files.length,
        nextOffset: offset + limit < filtered.length ? offset + limit : null,
        facets: {
          projects: [project],
          people: [files[0].uploadedBy],
          viewers: [],
          tags,
        },
      }),
    };
  }
  if (url.startsWith("/files/library/")) {
    const file = files.find((file) => file.fileId === url.split("/")[3]);
    if (url.endsWith("/view")) {
      views.push(file.fileId);
      file.viewedBy = [
        {
          actorId: "owner:fixture",
          name: "Эрнест",
          lastViewedAt: new Date().toISOString(),
        },
      ];
      return { status: 200, data: { ok: true } };
    }
    if (method === "patch") {
      const body = JSON.parse(config.data);
      if (body.expectedVersion !== file.version)
        throw Error("Version conflict");
      Object.assign(file, body);
      file.version++;
      return {
        status: 200,
        data: structuredClone({
          fileId: file.fileId,
          tags: file.tags,
          description: file.description,
          version: file.version,
        }),
      };
    }
    return { status: 200, data: { file: structuredClone(file) } };
  }
  if (url.startsWith("/files/"))
    return {
      status: 200,
      data: new Blob(["Содержимое тестового документа"], {
        type: "text/plain",
      }),
    };
  if (url === "/state") return { status: 200, data: snapshot() };
  if (url === "/task-options")
    return { status: 200, data: { projects: [project], parties: [] } };
  if (url.startsWith("/tasks/")) return { status: 200, data: { task } };
  if (url === "/messages")
    return {
      status: 200,
      data: {
        messages: config.params?.taskId
          ? [{ ...messages[0], _id: taskId, taskId }]
          : messages,
        hasMore: false,
      },
    };
  return { status: 200, data: {} };
};
createApp({
  render: () => [
    h(
      Frame,
      { open: chat.open, mobile, side: "left", headingOwnsClose: false },
      { heading: () => h(Header), default: () => h(Pane, { mobile }) },
    ),
    chat.fileLibraryOpen ? h(Library) : null,
  ],
})
  .use(pinia)
  .mount("#app");
window.fileFixture = {
  chat,
  files,
  views,
  requests,
  taskId,
  messageId,
  project,
};
