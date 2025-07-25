module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  globals: {
    process: 'readonly',
    require: 'readonly',
    module: 'readonly',
    __dirname: 'readonly',
    setImmediate: 'readonly',
    Deno: 'readonly',
  },
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react'],
  rules: {
    'no-undef': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-empty': 'off',
  },
};
