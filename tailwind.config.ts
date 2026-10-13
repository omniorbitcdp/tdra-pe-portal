import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef4ff',100:'#dae6ff',200:'#bcd2ff',300:'#8eb3ff',400:'#5989ff',500:'#345dff',600:'#1e3ff5',700:'#172fd8',800:'#192aae',900:'#1b2a89' },
      },
    },
  },
  plugins: [],
};
export default config;
