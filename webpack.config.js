const path = require('path');
const NodeExternals = require('webpack-node-externals');
const Merge = require('webpack-merge');

const config = {
	mode: 'development',
	entry: './source/Main.js',
	target: 'web',
	devtool: 'inline-source-map',
	externals: [NodeExternals()],
	module: {
		rules: [
			{
				test: /\.glsl$/i,
				use: 'raw-loader'
			}
		]
	},
	resolve: {extensions: ['.js']}
};


module.exports = [
	Object.assign({
		output: {
			filename: 'potree.module.js',
			path: path.resolve(__dirname, 'dist'),
			sourceMapFilename: '[name].map',
			libraryTarget: 'commonjs'
		}
	}, config),
	Object.assign({
		output: {
			filename: 'potree.js',
			path: path.resolve(__dirname, 'dist'),
			sourceMapFilename: '[name].map',
			libraryTarget: 'umd'
		}
	}, config)
];
