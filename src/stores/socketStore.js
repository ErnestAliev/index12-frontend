import { defineStore } from 'pinia';
import { ref } from 'vue';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useMainStore } from './mainStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
const CLIENT_INSTANCE_STORAGE_KEY = 'index12-client-instance-id';

// Логика определения URL сокета
let SOCKET_URL = '';
try {
    const urlObj = new URL(API_BASE_URL);
    SOCKET_URL = urlObj.origin;
} catch (e) {
    console.warn('[socketStore] Failed to parse API_BASE_URL. Falling back.', e);
    SOCKET_URL = API_BASE_URL.replace('/api', '');
}

const getClientInstanceId = () => {
    if (typeof window === 'undefined') {
        return 'server';
    }

    try {
        const existingId = window.sessionStorage.getItem(CLIENT_INSTANCE_STORAGE_KEY);
        if (existingId) return existingId;

        const nextId = window.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        window.sessionStorage.setItem(CLIENT_INSTANCE_STORAGE_KEY, nextId);
        return nextId;
    } catch (error) {
        console.warn('[socketStore] Failed to access sessionStorage for client instance id.', error);
        return window.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
};

const CLIENT_INSTANCE_ID = getClientInstanceId();

axios.defaults.headers.common['X-Client-Instance-ID'] = CLIENT_INSTANCE_ID;

export const useSocketStore = defineStore('socket', () => {


    const socket = ref(null);
    const isConnected = ref(false);
    let activeWorkspaceId = '';
    const calendarChanged = workspaceId => {
        if (workspaceId && workspaceId === activeWorkspaceId) window.dispatchEvent(new CustomEvent('index12:calendar-changed', { detail: { workspaceId } }));
    };
    function joinWorkspace() {
        const workspaceId = activeWorkspaceId;
        if (workspaceId) socket.value?.emit('join', workspaceId, () => calendarChanged(workspaceId));
    }

    const shouldIgnoreSocketEvent = (meta) => {
        if (!meta) return false;
        if (meta.historyReceipt) return true;

        if (meta.sourceSocketId && socket.value?.id && meta.sourceSocketId === socket.value.id) {
            return true;
        }

        if (meta.sourceClientInstanceId && meta.sourceClientInstanceId === CLIENT_INSTANCE_ID) {
            return true;
        }

        return false;
    };

    /**
     * Инициализация подключения к сокету
     * @param {string} workspaceId - ID workspace для комнаты (все члены workspace в одной комнате)
     */
    function connect(workspaceId) {
        if (!workspaceId) return;
        workspaceId = String(workspaceId);
        if (socket.value) { if (workspaceId !== activeWorkspaceId) switchWorkspace(activeWorkspaceId, workspaceId); return; }
        activeWorkspaceId = workspaceId;

        const mainStore = useMainStore();



        socket.value = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        socket.value.on('connect', () => {
            console.log('[socketStore] Connected to server, joining workspace:', activeWorkspaceId);
            isConnected.value = true;
            joinWorkspace();

            // Устанавливаем заголовок для axios, чтобы сервер знал ID сокета этого клиента
            // и не присылал нам обратно наши же действия (эхо)
            if (socket.value.id) {
                axios.defaults.headers.common['X-Socket-ID'] = socket.value.id;
            }
        });

        socket.value.on('disconnect', () => {
            console.log('[socketStore] Disconnected');
            isConnected.value = false;
            delete axios.defaults.headers.common['X-Socket-ID'];
        });

        socket.value.on('calendar_changed', data => calendarChanged(data?.workspaceId));

        // --- Обработчики событий Операций ---
        // Мы предполагаем, что mainStore экспортирует публичные методы для обработки этих событий

        socket.value.on('operation_added', (op, meta) => {
            if (shouldIgnoreSocketEvent(meta)) return;
            if (mainStore.onSocketOperationAdded) mainStore.onSocketOperationAdded(op);
        });

        socket.value.on('operation_updated', (op, meta) => {
            if (shouldIgnoreSocketEvent(meta)) return;
            if (mainStore.onSocketOperationUpdated) mainStore.onSocketOperationUpdated(op, meta);
        });

        socket.value.on('operation_deleted', (id, meta) => {
            if (shouldIgnoreSocketEvent(meta)) return;
            if (mainStore.onSocketOperationDeleted) mainStore.onSocketOperationDeleted(id, meta);
        });

        socket.value.on('operations_reverted', (receipt) => {
            mainStore.applyHistoryOperationChanges(receipt?.changes || [], receipt?.workspaceId);
        });

        socket.value.on('operations_imported', (count, meta) => {
            if (shouldIgnoreSocketEvent(meta)) return;
            console.log(`[socketStore] Server imported ${count} ops. Refreshing...`);
            mainStore.forceRefreshAll();
        });

        // --- Обработчики событий Сущностей (Счета, Категории и т.д.) ---
        const entityTypes = ['account', 'company', 'contractor', 'project', 'individual', 'category', 'subcategory'];

        entityTypes.forEach(type => {
            socket.value.on(`${type}_added`, (item, meta) => {
                if (shouldIgnoreSocketEvent(meta)) return;
                if (mainStore.onSocketEntityAdded) mainStore.onSocketEntityAdded(type, item);
            });

            socket.value.on(`${type}_deleted`, (id, meta) => {
                if (shouldIgnoreSocketEvent(meta)) return;
                if (mainStore.onSocketEntityDeleted) mainStore.onSocketEntityDeleted(type, id);
            });

            socket.value.on(`${type}_list_updated`, (newList, meta) => {
                if (shouldIgnoreSocketEvent(meta)) return;
                if (mainStore.onSocketEntityListUpdated) mainStore.onSocketEntityListUpdated(type, newList);
            });
        });


    }

    /**
     * Переключение между workspace (покинуть старое, присоединиться к новому)
     * @param {string} oldWorkspaceId - ID старого workspace
     * @param {string} newWorkspaceId - ID нового workspace
     */
    function switchWorkspace(oldWorkspaceId, newWorkspaceId) {
        oldWorkspaceId = activeWorkspaceId || oldWorkspaceId;
        activeWorkspaceId = newWorkspaceId ? String(newWorkspaceId) : '';
        if (!socket.value || !isConnected.value) return;

        if (oldWorkspaceId) {
            console.log('[socketStore] Leaving workspace:', oldWorkspaceId);
            socket.value.emit('leave', oldWorkspaceId);
        }

        if (newWorkspaceId) {
            console.log('[socketStore] Joining workspace:', newWorkspaceId);
            joinWorkspace();
        }
    }

    function disconnect() {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
        }
        isConnected.value = false;
        activeWorkspaceId = '';
        delete axios.defaults.headers.common['X-Socket-ID'];
    }

    return {
        socket,
        isConnected,
        connect,
        disconnect,
        switchWorkspace
    };
});
