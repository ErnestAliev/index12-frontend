import { computed } from 'vue';
import { useMainStore } from '@/stores/mainStore';

/**
 * Centralized permission management composable
 * 
 * Provides reactive permission checks based on workspace role.
 * This is the single source of truth for all permission logic.
 * 
 * @example
 * const permissions = usePermissions();
 * if (permissions.canSeeBalances.value) {
 *   // Show balance
 * }
 */
export function usePermissions() {
    const mainStore = useMainStore();

    // Get current workspace role
    // CRITICAL: Access .value because mainStore.workspaceRole is a computed ref
    const role = computed(() => mainStore.workspaceRole?.value ?? mainStore.workspaceRole);

    // Role checks
    const isAnalyst = computed(() => role.value === 'analyst');
    const isManager = computed(() => role.value === 'manager');
    const isAdmin = computed(() => role.value === 'admin');

    // ==========================================
    // BASIC PERMISSIONS
    // ==========================================

    /**
     * Can create new operations (income, expense)
     * - Analyst: NO
     * - Manager: YES
     * - Admin: YES
     */
    const canCreate = computed(() => isManager.value || isAdmin.value);

    /**
     * Can edit operations (checks ownership separately)
     * - Analyst: NO
     * - Manager: YES (own only)
     * - Admin: YES (all)
     */
    const canEdit = computed(() => isManager.value || isAdmin.value);

    /**
     * Can delete operations (checks ownership separately)
     * - Analyst: NO
     * - Manager: YES (own only)
     * - Admin: YES (all)
     */
    const canDelete = computed(() => isManager.value || isAdmin.value);

    /**
     * Can edit/delete operations created by others
     * - Analyst: NO
     * - Manager: NO
     * - Admin: YES
     */
    const canEditOthersOperations = computed(() => isAdmin.value);

    /**
     * Can see account balances in popups and selects
     * - Analyst: NO
     * - Manager: NO (HIDDEN for security)
     * - Admin: YES
     */
    const canSeeBalances = computed(() => {
        const result = !isManager.value && !isAnalyst.value;
        console.log('🔍 canSeeBalances:', {
            role: role.value,
            isManager: isManager.value,
            isAnalyst: isAnalyst.value,
            result
        });
        return result;
    });

    /**
     * Can create transfer operations
     * - Analyst: NO
     * - Manager: NO (transfers forbidden)
     * - Admin: YES
     */
    const canCreateTransfer = computed(() => isAdmin.value);

    /**
     * Can manage workspace settings (invites, roles, etc)
     * - Analyst: NO
     * - Manager: NO
     * - Admin: YES
     */
    const canManageWorkspace = computed(() => isAdmin.value);

    /**
     * Can invite new members to workspace
     * - Analyst: NO
     * - Manager: NO
     * - Admin: YES
     */
    const canInvite = computed(() => isAdmin.value);

    /**
     * Is read-only mode (cannot make any changes)
     * - Analyst: YES
     * - Manager: NO
     * - Admin: NO
     */
    const isReadOnly = computed(() => isAnalyst.value);

    // ==========================================
    // OPERATION-SPECIFIC PERMISSIONS
    // ==========================================

    /**
     * Check if user can edit a specific operation
     * @param {Object} operation - The operation to check
     * @returns {boolean}
     */
    function canEditOperation(operation) {
        if (!canEdit.value) return false;
        if (isAdmin.value) return true;
        // Manager can only edit own operations
        if (isManager.value) {
            return operation.createdBy === mainStore.user?.id;
        }
        return false;
    }

    /**
     * Check if user can delete a specific operation
     * @param {Object} operation - The operation to check
     * @returns {boolean}
     */
    function canDeleteOperation(operation) {
        if (!canDelete.value) return false;
        if (isAdmin.value) return true;
        // Manager can only delete own operations
        if (isManager.value) {
            return operation.createdBy === mainStore.user?.id;
        }
        return false;
    }

    /**
     * Check if user can move/drag a specific operation
     * @param {Object} operation - The operation to check
     * @returns {boolean}
     */
    function canMoveOperation(operation) {
        // Same rules as edit
        return canEditOperation(operation);
    }

    // ==========================================
    // UI VISIBILITY HELPERS
    // ==========================================

    /**
     * Should show balance in account/owner options?
     * Used in dropdown selects for accounts, companies, individuals
     */
    const shouldShowBalance = computed(() => canSeeBalances.value);

    /**
     * Should show Transfer button in UI?
     */
    const shouldShowTransferButton = computed(() => canCreateTransfer.value);

    /**
     * Should show 12M (year view) toggle?
     * Manager should only see current month
     * Show by default if role is not set (loading state)
     */
    const shouldShow12MToggle = computed(() => role.value !== 'manager');

    // ==========================================
    // PERMISSION SUMMARY
    // ==========================================

    /**
     * Get human-readable role label
     */
    const roleLabel = computed(() => {
        switch (role.value) {
            case 'analyst': return 'Аналитик';
            case 'manager': return 'Менеджер';
            case 'admin': return 'Администратор';
            default: return 'Неизвестно';
        }
    });

    /**
     * Get permission summary for current role
     */
    const permissionSummary = computed(() => ({
        role: role.value,
        roleLabel: roleLabel.value,
        canCreate: canCreate.value,
        canEdit: canEdit.value,
        canDelete: canDelete.value,
        canSeeBalances: canSeeBalances.value,
        canCreateTransfer: canCreateTransfer.value,
        canManageWorkspace: canManageWorkspace.value,
        isReadOnly: isReadOnly.value
    }));

    return {
        // Role checks
        role,
        isAnalyst,
        isManager,
        isAdmin,
        roleLabel,

        // Basic permissions
        canCreate,
        canEdit,
        canDelete,
        canEditOthersOperations,
        canSeeBalances,
        canCreateTransfer,
        canManageWorkspace,
        canInvite,
        isReadOnly,

        // Operation-specific
        canEditOperation,
        canDeleteOperation,
        canMoveOperation,

        // UI helpers
        shouldShowBalance,
        shouldShowTransferButton,
        shouldShow12MToggle,

        // Summary
        permissionSummary
    };
}
