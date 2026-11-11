import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { connectTeamDestinations } from './utils/teamDestination'

// Apply the saved theme before either desktop or mobile mounts.
const savedTheme = localStorage.getItem('theme')
document.documentElement.setAttribute('data-theme', savedTheme === 'light' ? 'light' : 'dark')

const app = createApp(App)

app.use(createPinia())
connectTeamDestinations(router)
app.use(router)

app.mount('#app')
