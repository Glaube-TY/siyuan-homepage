import { slugifyNotebrainId } from "../../workspace/notebrain-workspace-paths";
import type { ExternalSkillSourceType } from "./external-skill-types";

export interface ResolvedExternalSkillSource {
  sourceType: ExternalSkillSourceType;
  canonicalSource: string;
  zipUrl?: string;
  owner?: string;
  repo?: string;
  ref?: string;
  defaultTargetId: string;
}

function parseGithubUrl(source: string): ResolvedExternalSkillSource | null {
  const match = source.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\/tree\/([^/\s#?]+)(?:\/(.+))?)?/i);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2].replace(/\.git$/i, "");
  const ref = match[3] || "main";
  return {
    sourceType: "github",
    canonicalSource: `https://github.com/${owner}/${repo}`,
    zipUrl: `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${ref}`,
    owner,
    repo,
    ref,
    defaultTargetId: slugifyNotebrainId(`${owner}-${repo}`, "github-skill"),
  };
}

function parseOwnerRepo(source: string): ResolvedExternalSkillSource | null {
  const match = source.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) return null;
  return parseGithubUrl(`https://github.com/${match[1]}/${match[2]}`);
}

export function resolveExternalSkillSource(rawSource: string): ResolvedExternalSkillSource {
  const source = rawSource.trim();
  const github = parseGithubUrl(source) ?? parseOwnerRepo(source);
  if (github) return github;
  if (/^https?:\/\/.+\.zip(?:[?#].*)?$/i.test(source)) {
    return {
      sourceType: "zip",
      canonicalSource: source,
      zipUrl: source,
      defaultTargetId: slugifyNotebrainId(source.split("/").pop()?.replace(/\.zip.*/i, ""), "zip-skill"),
    };
  }
  return {
    sourceType: source.startsWith("skills/") || source.startsWith("tmp/") ? "notebrain" : "unknown",
    canonicalSource: source,
    defaultTargetId: slugifyNotebrainId(source, "skill"),
  };
}

