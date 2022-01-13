const nodeExternals = require('webpack-node-externals');
const package = require('./package.json');
const path = require('path');
const webpack = require('webpack');

function resolve(name) {
  return path.resolve(__dirname, name);
}

module.exports = {
  entry: path.resolve(__dirname, 'src/Main.js'),
  devtool: 'inline-source-map',
  mode: 'production',

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    library: {
      type: 'commonjs2'
    }
  },

  resolve: {
    extensions: ['.js']
  },

  module: {
    rules: [
      {
        test: /Worker\.js$/,
        loader: 'worker-loader',
        include: [resolve('src')],
        options: {
          inline: 'no-fallback',
          publicPath: '/workers/'
        },
      },
    ],
  },

  plugins: [
    new webpack.DefinePlugin({
      __VERSION__: JSON.stringify(package.version),
    }),
    new webpack.container.ModuleFederationPlugin({
      name: 'potree-core',
      shared: {
        'three': {
          singleton: true,
          eager: true,
          strictVersion: false,
          requiredVersion: package.peerDependencies['three'],
        },
      }
    }),
  ],

  externalsPresets: { node: true },
  externals: [nodeExternals()],

  stats: {
    children: true,
  },

};
