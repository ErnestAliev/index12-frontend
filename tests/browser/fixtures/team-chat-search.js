import "/src/assets/main.css";
import { createApp, h, ref } from "vue";
import { createPinia } from "pinia";
import { useTeamChatStore, teamApi } from "/src/stores/teamChatStore.js";
import { useTeamChatSearchStore } from "/src/stores/teamChatSearchStore.js";
import Frame from "/src/components/ChatWindowFrame.vue";
import Header from "/src/components/TeamChatHeader.vue";
import Pane from "/src/components/TeamChatPane.vue";
import TextFieldLinks from '/src/components/TextFieldLinks.vue';
const taskId = "22222222-2222-4222-8222-222222222222";
const rows = Array.from({ length: 95 }, (_, i) => ({
  _id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  text: i === 2 || i === 90 ? `Договор ${i}` : `Сообщение ${i}`,
  authorId: "actor",
  authorName: "Эрнест",
  attachments: [],
  createdAt: new Date(Date.now() - (100 - i) * 60000).toISOString(),
  readCount: i % 2,
  reactions: (i === 93 ? ["❤️"] : i === 92 ? ["👍", "❤️", "😂", "😮", "😢", "🙏"] : []).map((emoji) => ({ emoji, count: 1, mine: emoji === "❤️" })),
}));
rows.push({
  _id: "33333333-3333-4333-8333-333333333333",
  taskId,
  text: "Договор в задаче",
  authorId: "actor",
  authorName: "Эрнест",
  attachments: [],
  createdAt: new Date().toISOString(),
  readCount: 1,
});
let deleted = new Set();
window.searchRequests = [];
window.reactionRequests = [];
window.readRequests = [];
const shown = ref(true);
window.fixtureOpen = shown;
window.failDelete = false;
const snapshot = () => ({
  messages: rows.filter((m) => !m.taskId && !deleted.has(m._id)).slice(-50),
  tasks: [task],
  people: [{ _id: "actor", name: "Эрнест" }],
  members: [],
  hasMore: true,
  checkedAt: new Date().toISOString(),
});
const task = {
  _id: taskId,
  description: "Забрать договор",
  creatorId: "actor",
  creatorName: "Эрнест",
  assigneeIds: ["actor"],
  assignees: [{ actorId: "actor", name: "Эрнест" }],
  attachments: [],
  timing: "none",
  status: "open",
  unreadCount: 0,
};
const coverTask = { ...task, _id: '44444444-4444-4444-8444-444444444444', description: 'Снять показания счётчиков', createdAt: new Date().toISOString() };
const cover = { _id: coverTask._id, kind: 'task', taskId: coverTask._id, text: '', attachments: [], authorId: 'actor', authorName: 'Эрнест', createdAt: coverTask.createdAt };
teamApi.defaults.adapter = async (config) => {
  if (config.url.endsWith("/reaction")) {
    window.reactionRequests.push(JSON.parse(config.data));
    return { status: 200, data: {} };
  }
  if (config.url === "/messages/read") {
    window.readRequests.push(JSON.parse(config.data));
    return { status: 200, data: { read: 1 } };
  }

  if (config.method === "delete") {
    await new Promise((resolve, reject) => {
      window.releaseDelete = resolve;
      window.rejectDelete = () => reject(Error("offline"));
    });
    if (window.failDelete) throw Error("offline");
    deleted.add(config.url.split("/").at(-1));
    return {
      status: 200,
      data: { deletedMessageId: config.url.split("/").at(-1) },
    };
  }
  if (config.url === "/search") {
    window.searchRequests.push(config.params);
    await new Promise((r) =>
      setTimeout(r, config.params.q === "Дог" ? 650 : 60),
    );
    const matches = [...rows, cover].filter(
      (m) =>
        !deleted.has(m._id) &&
        (m.kind === 'task' ? coverTask.description : m.text)
          .toLocaleLowerCase()
          .includes(config.params.q.toLocaleLowerCase()),
    );
    const index = Math.min(
        config.params.index ?? matches.length - 1,
        matches.length - 1,
      ),
      target = matches[index];
    return {
      status: 200,
      data: target
        ? {
            total: matches.length,
            index,
            messageId: target._id,
            taskId: target.kind === 'task' ? null : target.taskId || null,
            task: target.kind === 'task' ? coverTask : target.taskId ? task : null,
            messages: target.kind === 'task' ? [cover] : rows
              .filter(
                (m) =>
                  (m.taskId || null) === (target.taskId || null) &&
                  !deleted.has(m._id),
              )
              .filter(
                (m) => Math.abs(rows.indexOf(m) - rows.indexOf(target)) < 6,
              ),
          }
        : { total: 0, index: -1, messages: [] },
    };
  }
  if (config.url === "/state") return { status: 200, data: snapshot() };
  if (config.url === "/messages")
    return {
      status: 200,
      data: {
        messages: rows.filter(
          (m) => m.taskId === config.params?.taskId && !deleted.has(m._id),
        ),
        hasMore: false,
      },
    };
  if (config.url.startsWith("/push"))
    return { status: 200, data: { enabled: false } };
  return { status: 200, data: {} };
};
const pinia = createPinia();
let chat, search;
const app = createApp({
  render: () => [
    h(
      Frame,
      {
        open: shown.value,
        mobile: true,
        headingOwnsClose: true,
        hideHeading: !!chat.requestedTaskId || chat.creatingTask,
      },
      { heading: () => h(Header), default: () => h(Pane, { mobile: true }) },
    ), h(TextFieldLinks)],
});
app.use(pinia);
chat = useTeamChatStore(pinia);
search = useTeamChatSearchStore(pinia);
chat.me = {
  actorId: "actor",
  workspaceId: "workspace",
  owner: true,
  status: "active",
  displayName: "Эрнест",
  roles: {},
};
chat.state = snapshot();
chat.historyReady = true;
window.searchChat = chat;
window.chatSearch = search;
window.staleSnapshot = () =>
  (chat.state = {
    ...snapshot(),
    messages: rows.filter((m) => !m.taskId).slice(-50),
  });
app.mount("#app");
