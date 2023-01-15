import path from 'path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import config from './webpack.config.js';

export default {
	context: path.resolve('./example'),
	entry: './main.ts',
	output: {
		filename: 'example.bundle.js',
		path: path.resolve('build'),
	},
	devtool: 'source-map',
	devServer: {
		compress: true,
		port: 5000,
	},
	resolve: {
		extensions: ['.ts', '.tsx', '.js'],
	},
	module: {
		rules: config.module.rules.concat([
			{
				test: /\.html$/,
				use: [
					{
						loader: 'html-loader',
						options: { minimize: true },
					},
				],
			},
			{
				test: /\.css$/,
				use: ['style-loader', 'css-loader'],
			},
		]),
	},
	plugins: [new HtmlWebpackPlugin()],
};
