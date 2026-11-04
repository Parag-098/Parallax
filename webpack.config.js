const path = require('path');
module.exports = { entry: './src/webview/main.tsx', output: { path: path.resolve(__dirname, 'media'), filename: 'main.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'] }, module: { rules: [{ test: /\.tsx?$/, use: { loader: 'ts-loader', options: { configFile: 'tsconfig.webview.json' } }, exclude: /node_modules/ }] } };
