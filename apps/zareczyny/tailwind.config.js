/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@epir/config/tailwind')],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    '../../packages/ui/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['Della Respira', 'serif'],
        heading: ['Donegal One', 'serif'],
      },
    },
  },
};
