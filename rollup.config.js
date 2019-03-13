import strip from "rollup-plugin-strip";

export default {
	input: "source/Main.js",
	plugins: [
		strip(
		{
			functions: ["console.*", "assert.*", "debug", "alert"],
			debugger: false,
			sourceMap: false
		})
	],
	output: [
		{
			format: "umd",
			name: "Potree",
			file: "build/potree.js",
			indent: "\t"
		},
		{
			format: "es",
			file: "build/potree.module.js",
			indent: "\t"
		}
	]
};
