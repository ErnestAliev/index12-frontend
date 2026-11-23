import "/src/assets/main.css";
import { createApp, h, reactive } from "vue";
import { createPinia } from "pinia";
import axios from "axios";
import { useMainStore } from "/src/stores/mainStore.js";
import { useTeamChatStore, teamApi } from "/src/stores/teamChatStore.js";
import HourCell from "/src/components/HourCell.vue";
import Pane from "/src/components/TeamChatPane.vue";
import Frame from "/src/components/ChatWindowFrame.vue";
const id = (n) => String(n).padStart(24, "0");
const pinia = createPinia(),
  main = useMainStore(pinia),
  chat = useTeamChatStore(pinia);
const user = {
  _id: id(90),
  id: id(90),
  currentWorkspaceId: id(99),
  role: "admin",
  workspaceRole: "admin",
  createdAt: "2026-01-01",
};
const data = {
  accounts: [
    { _id: id(1), name: "BCC UU", companyId: id(2), initialBalance: 1000000 },
    { _id: id(8), name: "Касса", companyId: id(2), initialBalance: 1000000 },
  ],
  companies: [{ _id: id(2), name: "ТОО UU" }],
  individuals: [{ _id: id(9), name: "Шерхан" }],
  contractors: [
    { _id: id(3), name: "Поставщик" },
    { _id: id(7), name: "Новый поставщик" },
  ],
  projects: [{ _id: id(4), name: "Пушкина 33" }],
  categories: [{ _id: id(5), name: "Услуги" }],
  subcategories: [{ _id: id(11), name: "Монтаж", parentCategoryId: id(5) }],
};
Object.assign(main, data, { user });
const operation = reactive({
  _id: id(10),
  type: "expense",
  amount: -130000,
  date: "2026-11-18T12:00:00Z",
  dateKey: "2026-322",
  cellIndex: 3,
  accountId: id(1),
  companyId: id(2),
  contractorId: id(3),
  projectId: id(4),
  categoryId: id(5),
  description: "Проверить поступление",
  createdBy: user.id,
  syncVersion: 0,
});
chat.me = {
  actorId: "owner:" + user.id,
  workspaceId: user.currentWorkspaceId,
  owner: true,
  status: "active",
  displayName: "Эрнест",
  roles: {},
};
const task = {
  _id: "22222222-2222-4222-8222-222222222222",
  description: "Проверка платежа",
  version: 0,
  creatorId: chat.me.actorId,
  creatorName: "Эрнест",
  assigneeIds: [chat.me.actorId],
  assignees: [{ actorId: chat.me.actorId, name: "Эрнест" }],
  status: "open",
  timing: "none",
  attachments: [],
};
const messages = [];
chat.state = {
  messages: [],
  tasks: [task],
  members: [],
  people: [],
  hasMore: false,
};
chat.historyReady = true;
chat.threads[task._id] = { messages: [], ready: true, hasMore: false };
window.operationShares = [];
window.operationWrites = [];
window.timelineMoves = [];
function snapshot() {
  return {
    operationId: operation._id,
    title:
      operation.type === "income"
        ? "Доход"
        : operation.type === "transfer"
          ? "Перевод"
          : "Расход",
    type: operation.type,
    rows: [
      {
        label: "Сумма",
        value: new Intl.NumberFormat("ru-RU").format(operation.amount) + " ₸",
      },
      { label: "Счёт", value: "BCC UU" },
      { label: "Владелец счёта", value: "ТОО UU" },
      {
        label: "Кому",
        value:
          operation.contractorId === id(7) ? "Новый поставщик" : "Поставщик",
      },
      { label: "Проект", value: "Пушкина 33" },
      { label: "Дата", value: operation.date.slice(0, 10) },
    ],
  };
}
function financeRows() {
  const rows = [];
  const add = (label, value) => rows.push({ label, value: value || '' });
  const name = (kind, value) => data[kind].find(row => row._id === value)?.name || '';
  if (operation.type === 'transfer') {
    add('Счёт списания', name('accounts', operation.fromAccountId));
    add('Владелец счёта списания', name('companies', operation.fromCompanyId));
    add('Счёт зачисления', operation.isWithdrawal ? operation.withdrawalRecipient : name('accounts', operation.toAccountId));
    add('Владелец счёта зачисления', name('individuals', operation.toIndividualId));
  } else {
    add('Счёт', name('accounts', operation.accountId));
    add('Владелец счёта', name('companies', operation.companyId));
    add(operation.type === 'income' ? 'От кого' : 'Кому', name('contractors', operation.contractorId));
  }
  add('Проект', name('projects', operation.projectId) || 'Без проекта');
  add('Категория', name('categories', operation.categoryId));
  add('Подкатегория', name('subcategories', operation.subcategoryId));
  add('Описание', operation.description);
  add('Комментарий', operation.comment);
  add('Дата', operation.date.slice(0, 10).split('-').reverse().join('.'));
  return rows;
}
async function adapter(config) {
  const path = new URL(config.url, "http://fixture.invalid").pathname.replace(
    /^\/api(?:\/team-chat)?/,
    "",
  );
  if (path === "/finance/shares") {
    const body = JSON.parse(config.data);
    window.operationShares.push(body);
    if (window.failShare)
      throw Object.assign(Error("offline"), {
        response: { status: 503, data: { message: "Нет связи" } },
      });
    const message = {
      _id: body.id,
      kind: "operation_share",
      operationShare: { ...snapshot(), mode: body.mode },
      text: "Поля операции",
      authorId: chat.me.actorId,
      authorName: "Эрнест",
      attachments: [],
      version: 0,
      createdAt: new Date().toISOString(),
      ...(body.taskId ? { taskId: body.taskId } : {}),
    };
    messages.push(message);
    return { status: 201, data: { message } };
  }
  if (/\/finance\/messages\/.+\/operation$/.test(path)) {
    if (window.deletedOperation)
      throw Object.assign(Error("deleted"), {
        response: {
          status: 404,
          data: { message: "Операция удалена или недоступна" },
        },
      });
    return {
      status: 200,
      data: {
        operation: JSON.parse(JSON.stringify(operation)),
        options: data,
        snapshot: snapshot(),
        canEdit: chat.me.owner,
        audit: messages.find(row => row.kind === 'finance_operation')?.financeOperation.audit || null,
      },
    };
  }
  if (path === "/events/" + operation._id && config.method === "put") {
    const body = JSON.parse(config.data);
    window.operationWrites.push({ id: operation._id, body });
    if (window.failEdit)
      throw Object.assign(Error("offline"), {
        response: { status: 503, data: { message: "Не удалось сохранить" } },
      });
    Object.assign(operation, body, { syncVersion: operation.syncVersion + 1 });
    for (const message of messages.filter(row => row.kind === 'finance_operation')) {
      Object.assign(message.financeOperation, {
        rows: financeRows(),
        amount: operation.amount, date: operation.date.slice(0, 10), description: operation.description,
        comment: operation.comment,
        audit: { ...message.financeOperation.audit, editedAt: '2026-11-23T10:15:30.000Z', editedByName: 'Эрнест' },
      });
      message.version++;
    }
    return { status: 200, data: JSON.parse(JSON.stringify(operation)) };
  }
  if (/^\/messages\/[^/]+$/.test(path) && config.method === 'get')
    return { status: 200, data: { message: JSON.parse(JSON.stringify(messages.find(row => row._id === path.split('/').pop()))) } };
  if (path === "/snapshot")
    return {
      status: 200,
      data: {
        timestamp: new Date().toISOString(),
        accountBalances: {},
        companyBalances: {},
        individualBalances: {},
        contractorBalances: {},
        projectBalances: {},
        categoryTotals: {},
      },
    };
  if (path === "/state")
    return {
      status: 200,
      data: { ...chat.state, messages: messages.filter((row) => !row.taskId) },
    };
  if (path === "/messages")
    return {
      status: 200,
      data: {
        messages: messages.filter(
          (row) => (row.taskId || null) === (config.params?.taskId || null),
        ),
        hasMore: false,
      },
    };
  if (
    path === "/read" ||
    path.endsWith("/read") ||
    path.endsWith("/typing") ||
    path.endsWith("/viewed")
  )
    return { status: 200, data: {} };
  if (path === "/task-options")
    return { status: 200, data: { projects: data.projects, parties: [] } };
  if (path.startsWith("/events"))
    return { status: 200, data: [JSON.parse(JSON.stringify(operation))] };
  const name = path.slice(1);
  if (data[name]) return { status: 200, data: data[name] };
  if (path === "/deals/all") return { status: 200, data: [] };
  return { status: 200, data: {} };
}
teamApi.defaults.adapter = adapter;
axios.defaults.adapter = adapter;
window.shareFixture = {
  main,
  chat,
  operation,
  task,
  user,
  financeCard(type, inTask = false, withdrawal = false) {
    this.mode(type);
    Object.assign(main.accounts.find(row => row._id === id(8)), { name: 'Kaspi Gold Шерхан', companyId: null, individualId: id(9) });
    Object.assign(operation, { subcategoryId: id(11), comment: 'По договору № 12\nВторая часть оплаты',
      ...(type === 'transfer' ? { toCompanyId: null, toIndividualId: id(9) } : {}),
      ...(withdrawal ? { isWithdrawal: true, transferPurpose: 'withdrawal', toAccountId: null, toIndividualId: null, withdrawalRecipient: 'Давид' } : {}),
    });
    const message = {
      _id: crypto.randomUUID(), kind: 'finance_operation', text: type, authorId: 'staff', authorName: 'Давид',
      attachments: [], version: 0, createdAt: '2026-11-18T07:00:00.000Z',
      ...(inTask ? { taskId: task._id } : {}),
      financeOperation: {
        operationId: operation._id, type, amount: operation.amount, date: operation.date.slice(0, 10),
        rows: financeRows(), isWithdrawal: withdrawal,
        accounts: type === 'transfer' ? ['BCC UU', 'Касса'] : ['BCC UU'],
        description: operation.description, comment: '', projectNames: ['Пушкина 33'],
        audit: { createdAt: '2026-11-18T07:00:00.000Z', createdByName: 'Давид', editedAt: null },
      },
    };
    messages.push(message);
    chat.mergeMessage(message);
    if (inTask) this.thread();
    return message._id;
  },
  clearFinance() {
    messages.splice(0);
    chat.state.messages = [];
    chat.threads[task._id] = { messages: [], ready: true, hasMore: false };
    chat.requestedTaskId = null;
  },
  mode(type) {
    Object.assign(operation, {
      type,
      isTransfer: type === "transfer",
      isWithdrawal: false,
      amount: type === "expense" ? -130000 : 130000,
      ...(type === "transfer"
        ? {
            fromAccountId: id(1),
            toAccountId: id(8),
            fromCompanyId: id(2),
            toCompanyId: id(2),
            transferPurpose: "internal",
          }
        : {}),
    });
  },
  thread() {
    chat.requestedTaskId = task._id;
  },
  staff() {
    main.user = null;
    chat.me = { ...chat.me, actorId: "staff", owner: false };
  },
};
createApp({
  render: () => [
    h(
      "div",
      {
        id: "timeline-source",
        style: "position:absolute;left:20px;top:100px;width:260px;z-index:10",
      },
      [
        h(HourCell, {
          operation,
          dateKey: operation.dateKey,
          cellIndex: operation.cellIndex,
          columnCount: 11,
          onDropOperation: (value) => window.timelineMoves.push(value),
        }),
      ],
    ),
    h(
      Frame,
      {
        open: true,
        side: "right",
        title: "Рабочий чат",
        windowId: "share-chat",
        storageKey: "share-test",
      },
      () => h(Pane),
    ),
  ],
})
  .use(pinia)
  .mount("#app");
