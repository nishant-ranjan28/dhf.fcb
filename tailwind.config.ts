import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        barca: {
          blue: "#004D98",
          red: "#A50044",
          gold: "#EDBB00",
        },
        fifa: {
          purple: "#6C2BD9",
        },
        live: "#E11D48",
        ink: {
          DEFAULT: "#0B0B0F",
          soft: "#15151B",
          muted: "#9CA3AF",
          line: "#23232B",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      maxWidth: {
        screen: "640px",
      },
    },
  },
  plugins: [],
};

export default config;
