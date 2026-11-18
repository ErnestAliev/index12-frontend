import { inject } from "vue";
import { useMainStore } from "@/stores/mainStore";
export const operationStoreKey = Symbol("operation-store");
// Chat forms receive only explicitly scoped data, never the owner's Pinia state.
export function useOperationStore() {
  return inject(operationStoreKey, null) || useMainStore();
}
