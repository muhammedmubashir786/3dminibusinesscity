import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // Brand colors/typography intentionally left default —
      // Phase 1 (UX/UI) requires your brand direction before this is filled in.
    },
  },
  plugins: [],
};

export default config;
