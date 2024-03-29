﻿/* global process:readonly, __dirname:readonly (for ESLint) */
function makeBaseConfig() {
    const { optimize, ProvidePlugin } = require('webpack')
    const { join } = require('path')
    const NodePolyfillPlugin = require('node-polyfill-webpack-plugin')
    const MiniCssExtractPlugin = require('mini-css-extract-plugin')
    const WebpackShellPluginNext = require('webpack-shell-plugin-next')

    const prodPlugins = []
    if (process.env.NODE_ENV === 'production') {
        prodPlugins.push(
            new optimize.AggressiveMergingPlugin()
        )
    }

    const outputDirChrome = join(__dirname, 'dist')
    const outputDirFirefox = join(__dirname, 'dist-firefox')

    return {
        mode: process.env.NODE_ENV,

        // https://webpack.js.org/configuration/devtool/
        // eval-source-map is recommended for development (original code for each module in source map) - but eval leads to problems with content security policies.
        //
        // undefined is recommended for production (no source maps).
        devtool: (process.env.NODE_ENV === 'development') ? 'inline-source-map' : undefined,

        entry: {},
        output: {
            publicPath: '/',
            path: outputDirChrome,
            filename: '[name].js',
        },
        module: {
            rules: [
                {
                    exclude: /node_modules/,
                    test: /\.ts?$/,
                    loader: 'ts-loader',
                },
                {
                    // This compiles SASS to CSS and reextracts it into individual
                    // files named after the TypeScript files importing it:
                    test: /\.(scss|css)$/,
                    use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
                },
                {
                    // This allows
                    // background: url(../assets/icons/ci-close-small.svg);
                    // to work in CSS:
                    test: /\.(png|jpg|gif|svg|mp3)$/,
                    type: 'asset/inline',
                },
            ],
        },
        plugins: [
            new NodePolyfillPlugin(),
            new MiniCssExtractPlugin(),
            /* Use the ProvidePlugin constructor to inject jquery implicit globals */
            new ProvidePlugin({
                $: 'jquery',
                jQuery: 'jquery',
                'window.jQuery': 'jquery',
                'window.$': 'jquery'
            }),
            ...prodPlugins,
            new WebpackShellPluginNext({
                dev: false, // Scripts are only executed after first compilation when this is true.
                logging: false,
                onBuildExit: {
                    scripts: [`shx cp -u -- "${outputDirChrome}/*.{js,html,css,txt}" "${outputDirFirefox}"`],
                    parallel: false,
                    blocking: true,
                },
            }),
        ],
        resolve: {
            extensions: ['.ts', '.js', '.scss'],
        },
        performance: {
            hints: false,
        },
        stats: 'errors-warnings',
    }
}

module.exports = {
    makeBaseConfig: makeBaseConfig,
}
