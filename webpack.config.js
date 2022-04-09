const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'development', //: 'production',
  entry: "./source/Main.js",
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /Worker\.js$/,
        loader: 'worker-loader',
        include: [path.resolve(__dirname,'source')],
        exclude: /node_modules/,
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
  devtool: 'inline-source-map'
};
