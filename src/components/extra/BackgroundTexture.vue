<template>
  <component :is="tag" :class="['relative', className]" :style="containerStyle">
    <div
      v-if="variant !== 'none'"
      class="pointer-events-none absolute inset-0"
      :style="textureStyle"
    />
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'

export type TextureVariant = 
  | 'fabric-of-squares'
  | 'grid-noise'
  | 'inflicted'
  | 'debut-light'
  | 'groovepaper'
  | 'noise'
  | 'dots'
  | 'crosshatch'
  | 'waves'
  | 'none'

interface Props {
  variant?: TextureVariant
  opacity?: number
  className?: string
  tag?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'noise',
  opacity: 0.4,
  className: '',
  tag: 'div'
})

// Inline SVG data URIs for textures
const textureDataUrls: Record<Exclude<TextureVariant, 'none'>, string> = {
  'fabric-of-squares': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Crect width='24' height='24' fill='%23000'/%3E%3Crect x='0' y='0' width='12' height='12' fill='%23181818'/%3E%3Crect x='12' y='12' width='12' height='12' fill='%23181818'/%3E%3C/svg%3E")`,
  'grid-noise': `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3Cpath d='M0 10h100M0 20h100M0 30h100M0 40h100M0 50h100M0 60h100M0 70h100M0 80h100M0 90h100' stroke='%23fff' stroke-opacity='0.06'/%3E%3Cpath d='M10 0v100M20 0v100M30 0v100M40 0v100M50 0v100M60 0v100M70 0v100M80 0v100M90 0v100' stroke='%23fff' stroke-opacity='0.06'/%3E%3C/svg%3E")`,
  'inflicted': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M0 0h40v40H0z' fill='%23000'/%3E%3Cpath d='M20 0L0 20M40 0L0 40M40 20L20 40' stroke='%23333' stroke-width='1'/%3E%3C/svg%3E")`,
  'debut-light': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Crect width='12' height='12' fill='%23000'/%3E%3Ccircle cx='6' cy='6' r='1.5' fill='%23222'/%3E%3C/svg%3E")`,
  'groovepaper': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23000'/%3E%3Cpath d='M0 40h80M40 0v80' stroke='%23222' stroke-width='0.5'/%3E%3Ccircle cx='20' cy='20' r='1' fill='%23252525'/%3E%3Ccircle cx='60' cy='20' r='1' fill='%23252525'/%3E%3Ccircle cx='20' cy='60' r='1' fill='%23252525'/%3E%3Ccircle cx='60' cy='60' r='1' fill='%23252525'/%3E%3C/svg%3E")`,
  'noise': `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
  'dots': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='10' cy='10' r='2' fill='%23333'/%3E%3C/svg%3E")`,
  'crosshatch': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M0 0l16 16M16 0L0 16' stroke='%23333' stroke-width='0.5'/%3E%3C/svg%3E")`,
  'waves': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='20'%3E%3Cpath d='M0 10c10-10 20-10 30 0s20 10 30 0' stroke='%23333' fill='none' stroke-width='1'/%3E%3C/svg%3E")`
}

const containerStyle = computed(() => ({
  isolation: 'isolate'
}))

const textureStyle = computed(() => ({
  backgroundImage: props.variant !== 'none' ? textureDataUrls[props.variant] : 'none',
  backgroundRepeat: 'repeat',
  opacity: props.opacity,
  mixBlendMode: 'soft-light' as const
}))
</script>
