import "./team-chat-search.js";
import { teamApi } from "/src/stores/teamChatStore.js";
const chat = window.searchChat,
  base = teamApi.defaults.adapter;
const id = (n) => String(n).padStart(24, "0");
const data = {
  accounts: [
    { _id: id(1), name: "Касса сотрудника", companyId: id(2) },
    { _id: id(5), name: "Счёт получателя", companyId: id(2) },
  ],
  companies: [{ _id: id(2), name: "Компания" }],
  individuals: [],
  contractors: [{ _id: id(3), name: "Поставщик" }],
  projects: [{ _id: id(4), name: "Пушкина" }],
  categories: [{ _id: id(6), name: "Услуги" }],
  subcategories: [],
};
chat.me = {
  ...chat.me,
  owner: false,
  accountIds: data.accounts.map((row) => row._id),
  permissions: { access: { chat: true, system: false, onec: false } },
};
window.financeWrites = [];
window.financeRows = [];
window.financeFixture = {
  oneAccount() {
    data.accounts.splice(1);
    chat.me.accountIds = data.accounts.map((row) => row._id);
  },
  owner() {
    chat.me = { ...chat.me, owner: true, actorId: "owner:fixture" };
  },
};
teamApi.defaults.adapter = async (config) => {
  if (config.url === "/finance/options")
    return { status: 200, data: structuredClone(data) };
  if (config.url === "/finance/operations") {
    const body = JSON.parse(config.data);
    window.financeWrites.push(body);
    if (window.financeFail)
      throw Object.assign(Error("denied"), {
        response: {
          status: 403,
          data: { message: "Счёт недоступен. Обновите форму" },
        },
      });
    const accounts = [body.accountId || body.fromAccountId, body.toAccountId]
      .filter(Boolean)
      .map((id) => data.accounts.find((row) => row._id === id).name);
    const message = {
      _id: crypto.randomUUID(),
      authorId: chat.me.actorId,
      authorName: "Эрнест",
      attachments: [],
      text: body.type,
      kind: "finance_operation",
      createdAt: new Date().toISOString(),
      version: 0,
      financeOperation: {
        type: body.type,
        amount: body.amount,
        date: body.date,
        accounts,
        partyName: "Поставщик",
        description: body.description,
        comment: body.comment,
        projectNames: [],
      },
      ...(body.type === "expense"
        ? {
            approvalRequest: {
              state: "pending",
              recipients: [
                {
                  actorId: "owner:fixture",
                  name: "Владелец",
                  state: "pending",
                },
              ],
            },
          }
        : {}),
    };
    window.financeRows.push(message);
    return { status: 201, data: { message } };
  }
  if (config.url.endsWith("/decision")) {
    const body = JSON.parse(config.data),
      message = window.financeRows.find(
        (row) => row._id === config.url.split("/")[2],
      );
    message.approvalRequest.state =
      body.action === "approve" ? "approved" : "rejected";
    message.approvalRequest.recipients[0].state = message.approvalRequest.state;
    message.version++;
    return { status: 200, data: { message: structuredClone(message) } };
  }
  const response = await base(config);
  if (config.url === "/state" || config.url === "/messages")
    response.data.messages.push(...structuredClone(window.financeRows));
  return response;
};
