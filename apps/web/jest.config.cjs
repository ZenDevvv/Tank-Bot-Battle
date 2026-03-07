module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["<rootDir>/src/setupTests.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {
      tsconfig: {
        module: "commonjs",
        jsx: "react-jsx"
      }
    }]
  },
  moduleNameMapper: {
    "^@tank-bot-battle/shared$": "<rootDir>/../../packages/shared/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "\\.(css)$": "<rootDir>/src/test/styleMock.ts"
  }
};
