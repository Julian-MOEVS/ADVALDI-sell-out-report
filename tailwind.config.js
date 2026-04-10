/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#f5f7fa',
        bg2: '#ffffff',
        bg3: '#eef2f7',
        bg4: '#e2e8f0',
        accent: '#2563eb',
        'accent-light': '#60a5fa',
        'accent-dark': '#1e3a5f',
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
        info: '#2563eb',
        dark: '#1d1d1d',
        'nl-blue': '#2563eb',
        'be-amber': '#d97706',
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
        mono: ['Montserrat', 'sans-serif'],
      },
      borderRadius: {
        xl: '20px',
        '2xl': '25px',
        '3xl': '30px',
      },
    },
  },
  plugins: [],
};
