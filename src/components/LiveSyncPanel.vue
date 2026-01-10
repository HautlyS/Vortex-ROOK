<script setup lang="ts">
// LiveSyncPanel - UI for creating/joining sync sessions with permission links
import { ref, computed } from 'vue';
import { useSyncStore } from '@/stores/syncStore';

const syncStore = useSyncStore();

// Local state
const showPanel = ref(false);
const activeTab = ref<'host' | 'join'>('host');
const sessionName = ref('My Session');
const userName = ref('');
const joinLink = ref('');
const isLoading = ref(false);
const copiedLink = ref<string | null>(null);

// Computed
const isConnected = computed(() => syncStore.isConnected);
const isHosting = computed(() => syncStore.isHosting);
const peerCount = computed(() => syncStore.peerCount);
const role = computed(() => syncStore.role);
const statusMessage = computed(() => syncStore.statusMessage);
const error = computed(() => syncStore.error);

// Role badge colors
const roleBadge = computed(() => {
  switch (role.value) {
    case 'editor': return { text: 'Editor', class: 'bg-green-500/20 text-green-400' };
    case 'commenter': return { text: 'Commenter', class: 'bg-yellow-500/20 text-yellow-400' };
    default: return { text: 'Viewer', class: 'bg-blue-500/20 text-blue-400' };
  }
});

// Actions
async function handleCreateSession() {
  if (!sessionName.value.trim() || !userName.value.trim()) return;
  
  isLoading.value = true;
  const success = await syncStore.createAndHost(sessionName.value, userName.value);
  isLoading.value = false;
  
  if (success) {
    activeTab.value = 'host';
  }
}

async function handleJoinSession() {
  if (!joinLink.value.trim() || !userName.value.trim()) return;
  
  isLoading.value = true;
  const success = await syncStore.join(joinLink.value, userName.value);
  isLoading.value = false;
  
  if (success) {
    showPanel.value = false;
  }
}

function handleLeave() {
  syncStore.leave();
}

async function copyLink(type: 'viewer' | 'commenter' | 'editor') {
  const success = await syncStore.copyLink(type);
  if (success) {
    copiedLink.value = type;
    setTimeout(() => { copiedLink.value = null; }, 2000);
  }
}

function togglePanel() {
  showPanel.value = !showPanel.value;
}
</script>

<template>
  <div class="relative">
    <!-- Toggle Button -->
    <button
      class="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
      :class="isConnected 
        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
        : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'"
      @click="togglePanel"
    >
      <svg
        class="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2" 
          d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
        />
      </svg>
      <span class="text-sm font-medium">
        {{ isConnected ? `Live (${peerCount})` : 'Live Sync' }}
      </span>
      <span
        v-if="isConnected"
        class="w-2 h-2 rounded-full bg-green-400 animate-pulse"
      />
    </button>

    <!-- Panel -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="showPanel"
        class="absolute right-0 top-full mt-2 w-80 bg-zinc-800 rounded-xl shadow-xl border border-zinc-700 overflow-hidden z-50"
      >
        <!-- Connected State -->
        <div
          v-if="isConnected"
          class="p-4"
        >
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-green-400" />
              <span class="text-sm font-medium text-white">Connected</span>
              <span :class="['text-xs px-2 py-0.5 rounded-full', roleBadge.class]">
                {{ roleBadge.text }}
              </span>
            </div>
            <button
              class="text-xs text-red-400 hover:text-red-300"
              @click="handleLeave"
            >
              Leave
            </button>
          </div>

          <!-- Session Info -->
          <div class="mb-4 p-3 bg-zinc-900 rounded-lg">
            <div class="text-xs text-zinc-400 mb-1">
              Session
            </div>
            <div class="text-sm text-white font-medium truncate">
              {{ syncStore.session?.name || 'Unknown' }}
            </div>
            <div class="text-xs text-zinc-500 mt-1">
              {{ peerCount }} peer{{ peerCount !== 1 ? 's' : '' }} connected
            </div>
          </div>

          <!-- Share Links (Host only) -->
          <div
            v-if="isHosting"
            class="space-y-2"
          >
            <div class="text-xs text-zinc-400 mb-2">
              Share Links
            </div>
            
            <!-- Viewer Link -->
            <div class="flex items-center gap-2">
              <div class="flex-1 text-xs bg-zinc-900 px-3 py-2 rounded truncate text-zinc-400">
                {{ syncStore.viewerLink?.slice(0, 30) }}...
              </div>
              <button
                class="px-2 py-1.5 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                @click="copyLink('viewer')"
              >
                {{ copiedLink === 'viewer' ? '✓' : 'View' }}
              </button>
            </div>

            <!-- Commenter Link -->
            <div class="flex items-center gap-2">
              <div class="flex-1 text-xs bg-zinc-900 px-3 py-2 rounded truncate text-zinc-400">
                {{ syncStore.commenterLink?.slice(0, 30) }}...
              </div>
              <button
                class="px-2 py-1.5 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30"
                @click="copyLink('commenter')"
              >
                {{ copiedLink === 'commenter' ? '✓' : 'Comment' }}
              </button>
            </div>

            <!-- Editor Link -->
            <div class="flex items-center gap-2">
              <div class="flex-1 text-xs bg-zinc-900 px-3 py-2 rounded truncate text-zinc-400">
                {{ syncStore.editorLink?.slice(0, 30) }}...
              </div>
              <button
                class="px-2 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                @click="copyLink('editor')"
              >
                {{ copiedLink === 'editor' ? '✓' : 'Edit' }}
              </button>
            </div>
          </div>

          <!-- Peers List -->
          <div
            v-if="syncStore.peerList.length > 0"
            class="mt-4"
          >
            <div class="text-xs text-zinc-400 mb-2">
              Peers
            </div>
            <div class="space-y-1">
              <div
                v-for="peer in syncStore.peerList"
                :key="peer.id"
                class="flex items-center gap-2 text-xs p-2 bg-zinc-900 rounded"
              >
                <span
                  class="w-3 h-3 rounded-full"
                  :style="{ backgroundColor: peer.color }"
                />
                <span class="text-zinc-300 truncate flex-1">{{ peer.name }}</span>
                <span class="text-zinc-500">{{ peer.role }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Disconnected State -->
        <div v-else>
          <!-- Tabs -->
          <div class="flex border-b border-zinc-700">
            <button
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'host' 
                ? 'text-white border-b-2 border-blue-500' 
                : 'text-zinc-400 hover:text-zinc-300'"
              @click="activeTab = 'host'"
            >
              Host Session
            </button>
            <button
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'join' 
                ? 'text-white border-b-2 border-blue-500' 
                : 'text-zinc-400 hover:text-zinc-300'"
              @click="activeTab = 'join'"
            >
              Join Session
            </button>
          </div>

          <div class="p-4">
            <!-- Host Tab -->
            <div
              v-if="activeTab === 'host'"
              class="space-y-3"
            >
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Your Name</label>
                <input
                  v-model="userName"
                  type="text"
                  placeholder="Enter your name"
                  class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                >
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Session Name</label>
                <input
                  v-model="sessionName"
                  type="text"
                  placeholder="My Book Project"
                  class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                >
              </div>
              <button
                :disabled="isLoading || !userName.trim() || !sessionName.trim()"
                class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                @click="handleCreateSession"
              >
                {{ isLoading ? 'Creating...' : 'Create Session' }}
              </button>
            </div>

            <!-- Join Tab -->
            <div
              v-if="activeTab === 'join'"
              class="space-y-3"
            >
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Your Name</label>
                <input
                  v-model="userName"
                  type="text"
                  placeholder="Enter your name"
                  class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                >
              </div>
              <div>
                <label class="block text-xs text-zinc-400 mb-1">Invite Link</label>
                <input
                  v-model="joinLink"
                  type="text"
                  placeholder="rook://sync/..."
                  class="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                >
              </div>
              <button
                :disabled="isLoading || !userName.trim() || !joinLink.trim()"
                class="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                @click="handleJoinSession"
              >
                {{ isLoading ? 'Joining...' : 'Join Session' }}
              </button>
            </div>

            <!-- Error -->
            <div
              v-if="error"
              class="mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded text-xs text-red-400"
            >
              {{ error }}
            </div>

            <!-- Status -->
            <div
              v-if="statusMessage && !error"
              class="mt-3 text-xs text-zinc-400 text-center"
            >
              {{ statusMessage }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
