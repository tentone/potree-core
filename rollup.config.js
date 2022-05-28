import strip from '@rollup/plugin-strip';

export default {
	input: 'source/Potree.js',
	external: ['three'],
	plugins: [
		strip({functions: ['assert.*', 'debug', 'alert', 'console.*']})
	],
	output: [
		{
			format: 'es',
			file: 'build/potree.module.js',
			indent: '\t'
		},
		{
			format: 'cjs',
			name: 'Geo',
			file: 'build/potree.cjs',
			indent: '\t'
		},
		{
			globals: {three: 'THREE'},
			format: 'umd',
			name: 'Geo',
			file: 'build/potree.js',
			indent: '\t'
		}
	]
};
