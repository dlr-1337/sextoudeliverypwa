import { readFileSync } from "node:fs";

function stripSingleQuotes(value) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

const args = process.argv.slice(2);

if (args[0] === "-q") {
  args.shift();
}

if (args.length < 2) {
  process.exit(2);
}

const pattern = stripSingleQuotes(args[0]);
const filePath = stripSingleQuotes(args[1]);

try {
  const contents = readFileSync(filePath, "utf8");
  const matcher = new RegExp(pattern, "m");
  process.exit(matcher.test(contents) ? 0 : 1);
} catch {
  process.exit(2);
}
