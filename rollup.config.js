export default {
	input: "source/Main.js",
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
