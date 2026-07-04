import { createHead } from '@unhead/vue/client'
import { createApp } from 'vue'

import './app.css'
import { preloadFonts } from '@/app/editor/fonts'
import { IS_TAURI } from '@/constants'

import App from './App.vue'
import router from './router'

// MESAAS: embed mode disables PWA registration below
import { embedConfig } from '@/app/embed'

preloadFonts()
const head = createHead()
createApp(App).use(router).use(head).mount('#app')

if (!IS_TAURI && !embedConfig) {
  // MESAAS: no service worker inside the CRM embed
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })
}
