
const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');

const commonConfig = {
    entryPoints: [
        'src/content.ts',


        'src/background.ts',
        'src/xhrInterceptor.ts',
        'src/welcome.ts',
        'src/options.ts',
        'src/popup.ts',
        'src/themeBoot.ts'
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
        const devConfig = {
            ...commonConfig,
            sourcemap: true,
            minify: false,
            drop: [],
        };
        const ctx = await esbuild.context(devConfig);
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await esbuild.build(commonConfig);
        console.log('Build complete.');
    }
}

build().catch(() => process.exit(1));
