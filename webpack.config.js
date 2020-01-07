const path = require('path');
//const PeerDepsExternalsPlugin = require('peer-deps-externals-webpack-plugin');

function resolve(name) {
  return path.resolve(__dirname, name);
}

module.exports = {
  mode: 'development',
  entry: "./source/Main.js",
  module: {
    rules: [
      {
        test: /Worker\.js$/,
        loader: 'worker-loader',
        include: [resolve('source')],
        options: { inline: true, fallback: false },
      },
    ],
  },
  resolve: {
    extensions: [ '.js' ],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    sourceMapFilename: '[name].map',
    libraryTarget: 'commonjs',
  },
  devtool: 'inline-source-map',
  externals: {
    three: {
      commonjs: 'three',
      amd: 'three',
      root: '_',
    },
  },
  plugins: [
    //new PeerDepsExternalsPlugin(),
  ],
};
