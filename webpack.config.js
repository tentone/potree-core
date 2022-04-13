const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
	mode: 'development',
	entry: "./source/Main.js",
	target: "web",
	devtool: "inline-source-map",
	externals: [nodeExternals()],
	module: {
		rules: [
			{
				test: /\.glsl$/i,
				use: "raw-loader"
			}
		]
	},
	resolve: {extensions: ['.js']},
	output: {
		filename: 'bundle.js',
		path: path.resolve(__dirname, 'dist'),
		sourceMapFilename: '[name].map',
		libraryTarget: 'commonjs'
	}
};
