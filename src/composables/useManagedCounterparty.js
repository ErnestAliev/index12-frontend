import { computed, ref, watch } from "vue";
import { getAccountOwnerKey } from "../utils/accountOwnership.js";
const idOf = (value) => String(value?._id || value || "");
export function useManagedCounterparty({
  store,
  selected,
  accountId,
  operation,
  canChoose,
  canAccess,
  direction,
}) {
  const peerAccountId = ref(null);
  const ownerOf = (account) =>
    getAccountOwnerKey(account, store.companies, store.individuals);
  const ownerKey = computed(() => {
    const value = selected.value || "";
    if (value.startsWith("ownc_")) return "company-" + value.slice(5);
    if (value.startsWith("owni_")) return "individual-" + value.slice(5);
    return null;
  });
  const isManaged = computed(() => !!ownerKey.value);
  const available = computed(() =>
    store.accounts.filter(
      (account) => canAccess(account._id) && ownerOf(account),
    ),
  );
  const ownOptions = computed(() => {
    if (!canChoose()) return [];
    const source = available.value.find(
      (account) => idOf(account._id) === idOf(accountId.value),
    );
    const sourceOwner = source && ownerOf(source);
    const owners = new Set(
      available.value.map(ownerOf).filter((key) => key !== sourceOwner),
    );
    const options = [];
    for (const [list, prefix, kind] of [
      [store.companies, "ownc_", "company"],
      [store.individuals, "owni_", "individual"],
    ])
      for (const entity of list)
        if (owners.has(kind + "-" + idOf(entity._id)))
          options.push({
            value: prefix + idOf(entity._id),
            label: entity.name,
          });
    return options;
  });
  const peerOptions = computed(() =>
    available.value
      .filter(
        (account) =>
          ownerOf(account) === ownerKey.value &&
          idOf(account._id) !== idOf(accountId.value),
      )
      .map((account) => ({ value: idOf(account._id), label: account.name })),
  );
  watch([ownerKey, peerOptions], () => {
    if (
      !peerOptions.value.some(
        (option) => idOf(option.value) === idOf(peerAccountId.value),
      )
    )
      peerAccountId.value =
        peerOptions.value.length === 1 ? peerOptions.value[0].value : null;
  });
  function restore(op) {
    if (!op.purchaseGroupId) return;
    const company = idOf(op.counterpartyCompanyId),
      individual = idOf(op.counterpartyIndividualId);
    selected.value = company
      ? "ownc_" + company
      : individual
        ? "owni_" + individual
        : null;
    peerAccountId.value =
      idOf(direction === "expense" ? op.toAccountId : op.fromAccountId) || null;
  }
  function validate() {
    if (operation()?.purchaseGroupId && !isManaged.value)
      return "Для связанной операции выберите компанию внутри контура.";
    if (
      isManaged.value &&
      !ownOptions.value.some((option) => option.value === selected.value)
    )
      return "Выберите другого владельца счёта внутри текущей рабочей области.";
    if (
      isManaged.value &&
      !peerOptions.value.some((option) => option.value === peerAccountId.value)
    )
      return direction === "expense"
        ? "Выберите счёт зачисления."
        : "Выберите счёт списания второй компании.";
    return null;
  }
  return {
    isManaged,
    ownOptions,
    peerAccountId,
    peerOptions,
    restore,
    validate,
  };
}
