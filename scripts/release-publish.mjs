import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;
const tag = `v${version}`;
const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);

ensureCleanWorktree();

if (branch !== "main") {
  fail(`release:publish must run from main. Current branch: ${branch}`);
}

ensureTagDoesNotExist(tag);

runStep("typecheck", ["run", "typecheck"]);
runStep("test", ["test"]);
runStep("build", ["run", "build"]);

runGit(["tag", "-a", tag, "-m", `Release ${tag}`], true);
runGit(["push", "origin", branch], true);
runGit(["push", "origin", tag], true);

console.log("");
console.log(`Release tag ${tag} pushed.`);
console.log("GitHub Actions should now publish the package to npm.");

function ensureCleanWorktree() {
  const status = runGit(["status", "--porcelain"]);
  if (status !== "") {
    fail("release:publish requires a clean git worktree.");
  }
}

function ensureTagDoesNotExist(tagName) {
  const localTag = runGit(["tag", "--list", tagName]);
  if (localTag === tagName) {
    fail(`Tag ${tagName} already exists locally.`);
  }

  const remoteTag = runGit(["ls-remote", "--tags", "origin", `refs/tags/${tagName}`]);
  if (remoteTag !== "") {
    fail(`Tag ${tagName} already exists on origin.`);
  }
}

function runStep(name, args) {
  console.log(`Running ${name}...`);
  execFileSync("npm", args, { stdio: "inherit" });
}

function runGit(args, inherit = false) {
  const output = execFileSync("git", args, {
    stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  return typeof output === "string" ? output.trim() : "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
