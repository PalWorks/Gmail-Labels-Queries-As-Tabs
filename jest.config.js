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
            statements: 65,
            branches: 50,
            functions: 65,
            lines: 65,
        },
    },
};
