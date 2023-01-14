const baseConfig = require('./webpack.config');

module.exports = Object.assign(baseConfig, {
  devtool: false,
  stats: 'normal',
  mode: 'production',
  plugins: [
    ...baseConfig.plugins,
  ],
});
