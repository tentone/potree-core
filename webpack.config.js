import path from 'path';

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
				test: /\.(vs|fs)$/,
				loader: 'raw-loader',
				options: {
					esModule: true,
				},
			}
		],
	},
};
