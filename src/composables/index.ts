export { useTypography } from './useTypography'

// Re-export bridge functions for direct use
export { 
  initTypographyBridge,
  getAvailableFonts,
  searchFonts,
  loadFont,
  validateFontSupport,
  preloadCommonFonts,
  getFontFallbackChain
} from '@/bridge/typographyBridge'
