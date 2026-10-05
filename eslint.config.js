import js from "@eslint/js";
import ts from "typescript-eslint";
import solid from "eslint-plugin-solid/configs/typescript";

export default ts.config(
  { ignores: ["node_modules/**", ".output/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ["src/**/*.tsx"], ...solid },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", Buffer: "readonly" },
    },
  },
);
