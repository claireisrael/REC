/** @type {import('tailwindcss').Config} */
const config = {
  content: ["./app/rec-scanner/**/*.{js,jsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
