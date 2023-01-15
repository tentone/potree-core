import config from './webpack.config.js';

export default Object.assign(config, {
  devtool: false,
  // stats: 'normal',
  mode: 'production'
});
