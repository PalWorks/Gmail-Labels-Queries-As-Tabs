/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    /**
     * ts-jest compiles each module graph on first touch, and coverage
     * instrumentation makes that several times slower. options.test.ts pulls in
     * most of src/, which measured ~1.8s cold and ~0.15s warm; under a full
     * parallel run competing for CPU that cold path intermittently blew the
     * 5s default and failed the first test in the file. The work is real
     * compilation, not a hang, so the timeout is what was wrong.
     */
    testTimeout: 20000,
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/experimental/**',
    ],
    coverageThreshold: {
        global: {
            statements: 65,
            branches: 50,
            functions: 65,
            lines: 65,
        },
    },
};
