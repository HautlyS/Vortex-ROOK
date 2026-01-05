<script setup lang="ts">
import { onMounted } from 'vue'
import { 
  Toolbar, 
  TextEditorToolbar,
  FontSelector,
  FontSizeControl,
  TextFormatControls,
  ColorControls,
  TextPresets
} from '@/components'
import { useTypography } from '@/composables'

const { state, hasTextLayer, applyFormat } = useTypography()

// Mock a text layer selection for demo
onMounted(() => {
  // Simulate selecting a text layer
  applyFormat({ 
    fontFamily: 'Inter',
    fontSize: 18,
    color: '#ffffff'
  })
})
</script>

<template>
  <div class="min-h-screen bg-dark-950 text-white p-6">
    <div class="max-w-7xl mx-auto space-y-8">
      
      <!-- Header -->
      <div class="text-center space-y-3">
        <h1 class="text-4xl font-bold text-gradient">ROOK Typography System</h1>
        <p class="text-white/60 text-lg">Modular, Modern & Functional Text Editing</p>
      </div>

      <!-- Main Toolbar -->
      <div class="flex justify-center">
        <Toolbar />
      </div>

      <!-- Modernized Text Editor -->
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-semibold">Modernized Text Editor</h2>
          <div class="glass-badge-accent">
            {{ hasTextLayer ? 'Text Layer Selected' : 'No Text Layer' }}
          </div>
        </div>

        <!-- Main Text Editor Toolbar -->
        <div class="flex justify-center">
          <TextEditorToolbar />
        </div>

        <!-- Modular Components Demo -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          <!-- Individual Components -->
          <div class="glass-panel rounded-2xl p-6">
            <h3 class="text-lg font-medium mb-4">Modular Components</h3>
            <div class="space-y-4">
              
              <div>
                <label class="block text-sm text-white/70 mb-2">Font Selector</label>
                <FontSelector />
              </div>
              
              <div>
                <label class="block text-sm text-white/70 mb-2">Font Size Control</label>
                <FontSizeControl />
              </div>
              
              <div>
                <label class="block text-sm text-white/70 mb-2">Text Format Controls</label>
                <TextFormatControls />
              </div>
              
              <div>
                <label class="block text-sm text-white/70 mb-2">Color Controls</label>
                <ColorControls />
              </div>
              
              <div>
                <label class="block text-sm text-white/70 mb-2">Text Presets</label>
                <TextPresets />
              </div>
              
            </div>
          </div>

          <!-- Live Preview -->
          <div class="glass-panel rounded-2xl p-6">
            <h3 class="text-lg font-medium mb-4">Live Preview</h3>
            <div class="glass-card p-6 min-h-[300px]">
              <div 
                class="text-white transition-all duration-300"
                :style="{
                  fontFamily: state.fontFamily,
                  fontSize: state.fontSize + 'px',
                  fontWeight: state.fontWeight,
                  fontStyle: state.fontStyle,
                  textDecoration: Array.from(state.textDecoration).join(' ') || 'none',
                  textTransform: state.textTransform,
                  textAlign: state.textAlign,
                  lineHeight: state.lineHeight,
                  letterSpacing: state.letterSpacing + 'px',
                  color: state.color,
                  backgroundColor: state.backgroundColor !== 'transparent' ? state.backgroundColor : undefined
                }"
              >
                The quick brown fox jumps over the lazy dog. 
                This text demonstrates all typography features including 
                font family, size, weight, style, decoration, transform, 
                alignment, line height, letter spacing, and colors.
              </div>
            </div>
          </div>

        </div>

        <!-- Architecture Overview -->
        <div class="glass-panel rounded-2xl p-6">
          <h3 class="text-lg font-medium mb-4">Architecture Improvements</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div class="space-y-3">
              <h4 class="font-medium text-violet-300">🧩 Modular Design</h4>
              <ul class="space-y-1 text-sm text-white/70">
                <li>• Composable-based state management</li>
                <li>• Focused, reusable components</li>
                <li>• Clean separation of concerns</li>
                <li>• Easy to test and maintain</li>
              </ul>
            </div>

            <div class="space-y-3">
              <h4 class="font-medium text-cyan-300">⚡ Modern Features</h4>
              <ul class="space-y-1 text-sm text-white/70">
                <li>• Vue 3 Composition API</li>
                <li>• TypeScript type safety</li>
                <li>• Keyboard shortcuts (Ctrl+B/I/U)</li>
                <li>• Real-time preview</li>
              </ul>
            </div>

            <div class="space-y-3">
              <h4 class="font-medium text-emerald-300">🚀 Enhanced UX</h4>
              <ul class="space-y-1 text-sm text-white/70">
                <li>• Instant visual feedback</li>
                <li>• Smart font loading</li>
                <li>• Preset text styles</li>
                <li>• Advanced typography controls</li>
              </ul>
            </div>

          </div>
        </div>

        <!-- Component Structure -->
        <div class="glass-panel rounded-2xl p-6">
          <h3 class="text-lg font-medium mb-4">Component Structure</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div>
              <h4 class="font-medium mb-3 text-white/80">Core Components</h4>
              <div class="space-y-2 text-sm font-mono">
                <div class="text-violet-300">TextEditorToolbar.vue</div>
                <div class="ml-4 text-white/60">├── FontSelector.vue</div>
                <div class="ml-4 text-white/60">├── FontSizeControl.vue</div>
                <div class="ml-4 text-white/60">├── TextFormatControls.vue</div>
                <div class="ml-4 text-white/60">├── TextAlignmentControls.vue</div>
                <div class="ml-4 text-white/60">├── ColorControls.vue</div>
                <div class="ml-4 text-white/60">├── TextPresets.vue</div>
                <div class="ml-4 text-white/60">└── AdvancedTypographyPanel.vue</div>
              </div>
            </div>

            <div>
              <h4 class="font-medium mb-3 text-white/80">State Management</h4>
              <div class="space-y-2 text-sm font-mono">
                <div class="text-cyan-300">useTypography.ts</div>
                <div class="ml-4 text-white/60">├── Centralized state</div>
                <div class="ml-4 text-white/60">├── Font loading</div>
                <div class="ml-4 text-white/60">├── Format application</div>
                <div class="ml-4 text-white/60">├── Keyboard shortcuts</div>
                <div class="ml-4 text-white/60">└── Layer integration</div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.text-gradient {
  background: linear-gradient(135deg, #8b5cf6, #06b6d4, #10b981);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
