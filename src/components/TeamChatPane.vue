<script setup>
import { computed, nextTick, ref, watch } from "vue";
import UiIcon from "./UiIcon.vue";
import CodexMessageText from "./CodexMessageText.vue";
import { useTeamChatStore, teamApi, teamError } from "@/stores/teamChatStore";
const chat = useTeamChatStore(),
  tab = ref("messages"),
  message = ref(""),
  files = ref([]),
  input = ref(null),
  feed = ref(null),
  uploading = ref(false),
  invite = ref(""),
  localError = ref(""),
  creating = ref(false),
  converting = ref(null),
  options = ref({ accounts: [], categories: [] }),
  account = ref(""),
  category = ref(""),
  operationDate = ref(""),
  older = ref([]);
const draft = ref({
  title: "",
  amount: "",
  companyId: "",
  dueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  ),
  id: crypto.randomUUID(),
});
const selectedRoles = ref({});
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
const labels = {
  manager_review: "У управляющего",
  director_review: "У руководителя",
  ready: "Создать операцию",
  recorded: "Операция создана",
  rejected: "Отклонено",
};
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
const shownMessages = computed(() => [
  ...older.value.filter(
    (m) => !chat.state.messages.some((n) => n._id === m._id),
  ),
  ...chat.state.messages,
]);
const canDecide = (r) =>
  (r.state === "manager_review" && chat.me?.role === "manager") ||
  (r.state === "director_review" && chat.me?.role === "director");
const accounts = computed(() =>
  options.value.accounts.filter(
    (a) => String(a.companyId) === converting.value?.companyId,
  ),
);
watch(
  () => chat.me?.workspaceId,
  () => {
    older.value = [];
    invite.value = "";
    files.value = [];
    message.value = "";
    converting.value = null;
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
    older.value = [...data.messages, ...older.value];
    chat.state.hasMore = data.hasMore;
  });
}
async function createRequest() {
  const result = await run(() => chat.action("/requests", draft.value));
  if (result) {
    creating.value = false;
    draft.value = {
      ...draft.value,
      title: "",
      amount: "",
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
async function startConversion(row) {
  await run(async () => {
    const { data } = await teamApi.get("/operation-options");
    options.value = data;
    converting.value = row;
    account.value = "";
    category.value = "";
    operationDate.value = row.dueDate;
  });
}
async function convert() {
  const result = await run(() =>
    chat.action(`/requests/${converting.value._id}/convert`, {
      expectedVersion: converting.value.version,
      accountId: account.value,
      categoryId: category.value || null,
      dueDate: operationDate.value,
    }),
  );
  if (result) {
    converting.value = null;
    window.dispatchEvent(new Event("index12:team-operation-created"));
  }
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
function keyboard(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void send();
  }
}
</script>
<template>
  <div class="team-pane">
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
              <UiIcon name="attach" />{{ file.name }}</button
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
        </article>
      </div>
      <form class="team-composer" @submit.prevent="send">
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
        <div class="team-input-row">
          <input
            ref="input"
            type="file"
            hidden
            multiple
            @change="attach"
          /><button
            type="button"
            class="team-icon"
            title="Прикрепить файл"
            aria-label="Прикрепить файл в чат"
            :disabled="uploading || chat.busy"
            @click="input.click()"
          >
            <UiIcon name="attach" /></button
          ><textarea
            v-model="message"
            rows="2"
            aria-label="Сообщение сотрудникам"
            placeholder="Сообщение сотрудникам"
            maxlength="10000"
            @keydown="keyboard"
          ></textarea
          ><button
            type="submit"
            class="team-icon team-send"
            title="Отправить"
            aria-label="Отправить сообщение"
            :disabled="
              chat.busy || uploading || (!message.trim() && !files.length)
            "
          >
            <UiIcon name="send" />
          </button>
        </div>
        <span v-if="uploading" role="status">Загрузка файла…</span>
      </form>
    </template>
    <div v-else class="team-scroll">
      <template v-if="tab === 'requests'">
        <div v-if="isReviewer && chat.state.financial" class="team-forecast">
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
            <div
              v-for="a in chat.state.financial.accounts"
              :key="a._id"
              class="team-balance"
            >
              <span>{{ a.name }}</span
              ><span>{{ money(a.balanceCents) }}</span>
            </div>
          </details>
        </div>
        <button
          class="team-primary team-request-new"
          @click="creating = !creating"
        >
          Заявка на расход <UiIcon name="plus" />
        </button>
        <form v-if="creating" class="team-form" @submit.prevent="createRequest">
          <label
            >Что нужно сделать<input
              v-model="draft.title"
              placeholder="Купить лампочки"
              maxlength="300"
              required
          /></label>
          <div class="team-fields">
            <label
              >Сумма, ₸<input
                v-model="draft.amount"
                inputmode="decimal"
                placeholder="0"
                required /></label
            ><label
              >Дата оплаты<input v-model="draft.dueDate" type="date" required
            /></label>
          </div>
          <label
            >Компания<select
              v-model="draft.companyId"
              aria-label="Компания"
              required
            >
              <option value="" disabled>Выберите компанию</option>
              <option
                v-for="c in chat.state.companies"
                :key="c._id"
                :value="c._id"
              >
                {{ c.name }}
              </option>
            </select></label
          ><button class="team-primary" :disabled="chat.busy">
            На согласование
          </button>
        </form>
        <p v-if="chat.state.requestsTruncated" class="team-error">
          Показаны последние 500 заявок. Прогноз учитывает все активные заявки
        </p>
        <div v-if="!chat.state.requests.length && !creating" class="team-empty">
          Заявок пока нет
        </div>
        <article
          v-for="r in chat.state.requests"
          :key="r._id"
          class="team-request"
          :data-state="r.state"
        >
          <header>
            <span class="team-status">{{ labels[r.state] }}</span
            ><time>{{ r.dueDate }}</time>
          </header>
          <strong>{{ r.title }}</strong>
          <div class="team-request-amount">{{ money(r.amountCents) }}</div>
          <p>{{ r.companyName }} · {{ r.authorName }}</p>
          <div v-if="canDecide(r)" class="team-decisions">
            <button
              class="team-primary"
              :disabled="chat.busy"
              @click="decide(r, 'approve')"
            >
              Согласовать</button
            ><button :disabled="chat.busy" @click="decide(r, 'reject')">
              Отклонить
            </button>
          </div>
          <button
            v-if="
              r.state === 'ready' && chat.me.owner && chat.me.role === 'manager'
            "
            class="team-primary"
            @click="startConversion(r)"
          >
            Создать расход в INDEX12
          </button>
          <details v-if="r.history.length">
            <summary>Согласование</summary>
            <p v-for="(h, i) in r.history" :key="i">
              {{ h.name }} · {{ roleName(h.role) }} ·
              {{ h.action === "approve" ? "Согласовано" : "Отклонено" }}
            </p>
          </details>
        </article>
        <form v-if="converting" class="team-convert" @submit.prevent="convert">
          <header>
            <strong>{{ converting.title }}</strong
            ><button
              type="button"
              class="team-icon"
              aria-label="Закрыть создание расхода"
              @click="converting = null"
            >
              <UiIcon name="close" />
            </button>
          </header>
          <p>{{ money(converting.amountCents) }}</p>
          <label
            >Счёт<select v-model="account" aria-label="Счёт" required>
              <option value="" disabled>Выберите счёт компании</option>
              <option v-for="a in accounts" :key="a._id" :value="a._id">
                {{ a.name }}
              </option>
            </select></label
          ><label
            >Категория<select v-model="category" aria-label="Категория">
              <option value="">Без категории</option>
              <option
                v-for="c in options.categories"
                :key="c._id"
                :value="c._id"
              >
                {{ c.name }}
              </option>
            </select></label
          ><label
            >Дата операции<input
              v-model="operationDate"
              type="date"
              required /></label
          ><button class="team-primary" :disabled="chat.busy">
            Создать расход
          </button>
        </form>
      </template>
      <template v-else-if="tab === 'members'">
        <div class="team-settings">
          <label
            >Моя роль в чате<select
              :value="chat.me.role"
              aria-label="Моя роль в чате"
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
              <option
                v-for="(label, role) in chat.me.roles"
                :key="role"
                :value="role"
              >
                {{ label }}
              </option>
            </select></label
          ><button @click="invitePeople">Пригласить по ссылке</button
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
