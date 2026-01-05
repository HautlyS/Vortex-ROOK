import { createApp, ref, h, defineComponent } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import LandingPage from './LandingPage.vue'
import './styles/main.css'
import { initBridge, isTauri } from './bridge'

const isLandingMode = import.meta.env.VITE_LANDING === 'true'
const showApp = ref(false)

const RootComponent = defineComponent({
  setup() {
    const launch = () => { showApp.value = true }
    return () => {
      if (isTauri() || showApp.value || !isLandingMode) {
        return h(App)
      }
      return h(LandingPage, { onLaunch: launch })
    }
  }
})

const app = createApp(RootComponent)
const pinia = createPinia()
app.use(pinia)

initBridge()
  .then(() => {
    app.mount('#app')
    // Initialize theme store to apply CSS variables
    import('./stores/themeStore').then(({ useThemeStore }) => {
      useThemeStore()
    })
  })
  .catch((err) => {
    console.error('Failed to initialize bridge:', err)
    app.mount('#app')
  })
