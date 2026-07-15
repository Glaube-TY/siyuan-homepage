function countdownSvgCharacterWeight(character: string): number {
  if (/^[A-Za-z0-9]$/.test(character)) return 0.55;
  if (/^[\u0020-\u007e]$/.test(character))
    return character === " " ? 0.35 : 0.55;
  return 1;
}

export function countdownSvgTextWeight(value: string): number {
  return Array.from(value).reduce(
    (total, character) => total + countdownSvgCharacterWeight(character),
    0,
  );
}

function takeCountdownSvgText(value: string, maxWeight: number): string {
  let result = "";
  let weight = 0;
  for (const character of Array.from(value)) {
    const nextWeight = weight + countdownSvgCharacterWeight(character);
    if (nextWeight > maxWeight) break;
    result += character;
    weight = nextWeight;
  }
  return result;
}

export function truncateCountdownSvgText(
  value: string,
  maxWeight: number,
): string {
  const normalized = value.trim();
  if (countdownSvgTextWeight(normalized) <= maxWeight) return normalized;
  return `${takeCountdownSvgText(normalized, Math.max(0, maxWeight - 1)).trimEnd()}…`;
}

export function wrapCountdownSvgText(
  value: string,
  maxWeight: number,
  maxLines = 2,
): string[] {
  const characters = Array.from(value.trim());
  if (!characters.length || maxWeight <= 0 || maxLines <= 0) return [];
  const lines: string[] = [];
  let index = 0;
  while (index < characters.length && lines.length < maxLines) {
    while (characters[index] === " ") index += 1;
    let line = "";
    let weight = 0;
    while (index < characters.length) {
      const character = characters[index];
      const nextWeight = weight + countdownSvgCharacterWeight(character);
      if (line && nextWeight > maxWeight) break;
      line += character;
      weight = nextWeight;
      index += 1;
      if (nextWeight > maxWeight) break;
    }
    if (line.trim()) lines.push(line.trim());
  }
  if (index < characters.length && lines.length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = truncateCountdownSvgText(
      `${lines[lastIndex]}${characters.slice(index).join("")}`,
      maxWeight,
    );
  }
  return lines;
}
