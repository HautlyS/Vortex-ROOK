// Security utilities for input sanitization and validation

/** Sanitize URL - reject javascript: and non-image data: URLs */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return url
  const lower = url.toLowerCase().trim()
  if (lower.startsWith('javascript:')) return undefined
  if (lower.startsWith('data:') && !lower.startsWith('data:image/')) return undefined
  return url
}

/** Sanitize filename - remove dangerous characters and Windows reserved names */
export function sanitizeFilename(filename: string): string {
  // Remove dangerous characters
  let safe = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
  
  // Handle Windows reserved names
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i
  if (reserved.test(safe)) {
    safe = '_' + safe
  }
  
  return safe || 'untitled'
}

/** Clamp number to range */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Validate and clamp opacity (0-1) */
export function sanitizeOpacity(opacity: number): number {
  return clamp(opacity, 0, 1)
}

/** Validate and ensure positive dimensions */
export function sanitizeBounds(bounds: { x: number; y: number; width: number; height: number }) {
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(0, bounds.width),
    height: Math.max(0, bounds.height),
  }
}

/** Sanitize font family - escape quotes */
export function sanitizeFontFamily(fontFamily: string): string {
  return fontFamily.replace(/["'\\]/g, '')
}

/** Validate zIndex is integer */
export function sanitizeZIndex(zIndex: number): number {
  return Math.round(zIndex)
}

/** Validate font size is positive */
export function sanitizeFontSize(fontSize: number): number {
  return Math.max(1, fontSize)
}
