<script setup>
import { computed, ref } from 'vue';
import { useDashboardOverview } from '@/composables/useDashboardOverview.js';
import { DASHBOARD_WIDGETS } from '@/utils/dashboardWidgets.js';
import { dashboardId, isDashboardTransfer } from '@/utils/dashboardFinance.js';
const props = defineProps({ widgetKey: { type: String, required: true }, expanded: Boolean, mobile: Boolean });
const emit = defineEmits(['open', 'manage', 'edit-operation']);
const { store, currentEntries, futureEntries, movement, futureMovement, futurePayments, minimum, periodLabel, endDateLabel, operationLabel } = useDashboardOverview();
const title = computed(() => DASHBOARD_WIDGETS.find(w => w.key === props.widgetKey)?.name || '');
const future = computed({ get: () => store.dashboardForecastState[props.widgetKey] === true, set: value => store.setForecastState(props.widgetKey, value) });
const canSwitch = computed(() => ['cashflow', 'projects', 'articles', 'transfers', 'credits'].includes(props.widgetKey));
const money = value => `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₸`;
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value || 0))}`;
const dateLabel = value => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
const selectedMovement = computed(() => future.value ? futureMovement.value : movement.value);
const selectedEntries = computed(() => future.value ? futureEntries.value : currentEntries.value);
const activity = computed(() => [...selectedEntries.value].filter(entry => entry.change !== 0).sort((a, b) => (future.value ? 1 : -1) * (new Date(a.operation.date) - new Date(b.operation.date))));
const payments = computed(() => props.expanded ? futurePayments.value : futurePayments.value.slice(0, 3));
const projects = computed(() => (store.projectPnlBalances || []).map(row => ({
  ...row,
  income: future.value ? row.futureIncomeAbs : row.incomeAbs,
  expense: future.value ? row.futureExpenseAbs : row.expenseAbs,
  net: future.value ? row.futureChange : row.currentBalance,
})).sort((a, b) => Math.abs(b.income) + Math.abs(b.expense) - Math.abs(a.income) - Math.abs(a.expense)));
const projectRows = computed(() => props.expanded ? projects.value : projects.value.slice(0, 3));
const selectedProject = ref(null);
const projectOperations = computed(() => {
  const entries = selectedEntries.value;
  return entries.filter(({ operation }) => selectedProject.value === '__all_projects__' ? operation.projectScope === 'all' : dashboardId(operation.projectId) === selectedProject.value);
});
const articles = computed(() => {
  const rows = future.value ? store.futureSubcategoryBreakdowns : store.currentSubcategoryBreakdowns;
  const groups = new Map();
  for (const row of rows || []) {
    const key = row.parentCategoryId || 'none';
    if (!groups.has(key)) groups.set(key, { id: key, name: store.categories.find(c => dashboardId(c) === key)?.name || 'Без статьи', income: 0, expense: 0, transfers: 0, children: [] });
    const group = groups.get(key);
    group.income += row.income || 0; group.expense += row.expense || 0; group.transfers += row.transfers || 0;
    group.children.push({ ...row, name: store.subcategories.find(s => dashboardId(s) === row.subcategoryId)?.name || 'Без подкатегории' });
  }
  return [...groups.values()].sort((a, b) => b.income + b.expense + b.transfers - a.income - a.expense - a.transfers);
});
const articleRows = computed(() => props.expanded ? articles.value : articles.value.slice(0, 3));
const transfers = computed(() => selectedEntries.value.filter(entry => isDashboardTransfer(entry.operation)).sort((a, b) => (future.value ? 1 : -1) * (new Date(a.operation.date) - new Date(b.operation.date))));
const transferRows = computed(() => props.expanded ? transfers.value : transfers.value.slice(0, 3));
const credits = computed(() => future.value ? store.futureCreditBalances : store.currentCreditBalances);
const period = computed(() => props.widgetKey === 'upcomingPayments' || future.value ? `Будущие до ${endDateLabel.value}` : periodLabel.value);
const netChange = computed(() => store.futureTotalBalance - store.currentTotalBalance);
</script>
<template>
  <section class="dashboard-card overview-widget" :class="[{ 'overview-expanded': expanded, 'overview-mobile': mobile }, `overview-${widgetKey}`]" :data-widget-key="widgetKey" @click.stop="widgetKey !== 'money' && !expanded && emit('open')">
    <header class="overview-heading">
      <h3>{{ title }}</h3>
      <div class="overview-actions">
        <button v-if="widgetKey === 'money'" type="button" class="overview-icon" aria-label="Настроить виджеты" title="Настроить виджеты" @click.stop="emit('manage')">⋯</button>
        <button v-else-if="!expanded" type="button" class="overview-icon" :aria-label="`Открыть: ${title}`" @click.stop="emit('open')">↗</button>
      </div>
    </header>
    <div v-if="widgetKey === 'money'" class="money-overview">
      <div class="money-current" :class="{ 'negative': store.currentTotalBalance < 0 }" :title="`Сейчас: ${money(store.currentTotalBalance)}`">{{ money(store.currentTotalBalance) }}</div>
      <div class="overview-line"><span>На {{ endDateLabel }}</span><strong :class="{ negative: store.futureTotalBalance < 0 }">{{ money(store.futureTotalBalance) }}</strong></div>
      <div class="overview-line overview-secondary"><span>Изменение</span><span :class="{ positive: netChange > 0, negative: netChange < 0 }">{{ signed(netChange) }}</span></div>
      <div v-if="minimum" class="overview-line money-minimum" title="Минимальный остаток на конец дня от сегодня до конца прогноза"><span>Мин. {{ dateLabel(minimum.date) }}</span><strong :class="{ negative: minimum.balance < 0 }">{{ money(minimum.balance) }}</strong></div>
    </div>
    <template v-else>
      <div class="overview-period">
        <span>{{ period }}</span>
        <div v-if="canSwitch" class="overview-modes" aria-label="Период операций">
          <button type="button" :aria-pressed="!future" @click.stop="future = false">Факт</button>
          <button type="button" :aria-pressed="future" @click.stop="future = true">Будущие</button>
        </div>
      </div>
      <div class="overview-body">
        <template v-if="widgetKey === 'cashflow'">
          <div class="overview-line"><span>Поступления <small>· {{ selectedMovement.incomeCount }}</small></span><strong class="positive">+{{ money(selectedMovement.income) }}</strong></div>
          <div class="overview-line"><span>Выплаты <small>· {{ selectedMovement.expenseCount }}</small></span><strong class="negative">−{{ money(selectedMovement.expense) }}</strong></div>
          <div class="overview-line cashflow-net"><span>Изменение</span><strong :class="{ positive: selectedMovement.net > 0, negative: selectedMovement.net < 0 }">{{ signed(selectedMovement.net) }}</strong></div>
          <div v-if="expanded" class="overview-activity">
            <button v-for="entry in activity" :key="dashboardId(entry.operation)" type="button" class="overview-payment" @click.stop="emit('edit-operation', entry.operation)"><span class="payment-date">{{ dateLabel(entry.operation.date) }}</span><span class="payment-name">{{ operationLabel(entry.operation) }}</span><strong :class="entry.change > 0 ? 'positive' : 'negative'">{{ signed(entry.change) }}</strong></button>
          </div>
        </template>
        <template v-else-if="widgetKey === 'upcomingPayments'">
          <button v-for="entry in payments" :key="dashboardId(entry.operation)" type="button" class="overview-payment" :title="operationLabel(entry.operation)" @click.stop="emit('edit-operation', entry.operation)"><span class="payment-date">{{ dateLabel(entry.operation.date) }}</span><span class="payment-name">{{ operationLabel(entry.operation) }}</span><strong :class="entry.change > 0 ? 'positive' : 'negative'">{{ signed(entry.change) }}</strong></button>
          <div v-if="!payments.length" class="overview-empty">Нет будущих платежей</div>
          <div v-if="expanded && payments.length" class="overview-line cashflow-net"><span>Ожидаемые выплаты · {{ futureMovement.expenseCount }}</span><strong class="negative">{{ money(futureMovement.expense) }}</strong></div>
        </template>
        <template v-else-if="widgetKey === 'projects'">
          <div v-if="projectRows.length" class="project-labels"><span>Проект</span><span>Доходы</span><span>Прямые расходы</span><span>Разница</span></div>
          <template v-for="project in projectRows" :key="project._id">
            <button type="button" class="project-overview-row" :aria-pressed="expanded && selectedProject === String(project._id)" :title="project.tooltip" @click.stop="expanded ? selectedProject = selectedProject === String(project._id) ? null : String(project._id) : emit('open')"><span>{{ project.name }}</span><span class="positive">{{ money(project.income) }}</span><span class="negative">{{ money(project.expense) }}</span><strong :class="{ negative: project.net < 0 }">{{ signed(project.net) }}</strong></button>
            <div v-if="expanded && selectedProject === String(project._id)" class="overview-activity"><button v-for="entry in projectOperations" :key="dashboardId(entry.operation)" type="button" class="overview-payment" @click.stop="emit('edit-operation', entry.operation)"><span class="payment-date">{{ dateLabel(entry.operation.date) }}</span><span class="payment-name">{{ operationLabel(entry.operation) }}</span><strong :class="entry.change > 0 ? 'positive' : 'negative'">{{ signed(entry.change) }}</strong></button><span v-if="!projectOperations.length" class="overview-empty">Нет денежных операций</span></div>
          </template>
          <div v-if="!projectRows.length" class="overview-empty">Нет проектов</div>
        </template>
        <template v-else-if="widgetKey === 'articles'">
          <details v-for="article in articleRows" :key="article.id" class="article-group" @click.stop>
            <summary><span>{{ article.name }}</span><span class="article-amounts"><span v-if="article.income" class="positive">+{{ money(article.income) }}</span><span v-if="article.expense" class="negative">−{{ money(article.expense) }}</span><span v-if="article.transfers">↔ {{ money(article.transfers) }}</span></span></summary>
            <div v-for="child in article.children" :key="child._id" class="article-child"><span>{{ child.name }}</span><span class="article-amounts"><span v-if="child.income" class="positive">+{{ money(child.income) }}</span><span v-if="child.expense" class="negative">−{{ money(child.expense) }}</span><span v-if="child.transfers">↔ {{ money(child.transfers) }}</span></span></div>
          </details>
          <div v-if="!articles.length" class="overview-empty">Нет операций за период</div>
        </template>
        <template v-else-if="widgetKey === 'transfers'">
          <button v-for="entry in transferRows" :key="dashboardId(entry.operation)" type="button" class="overview-payment" @click.stop="emit('edit-operation', entry.operation)"><span class="payment-date">{{ dateLabel(entry.operation.date) }}</span><span class="payment-name">{{ operationLabel(entry.operation) }}</span><strong>{{ money(Math.abs(entry.operation.amount)) }}</strong></button>
          <div v-if="!transferRows.length" class="overview-empty">Нет переводов за период</div>
        </template>
        <template v-else-if="widgetKey === 'credits'">
          <div v-for="credit in credits" :key="credit._id" class="overview-line"><span>{{ credit.name }}</span><strong>{{ money(credit.balance) }}</strong></div>
          <div v-if="!credits?.length" class="overview-empty">Нет кредитов</div>
        </template>
      </div>
    </template>
  </section>
</template>
<style scoped>
.overview-widget { display: flex; flex-direction: column; height: 100%; min-height: 0; min-width: 0; padding: 8px 12px; color: var(--color-text); background: var(--widget-background); }
.overview-heading { display: flex; align-items: center; justify-content: space-between; min-height: 24px; flex-shrink: 0; gap: 6px; }
h3 { margin: 0; min-width: 0; font-size: 13px; line-height: 1.3; font-weight: 600; }
.overview-icon { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; font-size: 18px; color: var(--btn-widget-color); background: var(--btn-widget-bg); border: 1px solid var(--btn-widget-border); border-radius: 4px; }
.overview-period { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 3px 6px; color: var(--text-mute); font-size: 11px; margin: 3px 0 5px; flex-shrink: 0; }
.overview-modes { display: flex; gap: 3px; }
.overview-modes button { padding: 2px 5px; font: inherit; color: var(--text-soft); border: 1px solid var(--color-border); background: var(--widget-background); border-radius: 4px; }
.overview-modes button[aria-pressed="true"] { color: var(--btn-widget-color-active); background: var(--btn-widget-bg-active); border-color: var(--btn-widget-border-active); }
.overview-body { overflow-y: auto; min-height: 0; scrollbar-width: thin; }
.overview-line { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 12px; }
.overview-line > span:first-child { color: var(--text-soft); min-width: 0; }
strong { font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
small { font-size: 11px; color: var(--text-mute); }
.positive { color: var(--widget-income-color); }
.negative { color: var(--color-danger); }
.overview-secondary { color: var(--text-mute); }
.money-overview { min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.money-current { font-size: clamp(18px, 1.5vw, 28px); line-height: 1.25; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; margin: 2px 0 3px; }
.money-minimum { font-size: 11px; }
.money-overview .overview-line { line-height: 1.25; padding: 1px 0; }
.overview-payment { display: grid; grid-template-columns: 35px minmax(0, 1fr) auto; align-items: center; gap: 6px; width: 100%; padding: 5px 0; margin: 0; background: transparent; border: 0; border-bottom: 1px solid var(--cell-border); color: var(--color-text); font: inherit; font-size: 12px; text-align: left; }
.overview-payment:last-child { border-bottom: 0; }
.overview-payment:hover { background: var(--widget-bg-hover); }
.payment-date { color: var(--text-mute); font-size: 11px; }
.payment-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overview-empty { padding: 8px 0; color: var(--text-mute); font-size: 12px; }
.cashflow-net { border-top: 1px solid var(--color-border); margin-top: 3px; padding-top: 5px; }
.project-labels, .project-overview-row { display: grid; grid-template-columns: minmax(70px, 1fr) repeat(3, minmax(0, 1fr)); gap: 6px; align-items: baseline; }
.project-labels { font-size: 11px; color: var(--text-mute); }
.project-labels span:not(:first-child) { text-align: right; }
.project-overview-row { width: 100%; padding: 6px 0; border: 0; background: transparent; color: var(--color-text); font: inherit; font-size: 12px; text-align: left; }
.project-overview-row > :first-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.project-overview-row > :not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.project-overview-row[aria-pressed="true"] { background: var(--cell-bg-hover); }
.project-overview-row strong { white-space: normal; }
.article-group { border-bottom: 1px solid var(--cell-border); font-size: 12px; }
.article-group summary { padding: 6px 0; cursor: pointer; }
.article-amounts { display: flex; flex-wrap: wrap; gap: 4px 8px; justify-content: flex-end; font-variant-numeric: tabular-nums; }
.article-child { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0 5px 14px; color: var(--text-soft); }
.overview-expanded { padding: 20px !important; }
.overview-expanded .overview-heading { margin-bottom: 8px; }
.overview-expanded h3 { font-size: 18px; }
.overview-expanded .overview-line, .overview-expanded .overview-payment, .overview-expanded .project-overview-row { font-size: 14px; padding-top: 10px; padding-bottom: 10px; }
.overview-activity { margin-top: 12px; }
.overview-mobile { height: auto; min-height: 120px; border: 1px solid var(--widget-border); border-radius: 8px; }
.overview-mobile .money-current { font-size: 26px; }
.overview-mobile.overview-expanded { flex: 1; min-height: 0; height: 0; }
.overview-mobile.overview-money { border: 0; border-bottom: 1px solid var(--widget-border); border-radius: 0; min-height: 128px; }
.overview-mobile.overview-money .overview-line { font-size: 12px; }
@media(max-width: 600px) { .overview-expanded { padding: 14px !important; } .project-labels, .project-overview-row { grid-template-columns: minmax(65px, 1fr) repeat(3, minmax(0, 1fr)); gap: 4px; } }
@media(pointer:coarse) { .overview-expanded .overview-payment { min-height: 44px; } .overview-modes button { min-height: 32px; } .overview-icon { min-width: 32px; min-height: 32px; } }
</style>
