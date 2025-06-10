const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

// Is production environment
const isProd = process.env.NODE_ENV === 'production';
// Is analyze mode
const isAnalyze = process.argv.includes('--analyze');
const cwd = process.cwd();

module.exports.isProd = isProd;

module.exports.commonConfig = {
  mode: isProd ? 'production' : 'development',
  devtool: isProd ? 'hidden-source-map' : 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.css'],
    modules: [path.resolve(cwd, 'src'), 'node_modules'],
    mainFields: ['module', 'main'],
    alias: {
      '@': path.resolve(cwd, 'src'),
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
      'process.env.IS_PROD': JSON.stringify(isProd),
    }),
    ...(isAnalyze ? [new BundleAnalyzerPlugin()] : []),
  ],
  optimization: {
    minimize: isProd,
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          ecma: 2020,
          compress: {
            drop_console: isProd,
            drop_debugger: true,
            pure_funcs: [],
            passes: 3,
            keep_infinity: true,
            unsafe: true,
            unsafe_math: true,
            unsafe_methods: true,
          },
          format: {
            comments: false,
            ascii_only: true,
          },
          mangle: {
            safari10: true,
          },
        },
        extractComments: false,
      }),
    ],
    splitChunks: isProd
      ? {
          chunks: 'all',
          minSize: 20000,
          maxSize: 250000,
          minChunks: 1,
          maxAsyncRequests: 30,
          maxInitialRequests: 30,
          automaticNameDelimiter: '~',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name(module) {
                const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
                return `vendor.${packageName.replace('@', '')}`;
              },
              priority: -10,
            },
            common: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
          },
        }
      : false,
    usedExports: true,
    moduleIds: 'deterministic',
    chunkIds: 'deterministic',
  },
  performance: {
    hints: false,
  },
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
};
