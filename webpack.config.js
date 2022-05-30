const path = require('path');
const NodeExternals = require('webpack-node-externals');

const config = {
	mode: 'development',
	entry: './source/Main.js',
	target: 'web',
	externals: [NodeExternals(), 'three'],
	module: {
		rules: [
			{
				test: /\.(glsl|fs|vs)$/i,
				use: 'raw-loader'
			}
		]
	},
	optimization: {minimize: true},
	resolve: {extensions: ['.js']}
};


module.exports = [
	Object.assign({
		output: {
			library: 'Potree',
			libraryTarget: 'umd',
			filename: 'potree.js',
			path: path.resolve(__dirname, 'dist')
		}
	}, config)
	// Object.assign({
	// 	experiments: {outputModule: true},
	// 	output: {
	// 		libraryTarget: 'module',
	// 		filename: 'potree.module.js',
	// 		path: path.resolve(__dirname, 'dist'),
	// 		clean: false
	// 	}
	// }, config),
	// Object.assign({
	// 	experiments: {outputModule: true},
	// 	externalsType: 'module',
	// 	output: {
	// 		libraryTarget: 'commonjs',
	// 		filename: 'potree.cjs',
	// 		path: path.resolve(__dirname, 'dist'),
	// 		clean: false
	// 	}
	// }, config)
];
