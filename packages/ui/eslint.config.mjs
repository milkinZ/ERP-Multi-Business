import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    ignores: ["src/button.js", "src/card.js", "src/code.js"],
  },
];
