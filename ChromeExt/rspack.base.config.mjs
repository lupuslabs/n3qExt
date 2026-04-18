import rspack from '@rspack/core'
import { join } from 'path'
import fs from 'fs'

const { NormalModuleReplacementPlugin, CssExtractRspackPlugin, SwcJsMinimizerRspackPlugin } = rspack

export function makeBaseConfig(mode) {
    mode ??= 'development'
    const optimization = {}
    if (mode === 'production') {
        optimization['minimizer'] = [
            new SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                    compress: { keep_classnames: true },
                    mangle: { keep_classnames: true },
                },
            }),
        ]
    }

    const outputDirChrome = join(import.meta.dirname, 'dist')
    const outputDirFirefox = join(import.meta.dirname, 'dist-firefox')

    /** @type {import('@rspack/core').Configuration} */
    const config = {
        mode,

        // https://rspack.dev/config/devtool
        // inline-source-map for development; none for production (no source maps).
        devtool: (mode === 'development') ? 'inline-source-map' : false,

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
                    test: /\.ts$/,
                    loader: 'builtin:swc-loader',
                    options: {
                        sourceMap: mode === 'development',
                        jsc: {
                            parser: {
                                syntax: 'typescript',
                            },
                            target: 'es2024',
                        },
                    },
                },
                {
                    // contentscript.css is injected into the shadow DOM as a string,
                    // with url() references resolved and inlined via asset/inline:
                    test: /contentscript\.css$/,
                    use: [{
                        loader: 'css-loader',
                        options: { exportType: 'string' },
                    }],
                },
                {
                    // Allows background: url(../assets/icons/ci-close-small.svg);
                    // to work in CSS:
                    test: /\.(png|jpg|gif|svg|mp3)$/,
                    type: 'asset/inline',
                },
            ],
        },
        plugins: [
            new NormalModuleReplacementPlugin(/^node:/, (resource) => {
                resource.request = resource.request.replace(/^node:/, '');
            }),
            new CssExtractRspackPlugin(),
            new rspack.DefinePlugin({
                'COMPILED_NODE_ENV': JSON.stringify(mode),
            }),
            {apply: (compiler) => {
                compiler.hooks.done.tap('CopyToFirefoxPlugin', (stats) => {
                    for (const { name, emitted } of stats.toJson({ assets: true }).assets) {
                        if (emitted) {
                            fs.copyFileSync(join(outputDirChrome, name), join(outputDirFirefox, name))
                        }
                    }
                })
            }},
        ],
        resolve: {
            extensions: ['.ts', '.js', '.css'],
        },
        performance: {
            hints: false,
        },
        stats: 'errors-warnings',
        optimization,
    }
    return config
}
