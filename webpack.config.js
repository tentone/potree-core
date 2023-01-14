import path from 'path';

export default {
  entry: './source/index.ts',
  experiments: {
    outputModule: true,
  },
  output: {
    path: path.resolve('dist'),
    filename: 'index.js',
    library: {
      type: 'module',
    },
  },
	resolve: {
		extensions: ['.ts', '.tsx', '.js', '.frag', '.vert'],
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
      {
        test: /\.(vert|frag)$/,
        loader: 'raw-loader',
        options: {
          esModule: true,
        },
      }
    ],
  },
};
