import axios from 'axios';
const base = import.meta.env.VITE_API_BASE_URL || (['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:3000/api' : `${window.location.origin}/api`);
export const businessApi = axios.create({ baseURL: `${base}/business`, withCredentials: true, timeout: 20000 });
export const businessError = error => error.response?.data?.message || 'Не удалось связаться с сервером';
export const legalFields = ['identificationNumber', 'legalAddress', 'director', 'registrationDate', 'activity', 'registrationStatus'];
