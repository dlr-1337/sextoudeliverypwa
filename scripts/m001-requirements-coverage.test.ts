import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PackageJson = {
  scripts: Record<string, string>;
};

const coverageDocPath = "docs/m001-requirements-coverage.md";
const packageJsonPath = "package.json";
const readmePath = "README.md";
const vitestConfigPath = "vitest.config.ts";
const selfPath = "scripts/m001-requirements-coverage.test.ts";

const allRequirementIds = Array.from(
  { length: 43 },
  (_, index) => `R${String(index + 1).padStart(3, "0")}`,
);

const m001CoveredIds = allRequirementIds.slice(0, 16);
const downstreamActiveIds = allRequirementIds.slice(16, 29);
const deferredIds = allRequirementIds.slice(29, 33);
const noGoIds = allRequirementIds.slice(33, 43);

const downstreamOwnerByRequirement: Record<string, string> = {
  R017: "M002/provisional",
  R018: "M002/provisional",
  R019: "M002/provisional",
  R020: "M002/provisional",
  R021: "M003/provisional",
  R022: "M004/provisional",
  R023: "M004/provisional",
  R024: "M004/provisional",
  R025: "M004/provisional",
  R026: "M005/provisional",
  R027: "M005/provisional",
  R028: "M006/provisional",
  R029: "M006/provisional",
};

function readTrackedFile(path: string) {
  expect(existsSync(path), `${path} should exist as a tracked source file`).toBe(true);

  return readFileSync(path, "utf8");
}

function getCoverageDoc() {
  return readTrackedFile(coverageDocPath);
}

function matrixRows(doc: string) {
  return doc
    .split(/\r?\n/u)
    .filter((candidate) => /^\|\s*R\d{3}\s*\|/u.test(candidate));
}

function requirementRowPattern(id: string) {
  return new RegExp(`^\\|\\s*${id}\\s*\\|`, "u");
}

function requireExactlyOneRequirementRow(rows: string[], id: string) {
  const matches = rows.filter((row) => requirementRowPattern(id).test(row));

  if (matches.length !== 1) {
    throw new Error(
      `${id} should appear exactly once as a matrix row; found ${matches.length}`,
    );
  }

  return matches[0];
}

function requirementRow(doc: string, id: string) {
  return requireExactlyOneRequirementRow(matrixRows(doc), id);
}

describe("M001 requirements coverage contract", () => {
  it("covers every requirement ID exactly once in the tracked matrix", () => {
    const doc = getCoverageDoc();
    const rows = matrixRows(doc);

    expect(rows, "the matrix should contain one row per requirement").toHaveLength(
      allRequirementIds.length,
    );

    for (const id of allRequirementIds) {
      expect(() => requireExactlyOneRequirementRow(rows, id)).not.toThrow();
    }
  });

  it("reports a missing requirement row with the explicit requirement ID", () => {
    const rowsWithoutR017 = matrixRows(getCoverageDoc()).filter(
      (row) => !requirementRowPattern("R017").test(row),
    );

    expect(() => requireExactlyOneRequirementRow(rowsWithoutR017, "R017")).toThrow(
      /R017 should appear exactly once as a matrix row/u,
    );
  });

  it("states the M001 scope boundary before listing dispositions", () => {
    const doc = getCoverageDoc();

    expect(doc).toMatch(
      /(?:Only|Apenas)[^\n]*(?:R001[–-]R016|R001\s*(?:through|até)\s*R016)[^\n]*M001/i,
    );
    expect(doc).toMatch(
      /R017[–-]R043[^\n]*(?:downstream|deferred|no-go|not-M001-gap|não são lacunas do M001)/i,
    );
  });

  it("keeps the four disposition groups visible as headings", () => {
    const doc = getCoverageDoc();

    expect(doc).toMatch(/## M001-covered\s*\/\s*validated/i);
    expect(doc).toMatch(/## Downstream active\s*\/\s*not-M001-gap/i);
    expect(doc).toMatch(/## Deferred\s*\/\s*not-M001-blocker/i);
    expect(doc).toMatch(/## No-go\s*\/\s*expected absence anti-features/i);
  });

  it("keeps M001-covered requirements tied to S01-S06 evidence", () => {
    const doc = getCoverageDoc();

    expect(doc).toMatch(/M001-covered|M001 covered|cobert[oa]s? pelo M001/i);
    expect(doc).toContain("npm run verify:m001");

    for (const id of m001CoveredIds) {
      const row = requirementRow(doc, id);

      expect(row, `${id} should be marked as M001-covered`).toMatch(
        /M001|S0[1-6]|validated|validado/i,
      );
    }
  });

  it("keeps R017-R029 downstream active with provisional owners and no M001 validation claim", () => {
    const doc = getCoverageDoc();

    expect(doc).toMatch(
      /downstream active|ativas? downstream|not-M001-gap|não são lacunas do M001/i,
    );

    for (const id of downstreamActiveIds) {
      const row = requirementRow(doc, id);
      const owner = downstreamOwnerByRequirement[id];

      expect(owner, `${id} should have an expected downstream owner`).toBeTypeOf(
        "string",
      );
      expect(row, `${id} should remain downstream active`).toMatch(
        /downstream|active|ativa|not-M001-gap|não .*M001/i,
      );
      expect(row, `${id} should have owner ${owner}`).toContain(owner);
      expect(row, `${id} must not be described as validated by M001`).not.toMatch(
        /validated by M001|validado pelo M001|M001 validated|implemented by M001|M001 implemented/i,
      );
    }
  });

  it("keeps R030-R033 deferred and non-M001 blockers", () => {
    const doc = getCoverageDoc();

    expect(doc).toMatch(/deferred|diferid[oa]|not-M001-blocker|não bloqueia M001/i);

    for (const id of deferredIds) {
      const row = requirementRow(doc, id);

      expect(row, `${id} should remain deferred`).toMatch(/deferred|diferid[oa]/i);
      expect(row, `${id} should be explicitly non-blocking for M001`).toMatch(
        /not-M001-blocker|not .*M001 blocker|não bloqueia M001|não .*bloqueador/i,
      );
    }
  });

  it("keeps R034-R043 as no-go expected-absence anti-features", () => {
    const doc = getCoverageDoc();

    expect(doc).toMatch(/no-go|anti-feature|expected absence|ausência esperada|out-of-scope/i);

    for (const id of noGoIds) {
      const row = requirementRow(doc, id);

      expect(row, `${id} should remain a no-go/out-of-scope disposition`).toMatch(
        /no-go|anti-feature|expected absence|ausência esperada|out-of-scope/i,
      );
      expect(row, `${id} should not be framed as an M001 implementation gap`).not.toMatch(
        /missing M001 capability|lacuna do M001|M001 gap/i,
      );
    }
  });

  it("keeps the README seam and package/Vitest inclusion for source-level reviewers", () => {
    const packageJson = JSON.parse(readTrackedFile(packageJsonPath)) as PackageJson;
    const readme = readTrackedFile(readmePath);
    const vitestConfig = readTrackedFile(vitestConfigPath);

    expect(readme).toContain(coverageDocPath);
    expect(packageJson.scripts.test).toContain("vitest run");
    expect(packageJson.scripts["verify:m001"]).toContain("npm test");
    expect(vitestConfig).toContain("scripts/**/*.test.ts");
  });

  it("does not read ignored local workflow artifacts as test fixtures", () => {
    const source = readTrackedFile(selfPath);
    const forbiddenFragments = [
      ".gs" + "d",
      ".plan" + "ning",
      ".aud" + "its",
      `readFileSync('` + ".gs" + "d",
      `readFileSync("` + ".gs" + "d",
    ] as const;

    for (const fragment of forbiddenFragments) {
      expect(source, `${fragment} should not be referenced by this test`).not.toContain(
        fragment,
      );
    }
  });
});
