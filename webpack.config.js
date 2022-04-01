const path = require('path');
const nodeExternals = require('webpack-node-externals');

function resolve(name) {
  return path.resolve(__dirname, name);
}

/*
 * Set args on the command line using
 * ```bash
 * webpack --env.argname=value
 * ```
 */
function getEnvArg(env, name, defaultValue) {
  if (env === undefined) {
    return defaultValue;
  }
  if (env[name] === undefined) {
    return defaultValue;
  }
  if (env[name] === "true") {
    return true;
  }
  if (env[name] === "false") {
    return false;
  }
  return typeof env[name] === "string" ? env[name].trim() : env[name];
}

const isDevelopment = getEnvArg(process.env, 'development', false);

module.exports = {
  mode: isDevelopment ? 'development' : 'production',
  entry: "./source/Main.js",
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /Worker\.js$/,
        loader: 'worker-loader',
        include: [resolve('source')],
        exclude: /node_modules/,
        options: { inline: true, fallback: false },
      },
    ],
  },
  resolve: {
    extensions: [ '.js' ],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    sourceMapFilename: '[name].map',
    libraryTarget: 'commonjs',
  },
  devtool: isDevelopment ? 'inline-source-map' : 'source-map'
};
