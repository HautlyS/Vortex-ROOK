<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { TextEditorToolbar } from '@/components'
import { useTypography } from '@/composables'
import { isTauri } from '@/bridge/environment'
import { 
  initTypographyBridge,
  getAvailableFonts,
  validateFontSupport,
  preloadCommonFonts,
  searchFonts
} from '@/bridge/typographyBridge'

const { state, loadFonts, applyFormat } = useTypography()

// Test state
const testResults = ref<Record<string, { status: 'pending' | 'success' | 'error', message: string }>>({})
const isRunningTests = ref(false)
const platformInfo = ref({
  platform: isTauri() ? 'Tauri (Desktop)' : 'Web/WASM',
  userAgent: navigator.userAgent,
  timestamp: new Date().toISOString()
})

// Mock text layer for testing
const mockLayer = ref({
  id: 'test-layer',
  type: 'text',
  content: 'Typography Test Layer',
  fontFamily: 'Inter',
  fontSize: 16,
  fontWeight: 400,
  color: '#ffffff',
  textAlign: 'left'
})

const testCategories = computed(() => [
  {
    name: 'Platform Detection',
    tests: ['platform_detection', 'bridge_initialization']
  },
  {
    name: 'Font Loading',
    tests: ['system_fonts', 'google_fonts', 'font_search', 'font_validation']
  },
  {
    name: 'Typography Controls',
    tests: ['basic_formatting', 'advanced_typography', 'color_controls', 'alignment']
  },
  {
    name: 'Cross-Platform Features',
    tests: ['layer_updates', 'font_fallbacks', 'error_handling']
  }
])

onMounted(async () => {
  // Simulate text layer selection
  Object.assign(state.value, {
    fontFamily: mockLayer.value.fontFamily,
    fontSize: mockLayer.value.fontSize,
    fontWeight: mockLayer.value.fontWeight,
    color: mockLayer.value.color,
    textAlign: mockLayer.value.textAlign
  })
})

async function runAllTests() {
  isRunningTests.value = true
  testResults.value = {}
  
  const tests = [
    { id: 'platform_detection', name: 'Platform Detection', fn: testPlatformDetection },
    { id: 'bridge_initialization', name: 'Bridge Initialization', fn: testBridgeInitialization },
    { id: 'system_fonts', name: 'System Fonts Loading', fn: testSystemFonts },
    { id: 'google_fonts', name: 'Google Fonts Loading', fn: testGoogleFonts },
    { id: 'font_search', name: 'Font Search', fn: testFontSearch },
    { id: 'font_validation', name: 'Font Validation', fn: testFontValidation },
    { id: 'basic_formatting', name: 'Basic Formatting', fn: testBasicFormatting },
    { id: 'advanced_typography', name: 'Advanced Typography', fn: testAdvancedTypography },
    { id: 'color_controls', name: 'Color Controls', fn: testColorControls },
    { id: 'alignment', name: 'Text Alignment', fn: testAlignment },
    { id: 'layer_updates', name: 'Layer Updates', fn: testLayerUpdates },
    { id: 'font_fallbacks', name: 'Font Fallbacks', fn: testFontFallbacks },
    { id: 'error_handling', name: 'Error Handling', fn: testErrorHandling }
  ]
  
  for (const test of tests) {
    testResults.value[test.id] = { status: 'pending', message: 'Running...' }
    
    try {
      await test.fn()
      testResults.value[test.id] = { status: 'success', message: 'Passed' }
    } catch (error) {
      testResults.value[test.id] = { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  isRunningTests.value = false
}

// Test functions
async function testPlatformDetection() {
  if (!isTauri() && typeof WebAssembly === 'undefined') {
    throw new Error('WebAssembly not supported')
  }
}

async function testBridgeInitialization() {
  await initTypographyBridge()
}

async function testSystemFonts() {
  const { system } = await getAvailableFonts()
  if (system.length === 0) {
    throw new Error('No system fonts found')
  }
}

async function testGoogleFonts() {
  const { google } = await getAvailableFonts()
  if (google.length === 0) {
    throw new Error('No Google fonts found')
  }
}

async function testFontSearch() {
  await loadFonts()
  const results = await searchFonts('Inter')
  if (results.length === 0) {
    throw new Error('Font search returned no results')
  }
}

async function testFontValidation() {
  const isValid = await validateFontSupport('Arial')
  if (!isValid && isTauri()) {
    throw new Error('Arial font validation failed')
  }
  // Also test preloading
  await preloadCommonFonts()
}

async function testBasicFormatting() {
  await applyFormat({ fontWeight: 700 })
  await applyFormat({ fontStyle: 'italic' })
  await applyFormat({ fontWeight: 400, fontStyle: 'normal' })
}

async function testAdvancedTypography() {
  await applyFormat({ lineHeight: 1.8 })
  await applyFormat({ letterSpacing: 1.5 })
  await applyFormat({ textTransform: 'uppercase' })
  await applyFormat({ lineHeight: 1.5, letterSpacing: 0, textTransform: 'none' })
}

async function testColorControls() {
  await applyFormat({ color: '#ff0000' })
  await applyFormat({ backgroundColor: '#00ff00' })
  await applyFormat({ color: '#ffffff', backgroundColor: 'transparent' })
}

async function testAlignment() {
  await applyFormat({ textAlign: 'center' })
  await applyFormat({ textAlign: 'right' })
  await applyFormat({ textAlign: 'left' })
}

async function testLayerUpdates() {
  await applyFormat({ fontSize: 20 })
  await applyFormat({ fontSize: 16 })
}

async function testFontFallbacks() {
  await applyFormat({ fontFamily: 'NonExistentFont' })
  await applyFormat({ fontFamily: 'Inter' })
}

async function testErrorHandling() {
  // Test with invalid values
  try {
    await applyFormat({ fontSize: -1 })
  } catch {
    // Expected to handle gracefully
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success': return '✅'
    case 'error': return '❌'
    case 'pending': return '⏳'
    default: return '⚪'
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success': return 'text-emerald-400'
    case 'error': return 'text-red-400'
    case 'pending': return 'text-yellow-400'
    default: return 'text-white/50'
  }
}
</script>

<template>
  <div class="min-h-screen bg-dark-950 text-white p-6">
    <div class="max-w-6xl mx-auto space-y-8">
      
      <!-- Header -->
      <div class="text-center space-y-3">
        <h1 class="text-4xl font-bold text-gradient">Typography System Test Suite</h1>
        <p class="text-white/60">Cross-Platform Compatibility Verification</p>
      </div>

      <!-- Platform Info -->
      <div class="glass-panel rounded-2xl p-6">
        <h2 class="text-xl font-semibold mb-4">Platform Information</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span class="text-white/50">Platform:</span>
            <span class="ml-2 font-mono">{{ platformInfo.platform }}</span>
          </div>
          <div>
            <span class="text-white/50">Environment:</span>
            <span class="ml-2 font-mono">{{ isTauri() ? 'Native' : 'Browser' }}</span>
          </div>
          <div>
            <span class="text-white/50">Test Time:</span>
            <span class="ml-2 font-mono">{{ new Date(platformInfo.timestamp).toLocaleTimeString() }}</span>
          </div>
        </div>
      </div>

      <!-- Test Controls -->
      <div class="flex justify-center">
        <button
          @click="runAllTests"
          :disabled="isRunningTests"
          :class="[
            'btn-accent px-8 py-3 text-lg',
            isRunningTests && 'opacity-50 cursor-not-allowed'
          ]"
        >
          {{ isRunningTests ? 'Running Tests...' : 'Run All Tests' }}
        </button>
      </div>

      <!-- Typography Toolbar Demo -->
      <div class="glass-panel rounded-2xl p-6">
        <h2 class="text-xl font-semibold mb-4">Live Typography Controls</h2>
        <div class="space-y-4">
          <TextEditorToolbar />
          
          <!-- Live Preview -->
          <div class="glass-card p-6">
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
              The quick brown fox jumps over the lazy dog. This text demonstrates 
              real-time typography changes across {{ platformInfo.platform }}.
            </div>
          </div>
        </div>
      </div>

      <!-- Test Results -->
      <div class="space-y-6">
        <h2 class="text-2xl font-semibold text-center">Test Results</h2>
        
        <div 
          v-for="category in testCategories" 
          :key="category.name"
          class="glass-panel rounded-2xl p-6"
        >
          <h3 class="text-lg font-medium mb-4">{{ category.name }}</h3>
          <div class="space-y-3">
            <div 
              v-for="testId in category.tests" 
              :key="testId"
              class="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
            >
              <div class="flex items-center gap-3">
                <span class="text-xl">{{ getStatusIcon(testResults[testId]?.status || 'pending') }}</span>
                <span class="font-medium">{{ testId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }}</span>
              </div>
              <div :class="['text-sm', getStatusColor(testResults[testId]?.status || 'pending')]">
                {{ testResults[testId]?.message || 'Not run' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div v-if="Object.keys(testResults).length > 0" class="glass-panel rounded-2xl p-6">
        <h3 class="text-lg font-medium mb-4">Test Summary</h3>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div class="space-y-2">
            <div class="text-2xl font-bold text-emerald-400">
              {{ Object.values(testResults).filter(r => r.status === 'success').length }}
            </div>
            <div class="text-sm text-white/60">Passed</div>
          </div>
          <div class="space-y-2">
            <div class="text-2xl font-bold text-red-400">
              {{ Object.values(testResults).filter(r => r.status === 'error').length }}
            </div>
            <div class="text-sm text-white/60">Failed</div>
          </div>
          <div class="space-y-2">
            <div class="text-2xl font-bold text-yellow-400">
              {{ Object.values(testResults).filter(r => r.status === 'pending').length }}
            </div>
            <div class="text-sm text-white/60">Pending</div>
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
