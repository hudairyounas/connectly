/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        app: {
          bg: '#F7F8FC',
          surface: '#FFFFFF',
          text: '#182230',
          muted: '#667085',
          accent: '#6C63FF',
          'accent-hover': '#574DE0',
          'accent-soft': '#EEEDFF',
          success: '#16A34A',
          border: '#E7EAF0',
          incoming: '#F0F2F7',
          outgoing: '#6C63FF',
          'dark-bg': '#0B0F19',
          'dark-surface': '#111827',
          'dark-elevated': '#1E293B',
          'dark-text': '#F3F4F6',
          'dark-muted': '#94A3B8',
          'dark-border': '#1F2937',
        },
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgba(24, 34, 48, 0.05), 0 1px 2px -1px rgba(24, 34, 48, 0.04)',
        panel: '0 10px 30px -5px rgba(24, 34, 48, 0.08), 0 4px 10px -4px rgba(24, 34, 48, 0.04)',
      },
    },
  },
  plugins: [],
};
