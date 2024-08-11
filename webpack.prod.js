import config from './webpack.config.js';

export default Object.assign(config, {
  devtool: false,
  mode: 'production'
});
