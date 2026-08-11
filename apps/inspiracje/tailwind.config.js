/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@epir/config/tailwind')],
  content: ['./app/**/*.{js,ts,jsx,tsx}', '../../packages/ui/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Cormorant Garamond"', 'Georgia', 'Times New Roman', 'serif'],
        inspiracje: ['"Cormorant Garamond"', 'Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        epir: {
          bg: '#f1f1f1',
          cream: '#f0ebe0',
          ink: '#222222',
          muted: '#666666',
          accent: '#2c684e',
          'accent-hover': '#3c5629',
          on: '#ffffff',
        },
      },
    },
  },
};
