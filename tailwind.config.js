/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      'xs': '375px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
      // Mobile-first breakpoints
      'mobile': { max: '639px' },
      'tablet': { min: '640px', max: '1023px' },
      'desktop': { min: '1024px' },
      // Touch device detection via media query
      'touch': { raw: '(hover: none)' },
      'pointer': { raw: '(hover: hover)' },
      // Orientation
      'portrait': { raw: '(orientation: portrait)' },
      'landscape': { raw: '(orientation: landscape)' },
    },
    extend: {
      colors: {
        dark: {
          950: '#030305',
          900: '#070709',
          850: '#0a0a0e',
          800: '#0e0e14',
          700: '#14141c',
          600: '#1c1c26',
          500: '#262632',
        },
        glass: {
          subtle: 'rgba(255,255,255,0.02)',
          light: 'rgba(255,255,255,0.04)',
          DEFAULT: 'rgba(255,255,255,0.06)',
          medium: 'rgba(255,255,255,0.08)',
          strong: 'rgba(255,255,255,0.12)',
          bright: 'rgba(255,255,255,0.16)',
        },
        accent: {
          violet: '#a78bfa',
          purple: '#c084fc',
          fuchsia: '#e879f9',
          pink: '#f472b6',
          cyan: '#67e8f9',
          mint: '#6ee7b7',
          teal: '#2dd4bf',
          rose: '#fb7185',
          amber: '#fbbf24',
          emerald: '#34d399',
        },
        glow: {
          violet: 'rgba(167,139,250,0.5)',
          cyan: 'rgba(103,232,249,0.5)',
          fuchsia: 'rgba(232,121,249,0.5)',
          pink: 'rgba(244,114,182,0.5)',
        }
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '24px',
        '3xl': '40px',
        '4xl': '64px',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        'glass-lg': '0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-xl': '0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glow-sm': '0 0 20px rgba(139,92,246,0.25)',
        'glow': '0 0 30px rgba(139,92,246,0.35)',
        'glow-lg': '0 0 50px rgba(139,92,246,0.45)',
        'glow-xl': '0 0 80px rgba(139,92,246,0.5)',
        'glow-cyan': '0 0 30px rgba(34,211,238,0.35)',
        'glow-fuchsia': '0 0 30px rgba(217,70,239,0.35)',
        'inner-glow': 'inset 0 1px 1px rgba(255,255,255,0.08)',
        'inner-glow-lg': 'inset 0 2px 4px rgba(255,255,255,0.1)',
        'ambient': '0 0 120px 40px rgba(139,92,246,0.08)',
        'float': '0 20px 40px -10px rgba(0,0,0,0.5)',
        'float-lg': '0 30px 60px -15px rgba(0,0,0,0.6)',
        // Mobile shadows (lighter for performance)
        'mobile': '0 4px 12px rgba(0,0,0,0.3)',
        'mobile-lg': '0 8px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'glow-breathe': 'glow-breathe 4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'liquid': 'liquid 8s ease-in-out infinite',
        'morph': 'morph 8s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-up': 'fade-up 0.4s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-left': 'slide-left 0.3s ease-out',
        'slide-right': 'slide-right 0.3s ease-out',
        'bounce-soft': 'bounce-soft 0.5s ease-out',
        'ripple': 'ripple 0.6s ease-out',
        'spin-slow': 'spin 3s linear infinite',
        'gradient-shift': 'gradient-shift 8s ease infinite',
        // Mobile drawer animations
        'drawer-up': 'drawer-up 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'drawer-down': 'drawer-down 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'drawer-left': 'drawer-left 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        'drawer-right': 'drawer-right 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139,92,246,0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(139,92,246,0.4)' },
        },
        'glow-breathe': {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.05)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'liquid': {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '50%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
        },
        'morph': {
          '0%, 100%': { borderRadius: '40% 60% 60% 40% / 60% 30% 70% 40%' },
          '50%': { borderRadius: '60% 40% 30% 70% / 40% 60% 40% 60%' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-left': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-right': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'bounce-soft': {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        'ripple': {
          '0%': { transform: 'scale(0)', opacity: '0.5' },
          '100%': { transform: 'scale(4)', opacity: '0' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        // Mobile drawer keyframes
        'drawer-up': {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'drawer-down': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        'drawer-left': {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'drawer-right': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      transitionTimingFunction: {
        'bounce-in': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'smooth-out': 'cubic-bezier(0, 0, 0.2, 1)',
        'smooth-in': 'cubic-bezier(0.4, 0, 1, 1)',
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        'ios': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'mesh-gradient': 'radial-gradient(at 40% 20%, rgba(139,92,246,0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgba(34,211,238,0.1) 0px, transparent 50%), radial-gradient(at 0% 50%, rgba(217,70,239,0.1) 0px, transparent 50%)',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
        // Safe area insets for mobile
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
      // Mobile-specific heights
      height: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        'mobile-nav': '3.5rem',
        'mobile-toolbar': '3rem',
      },
      minHeight: {
        'touch': '44px', // Minimum touch target size
      },
      maxHeight: {
        'drawer': '85vh',
        'drawer-sm': '50vh',
      },
    },
  },
  plugins: [],
}
