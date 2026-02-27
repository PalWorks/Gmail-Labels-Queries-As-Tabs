
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const commonConfig = {
    entryPoints: [
        'src/content.ts',


        'src/background.ts',
        'src/xhrInterceptor.ts',
        'src/welcome.ts'
    ],
    bundle: true,
    outdir: 'dist/js',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: true,
    drop: ['console'],
    logLevel: 'info',
};

async function build() {
    if (isWatch) {
        const ctx = await esbuild.context(commonConfig);
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await esbuild.build(commonConfig);
        // Copy SDK pageWorld.js to root of dist
        fs.copyFileSync('node_modules/@inboxsdk/core/pageWorld.js', 'dist/pageWorld.js');
        console.log('Build complete.');
    }
}

build().catch(() => process.exit(1));
