<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ launch: [] }>()
const isHovering = ref(false)

const features = [
  { icon: '📄', title: 'Import PDFs', desc: 'Open and edit existing documents' },
  { icon: '✨', title: 'Layer Editing', desc: 'Modify text, images & shapes' },
  { icon: '🎨', title: 'Typography', desc: 'Beautiful fonts & styling' },
  { icon: '📤', title: 'Export', desc: 'Save as PDF or DOCX' },
]
</script>

<template>
  <div class="min-h-screen bg-dark-950 overflow-hidden relative">
    <!-- Animated background -->
    <div class="absolute inset-0 bg-mesh-gradient opacity-60" />
    <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-accent-violet/20 rounded-full blur-[120px] animate-glow-breathe" />
    <div class="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-fuchsia/15 rounded-full blur-[100px] animate-glow-breathe" style="animation-delay: 2s" />
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-cyan/10 rounded-full blur-[150px] animate-float-slow" />

    <!-- Content -->
    <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <!-- Logo & Title -->
      <div class="text-center mb-12 animate-fade-up">
        <div class="inline-flex items-center gap-3 mb-6">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-violet to-accent-fuchsia flex items-center justify-center shadow-glow-lg">
            <span class="text-3xl">📖</span>
          </div>
        </div>
        <h1 class="text-5xl md:text-7xl font-bold bg-gradient-to-r from-white via-accent-violet to-accent-fuchsia bg-clip-text text-transparent mb-4">
          ROOK
        </h1>
        <p class="text-xl md:text-2xl text-white/60 font-light tracking-wide">
          Book Writing & PDF Editor
        </p>
      </div>

      <!-- CTA Button -->
      <button
        @click="emit('launch')"
        @mouseenter="isHovering = true"
        @mouseleave="isHovering = false"
        class="group relative mb-16 animate-fade-up"
        style="animation-delay: 0.2s"
      >
        <div class="absolute inset-0 bg-gradient-to-r from-accent-violet to-accent-fuchsia rounded-2xl blur-xl opacity-50 group-hover:opacity-80 transition-opacity duration-500" />
        <div class="relative px-10 py-5 bg-gradient-to-r from-accent-violet to-accent-fuchsia rounded-2xl font-semibold text-lg text-white shadow-glow-lg hover:shadow-glow-xl transition-all duration-300 hover:scale-105 flex items-center gap-3">
          <span>Open Online App</span>
          <svg class="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </button>

      <!-- Features Grid -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl w-full animate-fade-up" style="animation-delay: 0.4s">
        <div
          v-for="(feature, i) in features"
          :key="i"
          class="group p-5 rounded-2xl bg-glass-light backdrop-blur-xl border border-glass-border hover:border-accent-violet/30 hover:bg-glass-medium transition-all duration-300"
        >
          <div class="text-3xl mb-3">{{ feature.icon }}</div>
          <h3 class="font-semibold text-white/90 mb-1">{{ feature.title }}</h3>
          <p class="text-sm text-white/50">{{ feature.desc }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="absolute bottom-6 text-center text-white/30 text-sm">
        <p>Built with Vue + Tauri + Rust • WebAssembly Powered</p>
      </div>
    </div>
  </div>
</template>
