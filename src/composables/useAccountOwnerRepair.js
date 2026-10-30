import { nextTick, ref, watch } from 'vue';
import { useMainStore } from '@/stores/mainStore';
import { getAccountOwnerKey, isValidOwnerKey, needsAccountOwnerRepair } from '@/utils/accountOwnership.js';

export function useAccountOwnerRepair({ routes, ready, enabled, existing }) {
  const store = useMainStore();
  const showOwnerRepair = ref(false);
  const ownerRepairItems = ref([]);
  const brokenRoutes = () => routes.filter(route => {
    if (route.active && !route.active()) return false;
    if (route.creating.value) return false;
    if (!route.accountId.value) return existing.value && route.repairMissing?.() !== false;
    return needsAccountOwnerRepair(route.accountId.value, route.ownerKey.value, store.accounts, store.companies, store.individuals);
  });

  function ensureAccountOwnership() {
    const broken = brokenRoutes();
    if (!broken.length) return true;
    ownerRepairItems.value = broken.map(route => ({
      key: route.key, label: route.label,
      accountId: route.accountId.value, ownerKey: route.ownerKey.value,
    }));
    showOwnerRepair.value = true;
    return false;
  }

  function hydrateAccountOwners() {
    for (const route of routes) {
      if (isValidOwnerKey(route.ownerKey.value, store.companies, store.individuals)) continue;
      const account = store.accounts.find(a => a._id === route.accountId.value);
      route.ownerKey.value = getAccountOwnerKey(account, store.companies, store.individuals);
    }
  }

  async function onOwnerRepairSaved(links) {
    for (const link of links) {
      const route = routes.find(item => item.key === link.key);
      if (!route) continue;
      route.accountId.value = link.accountId;
      route.ownerKey.value = link.ownerKey;
    }
    await nextTick();
    showOwnerRepair.value = false;
  }

  watch(() => [ready.value, enabled.value, existing.value,
    ...routes.flatMap(route => [route.accountId.value, route.ownerKey.value, route.creating.value, route.active?.()]),
    store.accounts, store.companies, store.individuals,
  ], () => {
    if (ready.value && enabled.value && !showOwnerRepair.value) ensureAccountOwnership();
  }, { flush: 'post', deep: true });

  return { showOwnerRepair, ownerRepairItems, ensureAccountOwnership, hydrateAccountOwners, onOwnerRepairSaved };
}
