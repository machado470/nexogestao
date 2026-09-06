module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
  testRegex: '(src|test)/.*\.spec\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    }],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
