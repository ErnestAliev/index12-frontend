import "./team-chat-search.js";
import { teamApi } from "/src/stores/teamChatStore.js";
const chat = window.searchChat,
  base = teamApi.defaults.adapter;
const defaults = () => ({ chat: true, system: false, onec: false });
const member = {
  _id: "88888888-8888-4888-8888-888888888888",
  name: "Сотрудник",
  role: "employee",
  status: "active",
  version: 0,
};
const other = {
  ...member,
  _id: "99999999-9999-4999-8999-999999999999",
  name: "Другой сотрудник",
};
chat.me = {
  ...chat.me,
  owner: true,
  roles: {
    employee: "Сотрудник",
    manager: "Управляющий",
    director: "Руководитель компании",
  },
  roleAccess: {
    employee: defaults(),
    manager: defaults(),
    director: defaults(),
  },
};
chat.state.members = [member, other];
chat.tab = "members";
window.accessWrites = [];
teamApi.defaults.adapter = async (config) => {
  if (config.method === "patch") {
    const body = JSON.parse(config.data);
    window.accessWrites.push({ path: config.url, body });
    if (window.accessHold)
      await new Promise((resolve) => {
        window.releaseAccess = resolve;
      });
    if (window.accessReject)
      throw Object.assign(Error("offline"), {
        response: {
          status: 503,
          data: { message: "Не удалось сохранить доступ" },
        },
      });
    if (config.url === "/settings") {
      chat.me.roleAccess = body.roleAccess;
      return { status: 200, data: { identity: { ...chat.me } } };
    }
    Object.assign(member, body, { version: member.version + 1 });
    if (body.access === null) delete member.access;
    return { status: 200, data: { member: { ...member } } };
  }
  const result = await base(config);
  if (config.url === "/state") result.data.members = [member, other];
  return result;
};
