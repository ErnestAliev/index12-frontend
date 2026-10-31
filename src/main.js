import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// Apply the saved theme before either desktop or mobile mounts.
const savedTheme = localStorage.getItem('theme')
document.documentElement.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'dark')

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
