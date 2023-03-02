/* global __dirname:readonly (for ESLint) */
const { join } = require('path')
const { makeBaseConfig } = require(join(__dirname, 'webpack.base.config.js'))
const config = makeBaseConfig()
module.exports = config

config.entry.embedded = join(__dirname, 'src/embedded/embedded.ts')

const HtmlWebpackPlugin = require('html-webpack-plugin');
config.plugins.push(
    new HtmlWebpackPlugin({
        filename: 'embedded.html',
        title: 'weblin.io Embedded Demo',
    })
)
