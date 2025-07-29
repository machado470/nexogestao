/* eslint-disable */

const tailwindcss = require('@tailwindcss/postcss');

module.exports = {
  plugins: [
    tailwindcss,
    require('autoprefixer'),
  ],
};

// This configuration file sets up PostCSS with Tailwind CSS and Autoprefixer.
