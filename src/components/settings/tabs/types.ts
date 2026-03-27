import type { ProviderType } from "../../../lib/tauri";

export type SettingsTab = "appearance" | "provider" | "permissions" | "copilot" | "linear" | "azure-devops" | "code-search" | "mcp" | "code-intel" | "migration" | "experimental" | "updates";

export const PROVIDER_ENV_HINTS: Record<ProviderType, string[]> = {
  Anthropic: ["ANTHROPIC_API_KEY"],
  OpenRouter: ["OPENROUTER_API_KEY"],
  VercelAIGateway: ["VERCEL_API_KEY"],
  Bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"],
  Vertex: ["GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_PROJECT_ID"],
  AzureFoundry: ["AZURE_API_KEY", "AZURE_ENDPOINT"],
  Custom: [],
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  Anthropic: "Anthropic",
  OpenRouter: "OpenRouter",
  VercelAIGateway: "Vercel AI Gateway",
  Bedrock: "AWS Bedrock",
  Vertex: "Google Vertex",
  AzureFoundry: "Azure Foundry",
  Custom: "Custom",
};
