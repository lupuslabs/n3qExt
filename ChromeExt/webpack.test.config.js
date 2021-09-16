const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { join } = require('path');

module.exports = {
    mode: 'development',
    entry: { test: join(__dirname, 'src/test/test.ts') },
    output: {
        path: __dirname + '/dist',
        filename: 'test.js'
    },
    module: {
        rules: [
            {
                exclude: /node_modules/,
                test: /\.ts$/,
                use: 'awesome-typescript-loader?{configFileName: "tsconfig.json"}',
            },
            {
                test: /\.(scss|css)$/,
                use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
            },
            {
                test: /\.(png|jpg|gif|svg|mp3)$/,
                use: 'url-loader',
            },
        ]
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: '[name].css',
            chunkFilename: '[name].css',
        }),
        new HtmlWebpackPlugin({
            filename: "test.html",
            title: "Unit Tests",
        })
    ],
    resolve: {
        extensions: ['.ts', '.js']
    },
}
