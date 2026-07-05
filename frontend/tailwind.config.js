/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    screens: { 'xs':'375px','sm':'640px','md':'768px','lg':'1024px','xl':'1280px','2xl':'1536px' },
    extend: {
      colors: {
        primary: { DEFAULT:'var(--color-primary)', dark:'var(--color-primary-dark)', light:'var(--color-primary-light)' },
        accent:  { DEFAULT:'var(--color-accent)' },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        body:    ['var(--font-body)'],
        mono:    ['var(--font-mono)'],
      },
      borderRadius: {
        '2xl':'16px','3xl':'24px','4xl':'32px',
      },
      transitionTimingFunction: {
        'out-expo':     'cubic-bezier(0.16, 1, 0.3, 1)',
        'in-out-quart': 'cubic-bezier(0.76, 0, 0.24, 1)',
        'bounce':       'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      backdropBlur: { xs:'2px', '2xl':'40px' },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-top':    'env(safe-area-inset-top)',
      },
    },
  },
  plugins: [],
};
