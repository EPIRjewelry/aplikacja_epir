/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@epir/config/tailwind')],
  content: ['./app/**/*.{js,ts,jsx,tsx}', '../../packages/ui/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'Times New Roman', 'serif'],
        kazka: ['"Cormorant Garamond"', 'Georgia', 'Times New Roman', 'serif'],
      },
    },
  },
};
