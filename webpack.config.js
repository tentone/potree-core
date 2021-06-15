const path = require('path');

function resolve(name) {
  return path.resolve(__dirname, name);
}

const isDevelopment = process.env.NODE_ENV === 'development'

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
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
  devtool: isDevelopment ? 'inline-source-map' : false,
  externals: {
    three: {
      commonjs: 'three',
      amd: 'three',
      root: '_',
    },
  },
};
