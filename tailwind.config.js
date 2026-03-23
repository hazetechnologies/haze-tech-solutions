/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#020817',
        surface: '#0F172A',
        'surface-2': '#1E293B',
        primary: '#00D4FF',
        secondary: '#8B5CF6',
        muted: '#94A3B8',
        'text-main': '#F1F5F9',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out 2s infinite',
        'float-slow': 'float 8s ease-in-out 1s infinite',
        'pulse-slow': 'pulse 4s ease-in-out infinite',
        'grid-drift': 'gridDrift 25s linear infinite',
        'gradient-shift': 'gradientShift 8s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-20px) rotate(3deg)' },
        },
        gridDrift: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '60px 60px' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 212, 255, 0.4), 0 0 40px rgba(0, 212, 255, 0.1)',
        'glow-cyan-sm': '0 0 10px rgba(0, 212, 255, 0.3)',
        'glow-violet': '0 0 20px rgba(139, 92, 246, 0.4), 0 0 40px rgba(139, 92, 246, 0.1)',
        'glow-violet-sm': '0 0 10px rgba(139, 92, 246, 0.3)',
        'card-hover': '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 212, 255, 0.15)',
      },
    },
  },
  plugins: [],
}
