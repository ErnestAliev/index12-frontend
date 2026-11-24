<script setup>
import {
  computed,
  onMounted,
  onBeforeUnmount,
  provide,
  reactive,
  ref,
} from "vue";
import { useMainStore } from "@/stores/mainStore";
import { isSystemWithdrawal } from "@/utils/transferLabels";
import { operationStoreKey } from "@/composables/useOperationStore";
import { useInputModality } from "@/composables/useInputModality";
import { teamApi, teamError, useTeamChatStore } from "@/stores/teamChatStore";
import { getAccountOwnerKey } from "@/utils/accountOwnership";
import IncomePopup from "./IncomePopup.vue";
import ExpensePopup from "./ExpensePopup.vue";
import TransferPopup from "./TransferPopup.vue";
import TeamOperationShare from "./TeamOperationShare.vue";
import { operationHistoryKey } from '@/composables/operationHistoryContext';
import UiIcon from "./UiIcon.vue";
const props = defineProps({
  type: String,
  messageId: String,
  taskId: String,
});
const emit = defineEmits(["close"]);
const chat = useTeamChatStore(),
  keyboard = useInputModality();
const main = useMainStore();
const ownerEditor = !!props.messageId && chat.me?.owner === true;
const workspaceId = String(chat.me?.workspaceId || "");
const actorId = chat.me?.actorId;
provide(operationHistoryKey, { messageId: props.messageId });
const operation = ref(null),
  operationSnapshot = ref(null);
const operationType = computed(() =>
  operation.value
    ? operation.value.isTransfer
      ? "transfer"
      : operation.value.type
    : props.type,
);
const dialog = ref(null),
  ready = ref(false),
  error = ref(""),
  busy = ref(false);
const requestId = crypto.randomUUID(),
  date = new Date();
const viewport = ref({});
function resize() {
  const v = window.visualViewport;
  viewport.value = {
    "--finance-top": `${v?.offsetTop || 0}px`,
    "--finance-left": `${v?.offsetLeft || 0}px`,
    "--finance-width": `${v?.width || innerWidth}px`,
    "--finance-height": `${v?.height || innerHeight}px`,
    "--finance-bottom":
      innerHeight - (v?.height || innerHeight) > 120
        ? "12px"
        : "var(--safe-bottom-controls, 12px)",
  };
}
const component = computed(
  () =>
    ({ income: IncomePopup, expense: ExpensePopup, transfer: TransferPopup })[
      operationType.value
    ],
);
const store = reactive({
  chatFinance: true,
  workspaceRole: "manager",
  canEdit: true,
  canDelete: false,
  accounts: [],
  companies: [],
  individuals: [],
  contractors: [],
  projects: [],
  categories: [],
  subcategories: [],
  allOperationsFlat: [],
  currentCreditBalances: [],
  getPrepaymentCategoryIds: [],
  get currentAccountBalances() {
    return this.accounts;
  },
  get currentCompanyBalances() {
    return this.companies;
  },
  get currentIndividualBalances() {
    const ids = new Set(this.accounts.map((a) => String(a.individualId || "")));
    return this.individuals.filter((row) => ids.has(String(row._id)));
  },
  validateTransaction: () => ({ isValid: true }),
  _isEffectivelyPastOrToday: (day) =>
    new Date(day).setHours(0, 0, 0, 0) <= new Date().setHours(0, 0, 0, 0),
  async saveAccountOwners(links) {
    for (const link of links) {
      const account = store.accounts.find((row) => row._id === link.accountId);
      if (
        !account ||
        getAccountOwnerKey(account, store.companies, store.individuals) !==
          link.ownerKey
      )
        throw new Error("Владелец счёта изменился. Откройте форму заново");
    }
  },
});
provide(operationStoreKey, ownerEditor ? main : store);
let active = true,
  previous;
async function load() {
  error.value = "";
  try {
    if (props.messageId) {
      const { data } = await teamApi.get(
        `/finance/messages/${props.messageId}/operation`,
      );
      if (!active) return;
      if (ownerEditor) {
        checkOwner();
        const missing = Object.entries(data.options).some(([kind, rows]) =>
          rows.some(
            (row) =>
              !main[kind]?.some(
                (known) => String(known._id) === String(row._id),
              ),
          ),
        );
        if (!main.accounts.length || missing) await main.fetchAllEntities();
        checkOwner();
      } else {
        Object.assign(store, data.options, {
          canEdit: false,
          workspaceRole: "analyst",
        });
      }
      if (active) {
        operation.value = data.operation;
        operationSnapshot.value = data.snapshot;
        ready.value = true;
      }
    } else {
      const { data } = await teamApi.get("/finance/options");
      if (active) {
        Object.assign(store, data);
        ready.value = true;
      }
    }
  } catch (e) {
    if (active) error.value = teamError(e);
  }
}
function checkOwner() {
  if (
    !ownerEditor ||
    !chat.me?.owner ||
    chat.me.actorId !== actorId ||
    String(chat.me.workspaceId) !== workspaceId ||
    String(main.user?.currentWorkspaceId || "") !== workspaceId
  )
    throw new Error("Сеанс изменился. Откройте операцию заново");
}
async function submit(payload) {
  if (busy.value) return;
  busy.value = true;
  try {
    if (props.messageId) {
      checkOwner();
      if (operationType.value === "income") {
        const ownerKey = payload.companyId
          ? `company-${payload.companyId}`
          : payload.individualId
            ? `individual-${payload.individualId}`
            : null;
        await main.saveAccountOwners([
          { accountId: payload.accountId, ownerKey },
        ]);
      }
      const data =
        operationType.value === "transfer"
          ? {
              ...payload,
              type: "transfer",
              isTransfer: true,
              isWithdrawal: isSystemWithdrawal(payload),
            }
          : payload;
      await main.updateOperation(operation.value._id, data, {
        originalOperation: operation.value,
      });
      try {
        const { data: refreshed } = await teamApi.get(`/messages/${props.messageId}`);
        chat.mergeMessage(refreshed.message);
      } catch { /* The operation is saved; the chat stream will refresh the card. */ }
      return;
    }
    const chosen = new Date(payload.date);
    const dateValue = [
      chosen.getFullYear(),
      String(chosen.getMonth() + 1).padStart(2, "0"),
      String(chosen.getDate()).padStart(2, "0"),
    ].join("-");
    await chat.action("/finance/operations", {
      ...payload,
      date: dateValue,
      type: props.type,
      requestId,
      ...(props.taskId ? { taskId: props.taskId } : {}),
    });
  } finally {
    busy.value = false;
  }
}
function close() {
  if (!busy.value) emit("close");
}
onMounted(() => {
  previous = document.activeElement;
  dialog.value.showModal();
  resize();
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
  window.addEventListener("resize", resize);
  load();
});
onBeforeUnmount(() => {
  active = false;
  window.visualViewport?.removeEventListener("resize", resize);
  window.visualViewport?.removeEventListener("scroll", resize);
  window.removeEventListener("resize", resize);
  dialog.value?.close();
  previous?.focus?.({ preventScroll: true });
});
</script>
<template>
  <dialog
    ref="dialog"
    class="team-finance-dialog"
    :style="viewport"
    :class="{ 'keyboard-navigation': keyboard }"
    :aria-label="messageId ? 'Операция' : 'Новая операция'"
    @cancel.prevent="close"
    @keydown.stop
  >
    <component
      v-if="ready && component"
      :is="component"
      :date="operation ? new Date(operation.date) : date"
      :cell-index="operation?.cellIndex || 0"
      :operation-to-edit="operationType !== 'transfer' ? operation : null"
      :transfer-to-edit="operationType === 'transfer' ? operation : null"
      :submit-operation="submit"
      @close="close"
      ><template #header-actions
        ><button
          class="finance-close"
          type="button"
          aria-label="Закрыть операцию"
          :disabled="busy"
          @click="close"
        >
          <UiIcon name="close" /></button></template
    ></component>
    <div v-else-if="ready" class="finance-loading">
      <TeamOperationShare
        :message="{ operationShare: { ...operationSnapshot, mode: 'table' } }"
      />
    </div>
    <div v-else class="finance-loading" role="status">
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else>Загрузка…</p>
      <button v-if="error" @click="load">Повторить</button>
    </div>
    <button
      v-if="!ready || !component"
      class="finance-close finance-close-floating"
      type="button"
      aria-label="Закрыть операцию"
      :disabled="busy"
      @click="close"
    >
      <UiIcon name="close" />
    </button>
  </dialog>
</template>
<style scoped>
.team-finance-dialog {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--codex-pane-text, #222);
  overflow: visible;
}
.team-finance-dialog::backdrop {
  background: #0005;
}
.finance-close {
  position: static;
  z-index: 5000;
  display: grid;
  place-items: center;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--codex-pane-surface, #fff);
  color: inherit;
  cursor: pointer;
}
.finance-close:focus-visible {
  outline: 2px solid var(--codex-pane-focus, #21823e);
  outline-offset: 2px;
}
.finance-close-floating {
  position: fixed;
  top: calc(var(--finance-top, 0px) + var(--safe-area-top, 0px) + 10px);
  right: calc(var(--safe-area-right, 0px) + 12px);
}
.finance-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(360px, calc(100% - 48px));
  padding: 20px;
  background: var(--codex-pane-surface, #fff);
  border-radius: 12px;
}
:deep(.popup-overlay) {
  top: var(--finance-top, 0px);
  left: var(--finance-left, 0px);
  width: var(--finance-width, 100%);
  height: var(--finance-height, 100%);
  padding: calc(var(--safe-area-top, 0px) + 12px)
    calc(var(--safe-area-right, 0px) + 12px) var(--finance-bottom, 12px)
    calc(var(--safe-area-left, 0px) + 12px);
  box-sizing: border-box;
}
:deep(.financial-operation-popup) {
  box-sizing: border-box;
  max-height: 100%;
  width: min(440px, 100%);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.team-finance-dialog:not(.keyboard-navigation) :deep(button:focus),
.team-finance-dialog:not(.keyboard-navigation) :deep(input:focus),
.team-finance-dialog:not(.keyboard-navigation) :deep(textarea:focus) {
  outline: 0 !important;
  box-shadow: none !important;
}
</style>
