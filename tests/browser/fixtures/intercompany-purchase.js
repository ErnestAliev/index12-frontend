import "/src/assets/main.css";
import { createApp, h, ref } from "vue";
import { createPinia } from "pinia";
import axios from "axios";
import { useMainStore } from "/src/stores/mainStore.js";
import Expense from "/src/components/ExpensePopup.vue";
import Income from "/src/components/IncomePopup.vue";
import Day from "/src/components/DayColumn.vue";
const pinia = createPinia(),
  store = useMainStore(pinia),
  show = ref("expense"),
  editing = ref(null),
  error = ref("");
const id = (n) => String(n).padStart(24, "0"),
  dates = [new Date(2026, 10, 10, 12), new Date(2026, 10, 11, 12)],
  keys = ["2026-314", "2026-315"];
const companies = [
    { _id: id(1), name: "TOO UUU" },
    { _id: id(2), name: "TOO YYY" },
  ],
  individuals = [{ _id: id(3), name: "Тестовое физлицо" }];
const accounts = [
  {
    _id: id(11),
    name: "UUU основной",
    companyId: id(1),
    initialBalance: 10000,
  },
  { _id: id(12), name: "YYY основной", companyId: id(2), initialBalance: 0 },
  { _id: id(13), name: "YYY второй", companyId: id(2), initialBalance: 0 },
  { _id: id(14), name: "Личный", individualId: id(3), initialBalance: 0 },
];
const categories = [{ _id: id(21), name: "Услуги", type: "expense" }],
  projects = [{ _id: id(31), name: "Проект из системы" }];
Object.assign(store, {
  user: {
    _id: "fixture-owner",
    id: "fixture-owner",
    role: "admin",
    workspaceRole: "admin",
    createdAt: "2026-01-01",
  },
  accounts,
  companies,
  individuals,
  categories,
  projects,
  contractors: [{ _id: id(41), name: "Внешний поставщик" }],
});
let serverRows = [],
  pending = null;
const requests = [];
function receipt(date = dates[0], base = 0, amount = 1234.56) {
  return ["expense", "income"].map((type, i) => ({
    _id: id(51 + i),
    type,
    amount: i ? amount : -amount,
    purchaseGroupId: "fixture-purchase",
    purchasePeerId: id(52 - i),
    date: new Date(date).toISOString(),
    dateKey: new Date(date).getDate() === 10 ? keys[0] : keys[1],
    cellIndex: base + i,
    accountId: accounts[i]._id,
    companyId: companies[i]._id,
    counterpartyCompanyId: companies[1 - i]._id,
    fromAccountId: accounts[0]._id,
    toAccountId: accounts[1]._id,
    fromCompanyId: companies[0]._id,
    toCompanyId: companies[1]._id,
    categoryId: categories[0]._id,
    projectId: projects[0]._id,
    projectScope: "selected",
    syncVersion: 1,
    createdBy: "fixture-owner",
    createdByRole: "admin",
    description: "Услуга",
    comment: "Комментарий",
  }));
}
axios.defaults.adapter = async (config) => {
  const url = new URL(config.url, "http://fixture.invalid"),
    path = url.pathname.split("/api").at(-1),
    data =
      typeof config.data === "string" ? JSON.parse(config.data) : config.data;
  requests.push({ path, method: config.method, data });
  if (path === "/events" && config.method === "get")
    return {
      status: 200,
      data: serverRows.filter(
        (row) => row.dateKey === url.searchParams.get("dateKey"),
      ),
    };
  if (path === "/intercompany-purchases" && config.method === "post") {
    serverRows = receipt();
    return {
      status: 201,
      data: { ...serverRows[0], linkedOperations: serverRows },
    };
  }
  if (path.startsWith("/events/") && ["put", "delete"].includes(config.method))
    return new Promise(
      (resolve, reject) =>
        (pending = { resolve, reject, path, data, method: config.method }),
    );
  if (path === "/snapshot") {
    const accountBalances = {},
      companyBalances = {};
    for (const row of serverRows) {
      accountBalances[row.accountId] =
        (accountBalances[row.accountId] || 0) + row.amount;
      companyBalances[row.companyId] =
        (companyBalances[row.companyId] || 0) + row.amount;
    }
    return {
      status: 200,
      data: {
        timestamp: new Date().toISOString(),
        accountBalances,
        companyBalances,
        individualBalances: {},
        contractorBalances: {},
        projectBalances: {},
        categoryTotals: {},
      },
    };
  }
  const lists = {
    accounts,
    companies,
    individuals,
    categories,
    projects,
    contractors: store.contractors,
  };
  return { status: 200, data: lists[path.slice(1)] || [] };
};
async function save(payload) {
  error.value = "";
  try {
    if (payload.mode === "edit")
      await store.updateOperation(payload.id, payload.data);
    else await store.createEvent(payload.data);
    show.value = "";
  } catch (e) {
    error.value = e.message;
  }
}
function start(promise) {
  void promise.catch((e) => (error.value = e.message));
}
window.purchaseTest = {
  store,
  requests,
  keys,
  dates,
  get pending() {
    return !!pending;
  },
  get error() {
    return error.value;
  },
  openIncome(key = keys[0]) {
    editing.value = store
      .getOperationsForDay(key)
      .find((op) => op.type === "income");
    show.value = "income";
  },
  reject() {
    const old = pending;
    pending = null;
    old.reject(Error("Имитированная ошибка"));
  },
  release(date = dates[1], base = 5, amount = 1234.56) {
    const old = pending;
    pending = null;
    if (old.method === "delete") {
      serverRows = [];
      old.resolve({
        status: 200,
        data: { deletedOperationIds: [id(51), id(52)] },
      });
      return;
    }
    serverRows = receipt(date, base, amount).map((row) => ({
      ...row,
      syncVersion: 3,
    }));
    old.resolve({
      status: 200,
      data: {
        ...serverRows.find((row) => old.path.endsWith(row._id)),
        linkedOperations: serverRows,
      },
    });
  },
  moveIncome() {
    const op = store
      .getOperationsForDay(keys[0])
      .find((op) => op.type === "income");
    start(store.moveOperation(op, keys[0], keys[1], 6, dates[1]));
  },
  editIncome() {
    const op = store
      .getOperationsForDay(keys[0])
      .find((op) => op.type === "income");
    start(store.updateOperation(op._id, { amount: 2000 }));
  },
  deleteIncome() {
    const op = store
      .getOperationsForDay(keys[1])
      .find((op) => op.type === "income");
    start(store.deleteOperation(op));
  },
};
await store.fetchSnapshot();
createApp({
  render: () =>
    h("main", { style: "height:100vh;overflow:auto;padding:12px" }, [
      h(
        "div",
        { style: "display:flex;min-width:600px;height:650px" },
        dates.map((date, i) =>
          h(Day, {
            date,
            dateKey: keys[i],
            columnCount: 2,
            onDropOperation: (event) =>
              start(
                store.moveOperation(
                  event.operation,
                  event.operation.dateKey,
                  event.toDateKey,
                  event.toCellIndex,
                  event.targetDate,
                ),
              ),
          }),
        ),
      ),
      show.value
        ? h(show.value === "income" ? Income : Expense, {
            date: editing.value?.date ? new Date(editing.value.date) : dates[0],
            cellIndex: editing.value?.cellIndex || 0,
            operationToEdit: editing.value,
            onClose: () => (show.value = ""),
            onSave: save,
            onOperationDeleted: (op) => start(store.deleteOperation(op)),
          })
        : null,
      h("output", error.value),
    ]),
})
  .use(pinia)
  .mount("#app");
