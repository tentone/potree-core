const path = require('path');

module.exports = {
  entry: './source/index.ts',
  experiments: {
    outputModule: true,
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: {
      type: 'module',
    },
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
  },
  plugins: [],
  externals: ['three'],
  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        loader: 'worker-loader',
        options: {inline: 'no-fallback'},
      },
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
      {test: /\.(vs|fs|glsl|vert|frag)$/, loader: 'raw-loader'},
    ],
  },
};
