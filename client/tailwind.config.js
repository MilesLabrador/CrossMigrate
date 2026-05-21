/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0f1117',
        card: '#1e2130',
        cardalt: '#252a3d',
        edge: '#3a4060',
        source: '#22c55e',
        transform: '#64748b',
        destination: '#f43f5e',
      },
      boxShadow: {
        node: '0 4px 14px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
      },
      keyframes: {
        scaleIn: {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'scale-in': 'scaleIn 160ms ease-out',
        'slide-in-right': 'slideInRight 200ms ease-out',
      },
    },
  },
  plugins: [],
};
