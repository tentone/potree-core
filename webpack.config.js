import path from 'path';
import CopyWebpackPlugin from 'copy-webpack-plugin';

export default {
	entry: './source/index.ts',
	stats: {
		children: true,
	},
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
		extensions: ['.tsx', '.ts', '.js'],
	},
	plugins: [
		new CopyWebpackPlugin({
			patterns: [
				{ from: 'utils/binary-heap.d.ts', to: 'utils/binary-heap.d.ts', context: 'source' },
			],
		}),
	],
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
				test: /\.(vs|fs)$/,
				loader: 'raw-loader',
				options: {
					esModule: true,
				},
			}
		],
	},
};
