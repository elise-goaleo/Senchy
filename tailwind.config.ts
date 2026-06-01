import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Override emerald with the sage/forest palette ──────────────────────
        // Menthe Glacier → Verre de Plage → Sauge de Mer → Gris de Forêt → Pin de Crique
        emerald: {
          50:  "#D0DFD6", // Menthe Glacier — hover bg, chip bg
          100: "#c3d6cb", // slightly darker hover
          200: "#A7BFB2", // Verre de Plage — borders, rings
          300: "#9ab5a6",
          400: "#91AC9A", // Sauge de Mer — decorative accents
          500: "#7F9C8D", // Gris de Forêt — secondary interactive
          600: "#5F7F6F", // Pin de Crique — primary text links
          700: "#4a6b5e", // accessible primary button bg (contrast 5.3:1 on white ✓)
          800: "#3a5549",
          900: "#2a3e36", // dark mode gradient end
          950: "#1a2720",
        },
        // ── Terre d'Ombre (#C5AF70) — accent chaud pour les nuits ─────────────
        terre: {
          50:  "#f7ede7",
          100: "#edd9ce",
          200: "#e0c0ae",
          300: "#d4a68e",
          400: "#C5AF70", // Terre d'Ombre — icônes, déco
          500: "#a87863",
          600: "#8d6350",
          700: "#A4893E", // texte accessible sur fond blanc
          800: "#5e3b2a",
          900: "#422819",
        },
        primary: {
          DEFAULT: "#5F7F6F",
          50:  "#D0DFD6",
          100: "#c3d6cb",
          200: "#A7BFB2",
          300: "#9ab5a6",
          400: "#91AC9A",
          500: "#7F9C8D",
          600: "#5F7F6F",
          700: "#4a6b5e",
          800: "#3a5549",
          900: "#2a3e36",
          950: "#1a2720",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
