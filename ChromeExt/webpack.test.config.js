/* global __dirname:readonly (for ESLint) */
const { join } = require('path')
const { makeBaseConfig } = require(join(__dirname, 'webpack.base.config.js'))
const config = makeBaseConfig()
module.exports = config

config.mode = 'development'

config.entry.test = join(__dirname, 'src/test/test.ts')

const HtmlWebpackPlugin = require('html-webpack-plugin');
config.plugins.push(
    new HtmlWebpackPlugin({
        filename: 'test.html',
        title: 'Unit Tests',
    })
)
