import baseConfig from './webpack.config.js';

export default Object.assign(baseConfig, {
  devtool: false,
  stats: 'normal',
  mode: 'production',
  plugins: [
    ...baseConfig.plugins,
  ],
});
