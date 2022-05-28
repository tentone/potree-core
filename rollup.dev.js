import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

export default {
	external: ['three'],
	input: 'source/Potree.js',
	plugins: [
		serve({
			open: true,
			contentBase: '.',
			verbose: true,
			openPage: '/',
			host: 'localhost',
			port: 8080
		}),
		livereload({watch: '.'})
	],
	output: [
		{
			globals: {three: 'THREE'},
			format: 'umd',
			name: 'Geo',
			file: 'build/potree.js',
			indent: '\t',
			sourcemap: true
		}
	]
};
