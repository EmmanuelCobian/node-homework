const { defineConfig } = require("eslint/config");
const js = require("@eslint/js");
const globals = require("globals");

module.exports = defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    rules: {
      "no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.browser },
  },
]);
