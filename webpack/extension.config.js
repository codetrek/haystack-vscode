const path = require('path');
const { merge } = require('webpack-merge');
const { commonConfig, isProd } = require('./common');

const cwd = process.cwd();

module.exports = merge(commonConfig, {
  target: 'node',
  entry: {
    extension: path.resolve(cwd, 'src/extension.ts'),
  },
  output: {
    path: path.resolve(cwd, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'esnext',
                removeComments: isProd,
              },
              transpileOnly: true,
            },
          },
        ],
      },
    ],
  },
  externals: {
    vscode: 'commonjs vscode',
  },
});
