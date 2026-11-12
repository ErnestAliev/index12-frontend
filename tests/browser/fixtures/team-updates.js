import "./team-chat-search.js";
import { teamApi } from "/src/stores/teamChatStore.js";
import { useAppUpdateStore } from "/src/stores/appUpdateStore.js";
import {
  rememberTeamDestination,
  openTeamDestination,
} from "/src/utils/teamDestination.js";
const chat = window.searchChat,
  base = teamApi.defaults.adapter;
const task = JSON.parse(JSON.stringify(chat.state.tasks[0]));
chat.me = {
  ...chat.me,
  workspaceId: "a".repeat(24),
  owner: !window.fixtureEmployee,
  role: window.fixtureEmployee ? "employee" : "manager",
};
window.taskDetailReads = 0;
teamApi.defaults.adapter = async (config) => {
  if (config.url === "/tasks/" + task._id) {
    window.taskDetailReads++;
    if (window.taskDenied)
      throw Object.assign(Error("not found"), { response: { status: 404 } });
    if (window.taskOffline) throw Error("offline");
    return { status: 200, data: { task } };
  }
  const result = await base(config);
  if (config.url === "/state" && window.omitSelectedTask)
    result.data.tasks = result.data.tasks.filter((row) => row._id !== task._id);
  return result;
};
const updates = useAppUpdateStore();
updates.start();
window.appUpdates = updates;
window.updateFixture = {
  taskId: task._id,
  openTask() {
    chat.requestedTaskId = task._id;
  },
  applyOldNotification() {
    const url = new URL(location.href);
    url.search = "";
    if (!url.pathname.startsWith("/team/")) {
      url.pathname = "/";
      url.searchParams.set("teamChat", chat.me.workspaceId);
    }
    url.searchParams.set("message", "99999999-9999-4999-8999-999999999999");
    rememberTeamDestination(url.href, "old-click");
    openTeamDestination(chat, location.pathname);
  },
  pollDestination() {
    openTeamDestination(chat, location.pathname);
  },
  openRelease(version) {
    const url = new URL(location.href);
    url.search = "";
    if (!url.pathname.startsWith("/team/")) {
      url.pathname = "/";
      url.searchParams.set("teamChat", chat.me.workspaceId);
    }
    url.searchParams.set("release", version);
    rememberTeamDestination(url.href, "release-click");
    openTeamDestination(chat, location.pathname);
  },
};
const requested = new URLSearchParams(location.search).get("task");
if (requested) chat.requestedTaskId = requested;
