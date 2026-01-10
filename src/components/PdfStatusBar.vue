<script setup lang="ts">
/**
 * PdfStatusBar - Shows PDF content analysis and reconstruction options
 * Displays detection status, content type, and action buttons
 */
import { computed } from 'vue';
import type { PdfAnalysis } from '@/bridge/types';
import { getContentTypeDescription, getRecommendationText } from '@/bridge/pdfAnalyzer';

const props = defineProps<{
  analysis: PdfAnalysis | null;
  isProcessing?: boolean;
}>();

const emit = defineEmits<{
  (e: 'runOcr'): void;
  (e: 'verifyText'): void;
  (e: 'convertVectors'): void;
  (e: 'dismiss'): void;
}>();

const contentTypeLabel = computed(() => 
  props.analysis ? getContentTypeDescription(props.analysis.contentType) : ''
);

const recommendationLabel = computed(() =>
  props.analysis ? getRecommendationText(props.analysis.recommendation) : ''
);

const statusColor = computed(() => {
  if (!props.analysis) return 'bg-gray-500';
  switch (props.analysis.contentType) {
    case 'image-only': return 'bg-amber-500';
    case 'text-based': return 'bg-emerald-500';
    case 'mixed': return 'bg-blue-500';
    case 'vector-heavy': return 'bg-purple-500';
    default: return 'bg-gray-500';
  }
});

const showOcrButton = computed(() =>
  props.analysis?.recommendation === 'ocr-required' ||
  props.analysis?.recommendation === 'ocr-verification'
);

const showVectorButton = computed(() =>
  props.analysis?.recommendation === 'vector-conversion'
);

const confidencePercent = computed(() =>
  props.analysis ? Math.round(props.analysis.confidence * 100) : 0
);

function handleAction() {
  if (!props.analysis) return;
  switch (props.analysis.recommendation) {
    case 'ocr-required':
      emit('runOcr');
      break;
    case 'ocr-verification':
      emit('verifyText');
      break;
    case 'vector-conversion':
      emit('convertVectors');
      break;
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="analysis && analysis.recommendation !== 'none'"
      class="flex items-center gap-3 px-4 py-2 bg-gray-800/90 backdrop-blur-sm border-b border-gray-700"
    >
      <!-- Status Indicator -->
      <div class="flex items-center gap-2">
        <span :class="[statusColor, 'w-2 h-2 rounded-full animate-pulse']" />
        <span class="text-sm font-medium text-gray-200">{{ contentTypeLabel }}</span>
      </div>

      <!-- Confidence Badge -->
      <span class="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-300">
        {{ confidencePercent }}% confidence
      </span>

      <!-- Stats -->
      <div class="hidden sm:flex items-center gap-3 text-xs text-gray-400">
        <span>{{ analysis.totalPages }} pages</span>
        <span>{{ analysis.totalTextObjects }} text</span>
        <span>{{ analysis.totalImageObjects }} images</span>
      </div>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Recommendation -->
      <span class="text-sm text-gray-400 hidden md:block">
        {{ recommendationLabel }}
      </span>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2">
        <button
          v-if="showOcrButton"
          :disabled="isProcessing"
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                 bg-amber-600 hover:bg-amber-500 text-white
                 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="handleAction"
        >
          <span
            v-if="isProcessing"
            class="flex items-center gap-1.5"
          >
            <svg
              class="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="3"
                class="opacity-25"
              />
              <path
                d="M4 12a8 8 0 018-8"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
              />
            </svg>
            Processing...
          </span>
          <span v-else>
            {{ analysis.recommendation === 'ocr-required' ? 'Run OCR' : 'Verify Text' }}
          </span>
        </button>

        <button
          v-if="showVectorButton"
          :disabled="isProcessing"
          class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                 bg-purple-600 hover:bg-purple-500 text-white
                 disabled:opacity-50 disabled:cursor-not-allowed"
          @click="handleAction"
        >
          Convert Vectors
        </button>

        <!-- Dismiss -->
        <button
          class="p-1.5 text-gray-400 hover:text-gray-200 rounded transition-colors"
          title="Dismiss"
          @click="emit('dismiss')"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </Transition>
</template>
