const path = require('path');
const NodeExternals = require('webpack-node-externals');

const config = {
	mode: 'development',
	entry: './source/Main.js',
	target: 'web',
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
			library: {
				name: 'Potree',
				type: 'umd'
			},
			filename: 'potree.js',
			path: path.resolve(__dirname, 'dist')
		}
	}, config),
	Object.assign({
		experiments: {outputModule: true},
		output: {
			library: {
				name: 'Potree',
				type: 'module'
			},
			filename: 'potree.module.js',
			path: path.resolve(__dirname, 'dist')
		}
	}, config),
	Object.assign({
		experiments: {outputModule: true},
		output: {
			library: {
				name: 'Potree',
				type: 'commonjs'
			},
			filename: 'potree.cjs',
			path: path.resolve(__dirname, 'dist')
		}
	}, config)
];
