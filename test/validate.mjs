#!/usr/bin/env node
// Structural test for the second-opinion plugin.
//
// Deterministic, dependency-free, safe to run in CI. It does NOT exercise the
// reviewer's judgment (that is non-deterministic and needs the model — see
// test/smoke.sh). It checks that the plugin is well-formed: manifests parse and
// carry the fields the loader needs, every agent and skill has the frontmatter
// Claude Code requires to register it, and the files the docs point at exist.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    console.log(`  ✔ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

// Minimal YAML frontmatter reader: enough to assert top-level keys exist.
// The plugin's frontmatter is flat `key: value`, so we do not need a real parser.
const frontmatter = (path) => {
  const text = readFileSync(path, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const keys = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) keys[kv[1]] = kv[2].trim();
  }
  return keys;
};

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

console.log("second-opinion structural tests\n");

// 1. The manifests parse and carry the fields the loader and marketplace need.
console.log("manifests");
let plugin;
try {
  plugin = readJson(join(root, ".claude-plugin/plugin.json"));
  check("plugin.json is valid JSON", true);
  check("plugin.json has name", typeof plugin.name === "string" && plugin.name.length > 0);
  check("plugin.json has version", typeof plugin.version === "string" && plugin.version.length > 0);
  check("plugin.json has description", typeof plugin.description === "string" && plugin.description.length > 0);
} catch (e) {
  check("plugin.json is valid JSON", false, e.message);
}

try {
  const market = readJson(join(root, ".claude-plugin/marketplace.json"));
  check("marketplace.json is valid JSON", true);
  check("marketplace.json has description", typeof market.description === "string" && market.description.length > 0);
  check("marketplace.json lists at least one plugin", Array.isArray(market.plugins) && market.plugins.length > 0);
  if (plugin) {
    check(
      "marketplace lists the plugin by name",
      (market.plugins || []).some((p) => p.name === plugin.name),
      `no entry named "${plugin?.name}"`
    );
  }
} catch (e) {
  check("marketplace.json is valid JSON", false, e.message);
}

// 2. Every agent has the frontmatter Claude Code needs to register it.
console.log("\nagents");
const agentsDir = join(root, "agents");
const agentFiles = existsSync(agentsDir)
  ? readdirSync(agentsDir).filter((f) => f.endsWith(".md"))
  : [];
check("at least one agent is defined", agentFiles.length > 0);
for (const f of agentFiles) {
  const fm = frontmatter(join(agentsDir, f));
  check(`agents/${f} has frontmatter`, fm !== null);
  if (fm) {
    check(`agents/${f} has name`, !!fm.name);
    check(`agents/${f} has description`, !!fm.description);
  }
}

// 3. Every skill has a SKILL.md with the required frontmatter.
console.log("\nskills");
const skillsDir = join(root, "skills");
const skillDirs = existsSync(skillsDir)
  ? readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory())
  : [];
check("at least one skill is defined", skillDirs.length > 0);
for (const d of skillDirs) {
  const skillPath = join(skillsDir, d, "SKILL.md");
  check(`skills/${d}/SKILL.md exists`, existsSync(skillPath));
  if (existsSync(skillPath)) {
    const fm = frontmatter(skillPath);
    check(`skills/${d}/SKILL.md has frontmatter`, fm !== null);
    if (fm) {
      check(`skills/${d}/SKILL.md has name`, !!fm.name);
      check(`skills/${d}/SKILL.md has description`, !!fm.description);
    }
  }
}

// 4. The pieces reference each other consistently.
console.log("\ncross-references");
// The interrogate skill is the explicit command; both skills dispatch the reviewer.
check("interrogate command skill exists", skillDirs.includes("interrogate"));
check(
  "decision-reviewer agent exists (both skills dispatch it)",
  agentFiles.includes("decision-reviewer.md")
);
// The README documents these paths; keep them honest.
for (const p of ["agents/decision-reviewer.md", "skills/interrogate/SKILL.md", "skills/decision-review/SKILL.md", "LICENSE"]) {
  check(`README-referenced path exists: ${p}`, existsSync(join(root, p)));
}

// 5. `claude plugin validate` agrees the plugin is well-formed (schema-level).
console.log("\nclaude plugin validate");
try {
  const out = execFileSync("claude", ["plugin", "validate", "."], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  check("claude plugin validate passes", /Validation passed/.test(out), out.trim());
} catch (e) {
  const output = [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
  // Only treat it as a failure if the CLI is present but rejected the plugin.
  if (/not found|ENOENT/.test(e.message) && !output) {
    check("claude CLI available (skipped: not installed)", true);
  } else {
    check("claude plugin validate passes", false, output || e.message);
  }
}

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("OK: all structural checks passed.");
