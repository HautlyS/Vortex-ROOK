<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';

interface Voxel {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

const props = withDefaults(defineProps<{
  colors?: string[];
  count?: number;
  speed?: number;
  size?: number;
  gravity?: number;
}>(), {
  colors: () => ['#00ff88', '#00ffff', '#ff6b9d', '#b967ff', '#fffb00'],
  count: 30,
  speed: 0.5,
  size: 6,
  gravity: 0.02
});

const canvas = ref<HTMLCanvasElement>();
let ctx: CanvasRenderingContext2D | null = null;
let animationId: number;
let voxels: Voxel[] = [];

const pixelColors = computed(() => props.colors);

function createVoxel(x?: number, y?: number): Voxel {
  const canvasEl = canvas.value!;
  return {
    x: x ?? Math.random() * canvasEl.width,
    y: y ?? Math.random() * canvasEl.height,
    z: Math.random() * 100,
    vx: (Math.random() - 0.5) * props.speed,
    vy: (Math.random() - 0.5) * props.speed - 0.5,
    vz: (Math.random() - 0.5) * 0.5,
    size: props.size + Math.random() * 4,
    color: pixelColors.value[Math.floor(Math.random() * pixelColors.value.length)],
    life: 0,
    maxLife: 100 + Math.random() * 200
  };
}

function drawVoxel(v: Voxel) {
  if (!ctx) return;
  
  const scale = (100 + v.z) / 150;
  const size = v.size * scale;
  const alpha = Math.min(1, (v.maxLife - v.life) / 50);
  
  ctx.globalAlpha = alpha;
  
  // Top face (lighter)
  ctx.fillStyle = v.color;
  ctx.fillRect(
    Math.floor(v.x - size / 2),
    Math.floor(v.y - size / 2 - size * 0.3),
    Math.floor(size),
    Math.floor(size * 0.5)
  );
  
  // Front face
  ctx.fillStyle = v.color + 'cc';
  ctx.fillRect(
    Math.floor(v.x - size / 2),
    Math.floor(v.y - size * 0.3),
    Math.floor(size),
    Math.floor(size)
  );
  
  // Right face (darker)
  ctx.fillStyle = v.color + '88';
  ctx.fillRect(
    Math.floor(v.x + size / 2),
    Math.floor(v.y - size * 0.3),
    Math.floor(size * 0.4),
    Math.floor(size)
  );
  
  ctx.globalAlpha = 1;
}

function update() {
  if (!ctx || !canvas.value) return;
  
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height);
  
  voxels = voxels.filter(v => v.life < v.maxLife);
  
  while (voxels.length < props.count) {
    voxels.push(createVoxel());
  }
  
  voxels.forEach(v => {
    v.x += v.vx;
    v.y += v.vy;
    v.z += v.vz;
    v.vy += props.gravity;
    v.life++;
    
    // Wrap around
    if (v.x < 0) v.x = canvas.value!.width;
    if (v.x > canvas.value!.width) v.x = 0;
    if (v.y > canvas.value!.height + 20) {
      v.y = -20;
      v.vy = Math.random() * props.speed;
    }
    
    drawVoxel(v);
  });
  
  animationId = requestAnimationFrame(update);
}

function resize() {
  if (!canvas.value) return;
  canvas.value.width = canvas.value.offsetWidth;
  canvas.value.height = canvas.value.offsetHeight;
}

onMounted(() => {
  if (!canvas.value) return;
  ctx = canvas.value.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  update();
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', resize);
});
</script>

<template>
  <canvas
    ref="canvas"
    class="absolute inset-0 w-full h-full pointer-events-none"
    style="image-rendering: pixelated"
  />
</template>
