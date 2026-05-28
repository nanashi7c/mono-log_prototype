import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7fb",
          100: "#e7ecf5",
          500: "#4a6cf7",
          600: "#3854d3",
          700: "#2b41a8",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
