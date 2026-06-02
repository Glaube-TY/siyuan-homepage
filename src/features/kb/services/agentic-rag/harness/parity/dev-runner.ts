import { KB_AGENT_PARITY_SCENARIOS } from "./scenarios";
import { runMockParityScenarios } from "./scenario-runner";
import { createDefaultMockToolResultFactory } from "./mock-tools";
import type { ParityReport } from "./parity-report";

const PARITY_QUERY_PATTERN = /^__PARITY_[A-Z0-9_]+__$/;
const PARITY_DOC_TITLE_PATTERN = /^doc_\d+$/;
const PARITY_ROOT_TITLE_PATTERN = /^(root|child)_\d+$/;

function validateFixtureIntegrity(): string[] {
  const failures: string[] = [];

  for (const scenario of KB_AGENT_PARITY_SCENARIOS) {
    if (!PARITY_QUERY_PATTERN.test(scenario.question)) {
      failures.push(`scenario "${scenario.id}" question "${scenario.question}" does not match /^__PARITY_[A-Z0-9_]+__$/`);
    }

    if (!/^[a-z][a-z0-9_]+$/.test(scenario.id)) {
      failures.push(`scenario id "${scenario.id}" is not a valid English structural id`);
    }
  }

  const toolFactory = createDefaultMockToolResultFactory();
  const listResult = toolFactory.createResult("list_knowledge_map");
  const titles = (listResult.titles as string[]) ?? [];
  for (const title of titles) {
    if (!PARITY_DOC_TITLE_PATTERN.test(title) && !PARITY_ROOT_TITLE_PATTERN.test(title)) {
      failures.push(`mock title "${title}" does not match /^doc_\d+$/ or /^(root|child)_\d+$/`);
    }
  }

  const focusResult = toolFactory.createResult("focus_doc_scope");
  const focusedRootTitle = focusResult.focusedRootTitle as string;
  if (focusedRootTitle && !PARITY_DOC_TITLE_PATTERN.test(focusedRootTitle) && !PARITY_ROOT_TITLE_PATTERN.test(focusedRootTitle)) {
    failures.push(`mock focusedRootTitle "${focusedRootTitle}" does not match /^doc_\d+$/ or /^(root|child)_\d+$/`);
  }

  return failures;
}

export function runKbAgentMockParitySuite(): {
  passed: boolean;
  reports: ParityReport[];
  summary: string;
} {
  const fixtureFailures = validateFixtureIntegrity();
  if (fixtureFailures.length > 0) {
    console.error("Fixture integrity violations:");
    for (const f of fixtureFailures) {
      console.error(`  - ${f}`);
    }
    return {
      passed: false,
      reports: [],
      summary: `Fixture integrity failed: ${fixtureFailures.join("; ")}`,
    };
  }

  const reports = runMockParityScenarios(KB_AGENT_PARITY_SCENARIOS);
  const passed = reports.every((report) => report.passed);
  const summary = reports
    .map((report) => {
      const status = report.passed ? "PASS" : "FAIL";
      const actions = report.traceSummary.actions.join(" -> ") || "none";
      const failures = report.failures.length > 0 ? ` failures=${report.failures.join("; ")}` : "";
      return `[KB Agent Parity] ${report.scenarioId} ${status} actions=${actions}${failures}`;
    })
    .join("\n");

  return {
    passed,
    reports,
    summary,
  };
}

if (typeof process !== "undefined" && process.argv[1]?.includes("dev-runner")) {
  const { passed, summary } = runKbAgentMockParitySuite();
  console.log(summary);
  console.log(`\nOverall: ${passed ? "ALL PASSED" : "SOME FAILED"}`);
  process.exit(passed ? 0 : 1);
}
