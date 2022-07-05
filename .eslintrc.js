module.exports = {
  env: {
    browser: false,
    es2021: true,
    mocha: true,
    node: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "standard",
    "plugin:prettier/recommended",
    "plugin:node/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
  },
  rules: {
    camelcase: ["error", { allow: ["__factory"] }],
    "node/no-extraneous-import": [
      "error",
      {
        allowModules: ["@ethereum-waffle/mock-contract"],
      },
    ],
    "node/no-unsupported-features/es-syntax": [
      "error",
      { ignores: ["modules"] },
    ],
    "node/no-unpublished-import": [
      "error",
      {
        allowModules: ["chai", "@nomiclabs/hardhat-ethers", "ethers"],
      },
    ],
    "node/no-missing-import": [
      "error",
      {
        allowModules: [],
        resolvePaths: ["./src"],
        tryExtensions: [".js", ".json", ".node", ".ts"],
      },
    ],
  },
};
