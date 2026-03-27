import { join } from 'path'
import rspack from '@rspack/core'
import { makeBaseConfig } from './rspack.base.config.mjs'

const config = makeBaseConfig()

config.mode = 'development'

config.entry.test = join(import.meta.dirname, 'src/test/test.ts')
config.output.publicPath = '.'

config.plugins.push(
    new rspack.HtmlRspackPlugin({
        filename: 'test.html',
        title: 'Unit Tests',
    })
)

export default config
