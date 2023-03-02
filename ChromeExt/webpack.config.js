/* global __dirname:readonly (for ESLint) */
const { join } = require('path')
const { makeBaseConfig } = require(join(__dirname, 'webpack.base.config.js'))
const config = makeBaseConfig()
module.exports = config

config.entry.contentscript = join(__dirname, 'src/contentscript/contentscript.ts')
config.entry.background = join(__dirname, 'src/background/background.ts')
