// Extra Components - Lazy loaded for performance
import { defineAsyncComponent } from 'vue'

export const ElasticSlider = defineAsyncComponent(() => import('./ElasticSlider.vue'))
export const DecryptedText = defineAsyncComponent(() => import('./DecryptedText.vue'))
export const ClickSpark = defineAsyncComponent(() => import('./ClickSpark.vue'))
export const GradualBlur = defineAsyncComponent(() => import('./GradualBlur.vue'))
export const RotatingText = defineAsyncComponent(() => import('./RotatingText.vue'))
export const BackgroundTexture = defineAsyncComponent(() => import('./BackgroundTexture.vue'))
