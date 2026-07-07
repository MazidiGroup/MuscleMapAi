// Muscle Map Ai Design Tokens
export const COLORS = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1C1C1C',
  surfaceHigh: '#222226',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  primary: '#0A84FF',
  primaryHover: '#0070E0',
  primaryGlow: 'rgba(10,132,255,0.18)',
  success: '#34D399',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  textQuaternary: '#52525B',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
};

export const FONT = {
  // SF Pro is system on iOS; fallback to System on Android
  size: { xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24, '2xl': 28, '3xl': 34, '4xl': 40 },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const IMAGES = {
  hero: 'https://images.unsplash.com/photo-1597773150796-e5c14ebecbf5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTJ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBlbGVjdHJpYyUyMGJsdWUlMjB0ZXh0dXJlfGVufDB8fHx8MTc4MjY2NzMxMHww&ixlib=rb-4.1.0&q=85',
  workoutMale: 'https://images.pexels.com/photos/11433060/pexels-photo-11433060.jpeg',
  workoutFemale: 'https://images.pexels.com/photos/13219986/pexels-photo-13219986.jpeg',
  barbell: 'https://images.pexels.com/photos/6389516/pexels-photo-6389516.jpeg',
};
