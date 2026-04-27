import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
const scripts = packageJson.scripts;

const smokeScriptContracts = [
  { name: "smoke:s01", file: "scripts/verify-s01-db.ts" },
  { name: "smoke:s02", file: "scripts/verify-s02-auth.ts" },
  { name: "smoke:s03", file: "scripts/verify-s03-admin.ts" },
  { name: "smoke:s04", file: "scripts/verify-s04-merchant.ts" },
  { name: "smoke:s05", file: "scripts/verify-s05-products-catalog.ts" },
] as const;

const verifyM001Steps = [
  "npm run db:generate",
  "npm test",
  "npm run lint",
  "npm run build",
  "npm run db:deploy",
  "npm run db:seed",
  "npm run smoke:m001",
] as const;

const unsafeCommandPatterns = [
  { label: "migrate reset", pattern: /\bmigrate\s+reset\b/i },
  { label: "db push", pattern: /\b(?:prisma\s+)?db\s+push\b/i },
  { label: "rm -rf", pattern: /\brm\s+-rf\b/i },
  {
    label: "raw .env read",
    pattern: /(?:^|[\n;&|])\s*(?:cat|type|more|less|source|\.)\s+\.env(?:\b|$)/i,
  },
  {
    label: "secret echo",
    pattern:
      /\becho\s+[^&|;]*\$\{?(?:DATABASE_URL|AUTH_SECRET|SEED_ADMIN_PASSWORD|[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD)[A-Z0-9_]*)\}?\b/i,
  },
] as const;

function requirePackageScript(name: string) {
  const script = scripts[name];

  expect(script, `${name} script should exist`).toBeTypeOf("string");

  return script;
}

function expectStepsInOrder(script: string, expectedSteps: readonly string[]) {
  let previousIndex = -1;

  for (const step of expectedSteps) {
    const currentIndex = script.indexOf(step);

    expect(currentIndex, `${step} should appear after prior verify:m001 steps`)
      .toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

describe("M001 package verification scripts", () => {
  it("exposes every slice smoke script and points at existing tracked script files", () => {
    for (const { name, file } of smokeScriptContracts) {
      expect(requirePackageScript(name)).toBe(`tsx ${file}`);
      expect(file).toMatch(/^scripts\/verify-s0[1-5]-[a-z0-9-]+\.ts$/);
      expect(file).not.toContain("..");
      expect(existsSync(file), `${file} should exist`).toBe(true);
    }
  });

  it("runs all slice smokes sequentially through smoke:m001", () => {
    expect(requirePackageScript("smoke:m001")).toBe(
      smokeScriptContracts
        .map(({ name }) => `npm run ${name}`)
        .join(" && "),
    );
  });

  it("runs the final M001 verification stages in a safe order", () => {
    const verifyScript = requirePackageScript("verify:m001");

    expectStepsInOrder(verifyScript, verifyM001Steps);
    expect(verifyScript.split(" && ")).toEqual([...verifyM001Steps]);
  });

  it("rejects destructive or secret-printing commands from the final verification surface", () => {
    const scriptNames = [
      ...smokeScriptContracts.map(({ name }) => name),
      "smoke:m001",
      "verify:m001",
    ];
    const commandSurface = scriptNames
      .map((name) => `${name}: ${requirePackageScript(name)}`)
      .join("\n");

    for (const { label, pattern } of unsafeCommandPatterns) {
      expect(
        commandSurface,
        `${label} must not appear in M001 verification scripts`,
      ).not.toMatch(pattern);
    }
  });
});
