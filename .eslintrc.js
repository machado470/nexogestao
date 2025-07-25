module.exports = {
  env: {
    browser: true,
HEAD
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

    es2021: true,
  },
e29dd900d596d3914769d4e7096c21a4241dbf29
  extends: ['eslint:recommended', 'plugin:react/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['react'],
  rules: {
 HEAD
    'no-undef': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-empty': 'off',

    // pode adicionar regras aqui depois
 e29dd900d596d3914769d4e7096c21a4241dbf29
  },
};
