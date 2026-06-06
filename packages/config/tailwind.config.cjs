/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        epir: {
          base: '#3C5629',
          soft: '#799564',
          dark: '#0C1606',
          accent: '#432956',
          gray: '#A9A9A9',
        },
        kazka: {
          navy: '#0A1628',
          gold: '#C9A96E',
          bone: '#F5F0E6',
          'rose-gold': '#B76E79',
          emerald: '#046307',
          graphite: '#2C2C2C',
        },
      },
      fontFamily: {
        epir: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        kazka: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
