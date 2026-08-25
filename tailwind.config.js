/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          50: "#FFFCF9",
          100: "#FBF6F1",
          200: "#F3E8DF",
        },
        ink: {
          DEFAULT: "#2A1F24",
          muted: "#7A6A70",
          faint: "#A8989E",
        },
        line: {
          DEFAULT: "#EDE3E6",
          strong: "#DCCFD4",
        },
        rose: {
          50: "#FBF0F3",
          100: "#F4D9E1",
          200: "#E7B3C2",
          300: "#D4849A",
          400: "#C45C7A",
          500: "#9B2C4D",
          600: "#7E2340",
          700: "#6B1D36",
          800: "#4A1426",
        },
        gold: {
          DEFAULT: "#C4A265",
          dark: "#9A7A3E",
          light: "#E6D3A8",
        },
        success: {
          DEFAULT: "#2F6F4E",
          bg: "#E7F4EC",
        },
        warning: {
          DEFAULT: "#B7791F",
          bg: "#FBF0DC",
        },
        danger: {
          DEFAULT: "#B42318",
          bg: "#FCE8E6",
        },
      },
      fontFamily: {
        sans: [
          "Cairo",
          "IBM Plex Sans",
          "Segoe UI",
          "Tahoma",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(42, 31, 36, 0.06), 0 8px 24px rgba(42, 31, 36, 0.04)",
        pop: "0 8px 32px rgba(42, 31, 36, 0.12)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
  plugins: [],
};
