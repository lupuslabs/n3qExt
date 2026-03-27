import { join } from 'path'
import rspack from '@rspack/core'
import { makeBaseConfig } from './rspack.base.config.mjs'

export default (_env, argv) => {
    const config = makeBaseConfig(argv.mode)
    config.entry.embedded = join(import.meta.dirname, 'src/embedded/embedded.ts')
    config.plugins.push(
        new rspack.HtmlRspackPlugin({
            filename: 'embedded.html',
            title: 'weblin.io Embedded Demo',
        })
    )
    return config
}
