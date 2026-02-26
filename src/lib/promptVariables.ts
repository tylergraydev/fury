const VARIABLE_REGEX = /\{\{(\w+)\}\}/g;

export const AUTO_FILL_VARIABLES = [
  "file",
  "selection",
  "branch",
  "workspace",
] as const;

export function extractVariables(content: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of content.matchAll(VARIABLE_REGEX)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function substituteVariables(
  content: string,
  values: Record<string, string>,
): string {
  return content.replace(VARIABLE_REGEX, (match, name: string) => {
    return name in values ? values[name] : match;
  });
}

export function isAutoFillVariable(
  name: string,
): name is (typeof AUTO_FILL_VARIABLES)[number] {
  return (AUTO_FILL_VARIABLES as readonly string[]).includes(name);
}
