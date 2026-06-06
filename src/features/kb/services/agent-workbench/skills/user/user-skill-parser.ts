/**
 * User skill parser: parses markdown skill files into a prompt-only contract source.
 */

import type { UserSkillFrontmatter, ParsedUserSkill } from "./user-skill-storage-types";

export type { UserSkillFrontmatter, ParsedUserSkill };

export function parseUserSkillMarkdown(content: string): ParsedUserSkill {
  const trimmed = content.trim();

  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, guidance: trimmed };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { frontmatter: {}, guidance: trimmed };
  }

  const frontmatterStr = trimmed.substring(3, endIndex).trim();
  const guidance = trimmed.substring(endIndex + 3).trim();

  const frontmatter = parseSimpleYaml(frontmatterStr);

  return { frontmatter, guidance };
}

function parseSimpleYaml(yaml: string): UserSkillFrontmatter {
  const result: UserSkillFrontmatter = {};
  const lines = yaml.split("\n");

  let currentKey = "";
  let inArray = false;
  let arrayItems: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    if (inArray) {
      if (trimmedLine.startsWith("- ")) {
        arrayItems.push(trimmedLine.substring(2).trim().replace(/^["']|["']$/g, ""));
        continue;
      } else {
        inArray = false;
        arrayItems = [];
      }
    }

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) continue;

    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();

    if (value === "" || value === "[]") {
      if (value === "[]") {
        continue;
      } else {
        currentKey = key;
        inArray = true;
        arrayItems = [];
      }
      continue;
    }

    switch (key) {
      case "id":
      case "title":
        (result as Record<string, unknown>)[key] = value.replace(/^["']|["']$/g, "");
        break;
      case "enabled":
        (result as Record<string, unknown>)[key] = value === "true";
        break;
      case "priority":
        (result as Record<string, unknown>)[key] = parseInt(value, 10) || 0;
        break;
    }
  }

  void currentKey;
  void arrayItems;

  return result;
}
