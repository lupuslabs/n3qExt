/* global __dirname:readonly (for ESLint) */
const { join } = require('path')
const { makeBaseConfig } = require(join(__dirname, 'webpack.base.config.js'))
const config = makeBaseConfig()
module.exports = config

config.entry.popup = join(__dirname, 'src/popup/popup.ts')

const HtmlWebpackPlugin = require('html-webpack-plugin');
config.plugins.push(
    new HtmlWebpackPlugin({
        filename: 'popup.html',
        title: 'Your Weblin',
    })
)
