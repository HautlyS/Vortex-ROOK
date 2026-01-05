// PNG Export Service - Renders pages to PNG images
import type { PageData, LayerObject } from './types';

/**
 * Render a single page to PNG blob
 */
export async function renderPageToPng(
  page: PageData,
  scale: number = 2.0,
  quality: number = 0.92
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = page.width * scale;
  canvas.height = page.height * scale;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  
  // Sort layers by zIndex
  const sortedLayers = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
  
  for (const layer of sortedLayers) {
    if (!layer.visible) continue;
    ctx.globalAlpha = layer.opacity;
    await renderLayer(ctx, layer);
  }
  
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Failed to create PNG')),
      'image/png',
      quality
    );
  });
}

/**
 * Render a layer to canvas context
 */
async function renderLayer(ctx: CanvasRenderingContext2D, layer: LayerObject): Promise<void> {
  switch (layer.type) {
    case 'text':
      renderTextLayer(ctx, layer);
      break;
    case 'image':
      await renderImageLayer(ctx, layer);
      break;
    case 'shape':
      renderShapeLayer(ctx, layer);
      break;
    case 'vector':
      renderVectorLayer(ctx, layer);
      break;
  }
}

function renderTextLayer(ctx: CanvasRenderingContext2D, layer: LayerObject): void {
  if (!layer.content) return;
  
  const { bounds } = layer;
  ctx.save();
  
  const fontStyle = layer.fontStyle === 'italic' ? 'italic ' : '';
  const fontWeight = layer.fontWeight || 400;
  const fontSize = layer.fontSize || 12;
  const fontFamily = layer.fontFamily || 'Arial';
  
  ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = layer.color || '#000000';
  ctx.textAlign = (layer.textAlign as CanvasTextAlign) || 'left';
  ctx.textBaseline = 'top';
  
  // Handle text decoration
  if (layer.textDecoration === 'underline' || layer.textDecoration === 'line-through') {
    const metrics = ctx.measureText(layer.content);
    const x = bounds.x;
    const y = layer.textDecoration === 'underline' 
      ? bounds.y + fontSize 
      : bounds.y + fontSize / 2;
    
    ctx.strokeStyle = layer.color || '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + metrics.width, y);
    ctx.stroke();
  }
  
  // Word wrap text
  const words = layer.content.split(' ');
  let line = '';
  let y = bounds.y;
  const lineHeight = fontSize * 1.2;
  
  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > bounds.width && line) {
      ctx.fillText(line, bounds.x, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, bounds.x, y);
  
  ctx.restore();
}

async function renderImageLayer(ctx: CanvasRenderingContext2D, layer: LayerObject): Promise<void> {
  const { bounds } = layer;
  const src = layer.imageUrl || layer.imagePath;
  
  if (!src) return;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, bounds.x, bounds.y, bounds.width, bounds.height);
      resolve();
    };
    img.onerror = () => resolve(); // Skip failed images
    img.src = src;
  });
}

function renderShapeLayer(ctx: CanvasRenderingContext2D, layer: LayerObject): void {
  const { bounds } = layer;
  ctx.save();
  
  ctx.fillStyle = layer.fillColor || 'transparent';
  ctx.strokeStyle = layer.strokeColor || '#000000';
  ctx.lineWidth = layer.strokeWidth || 1;
  
  switch (layer.shapeType) {
    case 'rectangle':
      if (layer.fillColor && layer.fillColor !== 'transparent') {
        ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      if (layer.strokeColor) {
        ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        bounds.width / 2,
        bounds.height / 2,
        0, 0, Math.PI * 2
      );
      if (layer.fillColor && layer.fillColor !== 'transparent') ctx.fill();
      if (layer.strokeColor) ctx.stroke();
      break;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(bounds.x, bounds.y);
      ctx.lineTo(bounds.x + bounds.width, bounds.y + bounds.height);
      ctx.stroke();
      break;
  }
  
  ctx.restore();
}

function renderVectorLayer(ctx: CanvasRenderingContext2D, layer: LayerObject): void {
  if (!layer.pathData?.commands) return;
  
  ctx.save();
  ctx.fillStyle = layer.fillColor || 'transparent';
  ctx.strokeStyle = layer.strokeColor || '#000000';
  ctx.lineWidth = layer.strokeWidth || 1;
  
  ctx.beginPath();
  for (const cmd of layer.pathData.commands) {
    switch (cmd.type) {
      case 'moveTo':
        ctx.moveTo(cmd.x || 0, cmd.y || 0);
        break;
      case 'lineTo':
        ctx.lineTo(cmd.x || 0, cmd.y || 0);
        break;
      case 'curveTo':
        ctx.bezierCurveTo(
          cmd.x1 || 0, cmd.y1 || 0,
          cmd.x2 || 0, cmd.y2 || 0,
          cmd.x || 0, cmd.y || 0
        );
        break;
      case 'closePath':
        ctx.closePath();
        break;
    }
  }
  
  if (layer.fillColor && layer.fillColor !== 'transparent') ctx.fill();
  if (layer.strokeColor) ctx.stroke();
  
  ctx.restore();
}

/**
 * Export multiple pages as PNG blobs
 */
export async function exportPagesToPng(
  pages: PageData[],
  scale: number = 2.0,
  quality: number = 0.92,
  onProgress?: (current: number, total: number) => void
): Promise<Blob[]> {
  const blobs: Blob[] = [];
  
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i + 1, pages.length);
    const blob = await renderPageToPng(pages[i], scale, quality);
    blobs.push(blob);
  }
  
  return blobs;
}
