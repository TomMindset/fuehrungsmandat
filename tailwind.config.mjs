/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      colors: {
        paper: "#fdfaf4",
        chalk: "#fffdf8",
        linen: "#f4efe5",
        graphite: "#06284a",
        ink: "#021b33",
        slategraph: "#2b3948",
        petrol: "#0b355c",
        copper: "#a1843d",
        mist: "#d8c9a4"
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif"
        ],
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"]
      },
      boxShadow: {
        quiet: "0 24px 80px rgba(2, 27, 51, 0.08)"
      }
    }
  }
};
