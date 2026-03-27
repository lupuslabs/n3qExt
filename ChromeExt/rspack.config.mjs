import { join } from 'path'
import { makeBaseConfig } from './rspack.base.config.mjs'

export default (_env, argv) => {
    const config = makeBaseConfig(argv.mode)
    config.entry.contentscript = join(import.meta.dirname, 'src/contentscript/contentscript.ts')
    config.entry.background = join(import.meta.dirname, 'src/background/background.ts')
    return config
}
