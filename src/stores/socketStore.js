import { defineStore } from 'pinia';
import { ref } from 'vue';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useMainStore } from './mainStore';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Логика определения URL сокета
let SOCKET_URL = '';
try {
    const urlObj = new URL(API_BASE_URL);
    SOCKET_URL = urlObj.origin;
} catch (e) {
    console.warn('[socketStore] Failed to parse API_BASE_URL. Falling back.', e);
    SOCKET_URL = API_BASE_URL.replace('/api', '');
}

export const useSocketStore = defineStore('socket', () => {


    const socket = ref(null);
    const isConnected = ref(false);

    /**
     * Инициализация подключения к сокету
     * @param {string} userId - ID пользователя для комнаты
     */
    function connect(userId) {
        if (socket.value) return; // Уже подключен
        if (!userId) return;

        const mainStore = useMainStore();



        socket.value = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        socket.value.on('connect', () => {

            isConnected.value = true;
            socket.value.emit('join', userId);

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

        // --- Обработчики событий Операций ---
        // Мы предполагаем, что mainStore экспортирует публичные методы для обработки этих событий

        socket.value.on('operation_added', (op) => {
            if (mainStore.onSocketOperationAdded) mainStore.onSocketOperationAdded(op);
        });

        socket.value.on('operation_updated', (op) => {
            if (mainStore.onSocketOperationUpdated) mainStore.onSocketOperationUpdated(op);
        });

        socket.value.on('operation_deleted', (id) => {
            if (mainStore.onSocketOperationDeleted) mainStore.onSocketOperationDeleted(id);
        });

        socket.value.on('operations_imported', (count) => {
            console.log(`[socketStore] Server imported ${count} ops. Refreshing...`);
            mainStore.forceRefreshAll();
        });

        // --- Обработчики событий Сущностей (Счета, Категории и т.д.) ---
        const entityTypes = ['account', 'company', 'contractor', 'project', 'individual', 'category'];

        entityTypes.forEach(type => {
            socket.value.on(`${type}_added`, (item) => {
                if (mainStore.onSocketEntityAdded) mainStore.onSocketEntityAdded(type, item);
            });

            socket.value.on(`${type}_deleted`, (id) => {
                if (mainStore.onSocketEntityDeleted) mainStore.onSocketEntityDeleted(type, id);
            });

            socket.value.on(`${type}_list_updated`, (newList) => {
                if (mainStore.onSocketEntityListUpdated) mainStore.onSocketEntityListUpdated(type, newList);
            });
        });


    }

    function disconnect() {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
        }
        isConnected.value = false;
    }

    return {
        socket,
        isConnected,
        connect,
        disconnect
    };
});