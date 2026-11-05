<script setup>
import { computed, nextTick, ref, watch } from "vue";
import UiIcon from "./UiIcon.vue";
import CodexMessageText from "./CodexMessageText.vue";
import CodexComposer from "./CodexComposer.vue";
import TeamContractorSelect from "./TeamContractorSelect.vue";
import TeamRequestCard from "./TeamRequestCard.vue";
import { formatAmountInputEvent } from "@/utils/amountInput";
defineProps({ mobile: Boolean });
const emit = defineEmits(["logout"]);
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
const chat = useTeamChatStore(),
  tab = ref(chat.tab || "messages"),
  message = ref(""),
  files = ref([]),
  input = ref(null),
  feed = ref(null),
  uploading = ref(false),
  invite = ref(""),
  localError = ref(""),
  creating = ref(false),
  older = ref([]);
const draft = ref({
  title: "",
  amount: "",
  contractorId: null,
  contractorName: "",
  comment: "",
  dueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  ),
  id: crypto.randomUUID(),
});
watch(tab, (value) => {
  chat.tab = value;
});
watch(
  () => chat.requestedRequestId,
  (id) => {
    if (id) {
      focusedRequest.value = id;
      tab.value = "requests";
    }
  },
);
const selectedRoles = ref({}),
  processingPdf = ref(null),
  focusedRequest = ref(chat.requestedRequestId || null);
function updateRole(member, role) {
  if (member.status === "pending") {
    selectedRoles.value[member._id] = role;
    return;
  }
  void run(() =>
    chat.action(
      `/members/${member._id}`,
      { role, status: member.status, expectedVersion: member.version },
      "patch",
    ),
  );
}
const money = (cents) =>
  new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2,
  }).format(cents / 100);
const roleName = (role) => chat.me?.roles?.[role] || role;
const isReviewer = computed(() =>
  ["manager", "director"].includes(chat.me?.role),
);
const shownMessages = computed(() =>
  [
    ...older.value.filter(
      (m) => !chat.state.messages.some((n) => n._id === m._id),
    ),
    ...chat.state.messages,
  ].filter(
    (m) => !m.deletedAt && !chat.state.deletedMessageIds?.includes(m._id),
  ),
);
watch(
  () => chat.me?.workspaceId,
  () => {
    older.value = [];
    invite.value = "";
    files.value = [];
    message.value = "";
  },
);
watch(
  () => chat.state.messages.at(-1)?._id,
  async () => {
    const nearBottom =
      !feed.value ||
      feed.value.scrollHeight - feed.value.scrollTop - feed.value.clientHeight <
        100;
    await nextTick();
    if (nearBottom && feed.value)
      feed.value.scrollTop = feed.value.scrollHeight;
  },
);
async function run(fn) {
  localError.value = "";
  try {
    return await fn();
  } catch (e) {
    localError.value = teamError(e);
  }
}
async function send() {
  if (
    uploading.value ||
    chat.busy ||
    (!message.value.trim() && !files.value.length)
  )
    return;
  const sentText = message.value,
    sentFiles = files.value.map((f) => f.fileId);
  const result = await run(() => chat.send(sentText, sentFiles));
  if (result) {
    if (message.value === sentText) message.value = "";
    files.value = files.value.filter((f) => !sentFiles.includes(f.fileId));
    await nextTick();
    if (feed.value) feed.value.scrollTop = feed.value.scrollHeight;
  }
}
async function attach(event) {
  uploading.value = true;
  await run(async () => {
    for (const file of event.target.files) {
      if (
        files.value.length >= 5 ||
        file.size > 10 * 1024 * 1024 ||
        files.value.reduce((s, f) => s + f.size, 0) + file.size >
          25 * 1024 * 1024
      )
        throw Error("До пяти файлов: один до 10 МБ, всего до 25 МБ");
      const { data } = await teamApi.post("/files", file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        timeout: 60000,
      });
      files.value.push(data.file);
    }
  });
  event.target.value = "";
  uploading.value = false;
}
async function download(file) {
  await run(async () => {
    const { data } = await teamApi.get(`/files/${file.fileId}`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(data),
      a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
async function loadOlder() {
  await run(async () => {
    const first = shownMessages.value[0];
    if (!first) return;
    const { data } = await teamApi.get("/state", {
      params: { before: first._id },
    });
    older.value = [...data.messages, ...older.value].slice(-1000);
    chat.olderMessageIds = older.value.map((m) => m._id);
    chat.state.hasMore = data.hasMore;
  });
}
async function createRequest() {
  const result = await run(() =>
    chat.action("/requests", {
      ...draft.value,
      amount: draft.value.amount.replace(/\s/g, ""),
    }),
  );
  if (result) {
    creating.value = false;
    focusedRequest.value = result.request._id;
    chat.requestedRequestId = result.request._id;
    draft.value = {
      ...draft.value,
      title: "",
      amount: "",
      comment: "",
      id: crypto.randomUUID(),
    };
  }
}
async function decide(row, action) {
  await run(() =>
    chat.action(`/requests/${row._id}/decision`, {
      action,
      expectedVersion: row.version,
    }),
  );
}
function editRequest(row) {
  window.dispatchEvent(
    new CustomEvent("index12:edit-team-request", { detail: { id: row._id } }),
  );
}
async function convert(row) {
  const result = await run(() =>
    chat.action(`/requests/${row._id}/convert`, {
      expectedVersion: row.version,
    }),
  );
  if (result) window.dispatchEvent(new Event("index12:team-operation-created"));
}
async function recall(row) {
  await run(() =>
    chat.action(`/requests/${row._id}/recall`, {
      expectedVersion: row.version,
    }),
  );
}
async function processPdf(message, file) {
  processingPdf.value = file.fileId;
  await run(async () => {
    const { data } = await teamApi.post(
      `/messages/${message._id}/files/${file.fileId}/invoice`,
      {},
      { timeout: 200000 },
    );
    await chat.refresh();
    focusedRequest.value = data.request._id;
    tab.value = "requests";
  });
  processingPdf.value = null;
}
async function dismissPdf(message, file) {
  await run(() =>
    chat.action(`/messages/${message._id}/files/${file.fileId}/dismiss`, {}),
  );
}
async function removeMessage(row) {
  if (!window.confirm("Удалить сообщение для всех участников?")) return;
  const result = await run(() =>
    chat.action(`/messages/${row._id}`, {}, "delete"),
  );
  if (result) older.value = older.value.filter((m) => m._id !== row._id);
}
async function removeRequest(row) {
  const question = row.operationId
    ? "Удалить карточку заявки? Записанный расход останется на таймлайне."
    : "Удалить заявку и её черновик с таймлайна?";
  if (!window.confirm(question)) return;
  const result = await run(() =>
    chat.action(
      `/requests/${row._id}`,
      { expectedVersion: row.version },
      "delete",
    ),
  );
  if (result) chat.notice = "Заявка удалена";
}
async function invitePeople() {
  await run(async () => {
    const data = await chat.action("/invite", {});
    invite.value = data.url;
    await navigator.clipboard?.writeText(data.url).catch(() => {});
  });
}
async function copy(text) {
  await run(() => navigator.clipboard.writeText(text));
}
</script>
<template>
  <div class="team-pane">
    <div v-if="chat.me" class="team-identity">
      <span>{{ chat.me.displayName }}</span>
      <span class="team-role"
        >{{ roleName(chat.me.role)
        }}<span v-if="chat.me.owner" class="team-admin"
          >Администратор</span
        ></span
      >
      <button
        v-if="!chat.me.owner"
        type="button"
        class="team-logout"
        @click="emit('logout')"
      >
        Выйти
      </button>
    </div>
    <nav class="team-tabs" aria-label="Разделы чата">
      <button :aria-pressed="tab === 'messages'" @click="tab = 'messages'">
        Сообщения</button
      ><button :aria-pressed="tab === 'requests'" @click="tab = 'requests'">
        Заявки
        <small>{{
          chat.state.requests.filter(
            (r) => !["recorded", "rejected"].includes(r.state),
          ).length
        }}</small></button
      ><button
        v-if="chat.me?.owner"
        :aria-pressed="tab === 'members'"
        @click="tab = 'members'"
      >
        Участники
        <small v-if="chat.pending.length">{{ chat.pending.length }}</small>
      </button>
    </nav>
    <div v-if="chat.notice" class="team-notice" role="status">
      <span>{{ chat.notice }}</span
      ><button
        type="button"
        aria-label="Скрыть уведомление"
        @click="chat.notice = ''"
      >
        <UiIcon name="close" />
      </button>
    </div>
    <div v-if="localError || chat.error" class="team-error" role="alert">
      {{ localError || chat.error }}
    </div>
    <div v-if="!chat.me" class="team-empty">
      {{ chat.error || "Подключение к чату…" }}
    </div>
    <div v-else-if="chat.me.status === 'pending'" class="team-empty">
      Запрос отправлен владельцу. Ожидается одобрение
    </div>
    <template v-else-if="tab === 'messages'">
      <div
        ref="feed"
        class="team-feed"
        role="log"
        aria-label="Сообщения сотрудников"
        aria-live="polite"
      >
        <button
          v-if="chat.state.hasMore"
          class="team-history"
          @click="loadOlder"
        >
          Ранее
        </button>
        <div v-if="!shownMessages.length" class="team-empty">
          Сообщения сотрудников появятся здесь
        </div>
        <article
          v-for="m in shownMessages"
          :key="m._id"
          class="team-message"
          :class="{ self: m.authorId === chat.me.actorId }"
        >
          <div class="team-bubble">
            <header>
              <strong>{{ m.authorName }}</strong
              ><time>{{
                new Date(m.createdAt).toLocaleTimeString("ru-RU", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }}</time>
            </header>
            <CodexMessageText
              v-if="m.text"
              :text="m.text"
              class="team-message-content"
            />
            <button
              v-for="file in m.attachments"
              :key="file.fileId"
              class="team-file"
              @click="download(file)"
            >
              <UiIcon name="attach" />{{ file.name }}
            </button>
            <template
              v-for="file in m.attachments.filter(
                (f) =>
                  f.isPdf &&
                  !f.invoiceRequestId &&
                  !f.invoiceDismissed &&
                  !chat.state.requests.some((r) => r.sourceFileId === f.fileId),
              )"
              :key="'pdf-' + file.fileId"
              ><div
                v-if="m.authorId === chat.me.actorId"
                class="team-pdf-question"
              >
                <span>Это счёт на оплату?</span>
                <div>
                  <button
                    type="button"
                    :disabled="!!processingPdf"
                    @click="processPdf(m, file)"
                  >
                    {{
                      processingPdf === file.fileId
                        ? "Распознавание…"
                        : "Да, создать заявку"
                    }}</button
                  ><button
                    type="button"
                    :disabled="!!processingPdf"
                    @click="dismissPdf(m, file)"
                  >
                    Не обрабатывать
                  </button>
                </div>
              </div></template
            >
            <div class="team-message-actions">
              <button
                v-if="chat.me.owner || m.authorId === chat.me.actorId"
                type="button"
                class="team-copy"
                aria-label="Удалить сообщение"
                title="Удалить сообщение"
                :disabled="chat.busy"
                @click="removeMessage(m)"
              >
                <UiIcon name="trash" /></button
              ><button
                v-if="m.text"
                class="team-copy"
                title="Копировать"
                aria-label="Копировать сообщение"
                @click="copy(m.text)"
              >
                <UiIcon name="copy" />
              </button>
            </div>
          </div>
        </article>
      </div>
      <div class="team-compose-area">
        <div v-if="files.length" class="team-staged">
          <span v-for="(f, i) in files" :key="f.fileId"
            >{{ f.name
            }}<button
              type="button"
              :aria-label="`Убрать файл ${f.name}`"
              @click="files.splice(i, 1)"
            >
              <UiIcon name="close" /></button
          ></span>
        </div>
        <input
          ref="input"
          type="file"
          hidden
          multiple
          @change="attach"
        /><CodexComposer
          v-model="message"
          :busy="chat.busy || uploading"
          :mobile="mobile"
          attachments-enabled
          hide-microphone
          :has-attachments="!!files.length"
          placeholder="Сообщение сотрудникам"
          @send="send"
          @attach="input.click()"
        /><span v-if="uploading" role="status">Загрузка файла…</span>
      </div>
    </template>
    <div v-else class="team-scroll">
      <template v-if="tab === 'requests'">
        <div v-if="isReviewer && chat.state.financial" class="team-forecast">
          <div
            v-if="chat.state.financial.unallocatedCents"
            class="team-unallocated"
          >
            Без выбранной компании:
            {{ money(chat.state.financial.unallocatedCents) }}
          </div>
          <article
            v-for="c in chat.state.financial.companies.filter(
              (c) => c.requestedCents,
            )"
            :key="c.companyId"
          >
            <strong>{{
              chat.state.companies.find((x) => x._id === c.companyId)?.name ||
              "Общие счета"
            }}</strong>
            <dl>
              <div>
                <dt>Сейчас на счетах</dt>
                <dd>{{ money(c.currentCents) }}</dd>
              </div>
              <div>
                <dt>Заявки к оплате</dt>
                <dd>−{{ money(c.requestedCents) }}</dd>
              </div>
              <div>
                <dt>Минимум по прогнозу</dt>
                <dd :class="{ negative: c.minimumCents < 0 }">
                  {{ money(c.minimumCents) }}
                </dd>
              </div>
            </dl>
            <p v-if="c.gapDate" class="negative">
              Кассовый разрыв с {{ c.gapDate }}
            </p>
          </article>
          <details>
            <summary>Остатки на счетах</summary>
            <details
              v-for="a in chat.state.financial.accounts"
              :key="a._id"
              class="team-account-forecast"
            >
              <summary>
                <span
                  >{{ a.name
                  }}<small>{{
                    chat.state.companies.find((c) => c._id === a.companyId)
                      ?.name
                  }}</small></span
                ><span>{{ money(a.balanceCents) }}</span>
              </summary>
              <dl>
                <div>
                  <dt>На согласовании</dt>
                  <dd>−{{ money(a.pendingCents || 0) }}</dd>
                </div>
                <div>
                  <dt>Утверждено</dt>
                  <dd>−{{ money(a.approvedCents || 0) }}</dd>
                </div>
                <div>
                  <dt>После всех заявок</dt>
                  <dd :class="{ negative: a.afterRequestsCents < 0 }">
                    {{ money(a.afterRequestsCents ?? a.balanceCents) }}
                  </dd>
                </div>
              </dl>
            </details>
          </details>
        </div>
        <button
          class="team-expense-primary team-request-new"
          @click="creating = !creating"
        >
          Заявка на расход <UiIcon name="plus" />
        </button>
        <form
          v-if="creating"
          class="team-form team-expense-form"
          @submit.prevent="createRequest"
        >
          <input
            v-model="draft.title"
            aria-label="Что оплатить / купить"
            placeholder="Что оплатить / купить"
            maxlength="300"
            required
          />
          <div class="team-fields">
            <input
              :value="draft.amount"
              @input="draft.amount = formatAmountInputEvent($event)"
              aria-label="Сумма, ₸"
              placeholder="Сумма, ₸"
              inputmode="decimal"
              required
            /><input
              v-model="draft.dueDate"
              type="date"
              aria-label="Дата оплаты"
              title="Дата оплаты"
              required
            />
          </div>
          <TeamContractorSelect
            v-model="draft.contractorId"
            :fallback-name="draft.contractorName"
            @selected="draft.contractorName = $event.name"
          /><textarea
            v-model="draft.comment"
            aria-label="Комментарий к заявке"
            placeholder="Комментарий"
            rows="2"
            maxlength="10000"
          ></textarea
          ><button
            class="team-expense-primary"
            :disabled="chat.busy || !draft.contractorId"
          >
            На согласование
          </button>
        </form>
        <p v-if="chat.state.requestsTruncated" class="team-error">
          Показаны последние 500 заявок. Прогноз учитывает все активные заявки
        </p>
        <div v-if="!chat.state.requests.length && !creating" class="team-empty">
          Заявок пока нет
        </div>
        <TeamRequestCard
          v-for="r in chat.state.requests"
          :key="r._id"
          :request="r"
          :default-open="focusedRequest === r._id"
          @edit="editRequest"
          @decision="decide"
          @convert="convert"
          @recall="recall"
          @file="download"
          @delete="removeRequest"
        />
      </template>
      <template v-else-if="tab === 'members'">
        <div class="team-settings">
          <select
            v-if="chat.me.owner"
            :value="chat.me.role"
            aria-label="Моя роль в чате"
            :disabled="chat.busy"
            @change="
              run(() =>
                chat.action(
                  '/settings',
                  { ownerRole: $event.target.value },
                  'patch',
                ),
              )
            "
          >
            <option value="manager">Управляющий</option>
            <option value="director">Руководитель компании</option>
          </select>
          <button @click="invitePeople">Пригласить по ссылке</button
          ><input
            v-if="invite"
            :value="invite"
            readonly
            aria-label="Ссылка приглашения в чат"
            @focus="$event.target.select()"
          />
        </div>
        <article
          v-for="m in chat.state.members"
          :key="m._id"
          class="team-member"
        >
          <strong>{{ m.name }}</strong
          ><span>{{ m.phone }}</span
          ><select
            :value="selectedRoles[m._id] || m.role"
            :aria-label="`Роль ${m.name}`"
            @change="updateRole(m, $event.target.value)"
          >
            <option
              v-for="(label, role) in chat.me.roles"
              :key="role"
              :value="role"
            >
              {{ label }}
            </option>
          </select>
          <div>
            <span>{{
              {
                active: "В чате",
                pending: "Ожидает одобрения",
                rejected: "Отклонён",
                revoked: "Доступ закрыт",
              }[m.status]
            }}</span
            ><button
              v-if="m.status === 'pending'"
              @click="
                run(() =>
                  chat.action(
                    `/members/${m._id}`,
                    {
                      role: selectedRoles[m._id] || m.role,
                      status: 'active',
                      expectedVersion: m.version,
                    },
                    'patch',
                  ),
                )
              "
            >
              Одобрить</button
            ><button
              v-if="m.status === 'active'"
              @click="
                run(() =>
                  chat.action(
                    `/members/${m._id}`,
                    {
                      role: m.role,
                      status: 'revoked',
                      expectedVersion: m.version,
                    },
                    'patch',
                  ),
                )
              "
            >
              Закрыть доступ
            </button>
          </div>
        </article>
      </template>
    </div>
  </div>
</template>
<style scoped src="./teamChat.css"></style>
