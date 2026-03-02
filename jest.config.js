/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
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
            statements: 60,
            branches: 45,
            functions: 60,
            lines: 60,
        },
    },
};
