import { useEffect, useState } from "react";
import {
  X,
  Key,
  Server,
  ArrowLeftRight,
  FlaskConical,
  Download,
  Palette,
  Sparkles,
  CircleDot,
  Search,
  Blocks,
} from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { isMac } from "../../lib/keybindings";
import type { SettingsTab } from "./tabs";
import {
  AppearanceTab,
  ProviderTab,
  CopilotTab,
  LinearTab,
  AzureDevOpsTab,
  CodeSearchTab,
  McpTab,
  CodeIntelTab,
  MigrationTab,
  ExperimentalTab,
  UpdatesTab,
} from "./tabs";

const NAV_ITEMS: { tab: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { tab: "appearance", label: "Appearance", icon: Palette },
  { tab: "provider", label: "Provider", icon: Key },
  { tab: "copilot", label: "Copilot", icon: Sparkles },
  { tab: "linear", label: "Linear", icon: CircleDot },
  { tab: "azure-devops", label: "Azure DevOps", icon: Server },
  { tab: "code-search", label: "Code Search", icon: Search },
  { tab: "mcp", label: "MCP Servers", icon: Server },
  { tab: "code-intel", label: "Code Intelligence", icon: Blocks },
  { tab: "migration", label: "Migration", icon: ArrowLeftRight },
  { tab: "experimental", label: "Experimental", icon: FlaskConical },
  { tab: "updates", label: "Updates", icon: Download },
];

export function AppSettingsPanel() {
  const settingsInitialTab = useUIStore((s) => s.settingsInitialTab);
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    (settingsInitialTab as SettingsTab) || "appearance",
  );
  const closeSettings = () => useUIStore.getState().closeViewTab("settings");

  // Clear the initial tab after consuming it
  useEffect(() => {
    if (settingsInitialTab) {
      useUIStore.getState().setSettingsInitialTab(null);
    }
  }, [settingsInitialTab]);

  return (
    <div
      className="flex h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Sidebar navigation */}
      <div
        className="flex h-full w-48 flex-shrink-0 flex-col"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{
            borderBottom: "1px solid var(--border)",
            /* v8 ignore next -- @preserve */
            paddingTop: isMac ? 42 : 12,
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Settings
          </h2>
          <button
            onClick={closeSettings}
            aria-label="Close settings"
            className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_ITEMS.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs transition-colors"
              style={{
                backgroundColor: activeTab === tab ? "var(--bg-surface)" : "transparent",
                color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
                borderLeft: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "appearance" && <AppearanceTab />}
        {activeTab === "provider" && <ProviderTab />}
        {activeTab === "copilot" && <CopilotTab />}
        {activeTab === "linear" && <LinearTab />}
        {activeTab === "azure-devops" && <AzureDevOpsTab />}
        {activeTab === "code-search" && <CodeSearchTab />}
        {activeTab === "mcp" && <McpTab />}
        {activeTab === "code-intel" && <CodeIntelTab />}
        {activeTab === "migration" && <MigrationTab />}
        {activeTab === "experimental" && <ExperimentalTab />}
        {activeTab === "updates" && <UpdatesTab />}
      </div>
    </div>
  );
}
