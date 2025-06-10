const path = require('path');
const { merge } = require('webpack-merge');
const { WebpackManifestPlugin } = require('webpack-manifest-plugin');
const { defineReactCompilerLoaderOption, reactCompilerLoader } = require('react-compiler-webpack');
const { commonConfig } = require('./common');

const cwd = process.cwd();

module.exports = merge(commonConfig, {
  target: 'web',
  entry: {
    webview: path.resolve(cwd, 'src/webview/index.ts'),
  },
  output: {
    path: path.resolve(cwd, 'dist/webview'),
    filename: '[name].js',
    crossOriginLoading: 'anonymous',
  },
  module: {
    rules: [
      {
        test: /\.[mc]?[jt]sx?$/i,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: 'defaults' }],
                ['@babel/preset-react'],
                [
                  '@babel/preset-typescript',
                  {
                    allowDeclareFields: true,
                    onlyRemoveTypeImports: true,
                  },
                ],
              ],
            },
          },
          {
            loader: reactCompilerLoader,
            options: defineReactCompilerLoaderOption({
              // React Compiler options goes here
            }),
          },
        ],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: '[name].[hash][ext]',
        },
      },
    ],
  },
  plugins: [new WebpackManifestPlugin({ publicPath: '' })],
  devServer: {
    compress: true,
    port: 9000,
    hot: true,
    allowedHosts: 'all',
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
});
