import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", ".wrangler/"] },
  js.configs.recommended,
  {
    files: ["public/js/**/*.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.browser },
  },
  {
    files: ["public/sw.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "script", globals: globals.serviceworker },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.node },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-implicit-globals": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-restricted-properties": [
        "error",
        { property: "outerHTML", message: "Use setHTML() from ui.js." },
        { property: "insertAdjacentHTML", message: "Use setHTML() from ui.js." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']:not([right.callee.property.name='createHTML'])",
          message: "Never assign innerHTML directly. Use setHTML(el, html`…`) so values are escaped.",
        },
        { selector: "CallExpression[callee.name='confirm'], CallExpression[callee.name='alert']", message: "Use confirmDialog()/toast() from ui.js." },
      ],
    },
  },
];
