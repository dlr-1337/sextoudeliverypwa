const vitestConfig = {
  root: process.cwd(),
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "prisma/**/*.test.ts",
      "scripts/**/*.test.ts",
      "e2e/**/*.test.ts",
    ],
  },
};

export default vitestConfig;
