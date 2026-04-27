import "dotenv/config";

const requiredKeys = process.argv.slice(2);

if (requiredKeys.length === 0) {
  console.error("No environment variable names were provided to require-env.");
  process.exit(1);
}

const missingKeys = requiredKeys.filter((key) => !process.env[key]);

if (missingKeys.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingKeys.join(", ")}`,
  );
  process.exit(1);
}
