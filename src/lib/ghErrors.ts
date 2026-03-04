const GH_AUTH_PATTERNS = [
  "not authenticated",
  "not logged into",
  "gh auth login",
  "no token found",
  "authentication required",
  "auth token",
  "try authenticating",
];

const GH_NOT_FOUND_PATTERNS = [
  "GitHub CLI (gh) not found",
];

export function isGhAuthError(error: string): boolean {
  const lower = error.toLowerCase();
  return GH_AUTH_PATTERNS.some((p) => lower.includes(p));
}

export function isGhNotFoundError(error: string): boolean {
  return GH_NOT_FOUND_PATTERNS.some((p) => error.includes(p));
}

const ADO_AUTH_PATTERNS = [
  "azure devops pat not configured",
  "authentication failed",
  "tf400813",
  "azure devops error",
  "http 401",
  "http 403",
];

export function isAdoAuthError(error: string): boolean {
  const lower = error.toLowerCase();
  return ADO_AUTH_PATTERNS.some((p) => lower.includes(p));
}

export function formatGhError(error: string): string | null {
  if (isGhNotFoundError(error)) {
    return "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ to use this feature.";
  }
  if (isGhAuthError(error)) {
    return "GitHub CLI is not authenticated. Run `gh auth login` in your terminal to connect your GitHub account.";
  }
  if (isAdoAuthError(error)) {
    return "Azure DevOps PAT is invalid, expired, or not configured. Update it in Settings > Azure DevOps.";
  }
  return null;
}
