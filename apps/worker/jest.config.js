/* eslint-env node */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  moduleNameMapper: {
    '^@computemesh/(.*)$': '<rootDir>/../../packages/$1/src',
  },
};
