/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: {
          DEFAULT: '#090C10',
          50: '#1c222d',
          100: '#161b24',
          200: '#12161e',
          300: '#0f141c',
          400: '#0d1117',
          500: '#090c10',
        },
        console: {
          surface: '#0E131B',
          elevated: '#141A24',
          highlight: '#1C2331',
          border: '#1E2633',
        },
        emerald: {
          clinical: '#10B981',
          muted: '#047857',
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.035em',
        kicker: '0.12em',
      },
      gridTemplateColumns: {
        '24': 'repeat(24, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};
