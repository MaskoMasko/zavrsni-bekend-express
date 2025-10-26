module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
    testMatch: ['**/test/**/*.test.js'],
    collectCoverageFrom: [
        'routes/**/*.js',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage'
};