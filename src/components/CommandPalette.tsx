import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useRepositoryStore } from "../stores/repositoryStore";
import { useUIStore } from "../stores/uiStore";
import { shortcutLabel, SHORTCUTS } from "../lib/keybindings";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction: (action: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onAction,
}: CommandPaletteProps) {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore();
  const { repositories } = useRepositoryStore();
  const rightSidebarTab = useUIStore((s) => s.rightSidebarTab);

  const run = (action: string) => {
    onOpenChange(false);
    onAction(action);
  };

  const shortcutFor = (action: string) => {
    const def = SHORTCUTS.find((s) => s.action === action);
    return def ? shortcutLabel(def) : undefined;
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
    >
      <Command
        className="command-palette"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          maxWidth: 480,
          width: "100%",
        }}
      >
        <CommandInput
          placeholder="Type a command..."
          style={{
            backgroundColor: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "none",
            borderBottom: "1px solid var(--border)",
            padding: "12px 16px",
            fontSize: 13,
            width: "100%",
            outline: "none",
          }}
        />
        <CommandList
          style={{
            maxHeight: 320,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          <CommandEmpty
            style={{
              padding: "16px",
              textAlign: "center",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            No results found.
          </CommandEmpty>

          {/* Sidebar tabs */}
          <CommandGroup
            heading="Sidebar"
            style={{ padding: "0 8px" }}
          >
            <PaletteItem
              onSelect={() => run("right-sidebar-files")}
              shortcut={shortcutFor("right-sidebar-files")}
              active={rightSidebarTab === "files"}
            >
              All Files
            </PaletteItem>
            <PaletteItem
              onSelect={() => run("right-sidebar-changes")}
              shortcut={shortcutFor("right-sidebar-changes")}
              active={rightSidebarTab === "changes"}
            >
              Changes
            </PaletteItem>
            <PaletteItem
              onSelect={() => run("right-sidebar-checks")}
              shortcut={shortcutFor("right-sidebar-checks")}
              active={rightSidebarTab === "checks"}
            >
              Checks / PR
            </PaletteItem>
            <PaletteItem
              onSelect={() => run("toggle-right-sidebar")}
              shortcut={shortcutFor("toggle-right-sidebar")}
            >
              Toggle Right Sidebar
            </PaletteItem>
          </CommandGroup>

          <CommandSeparator style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />

          {/* Views */}
          <CommandGroup
            heading="Views"
            style={{ padding: "0 8px" }}
          >
            <PaletteItem onSelect={() => run("view-chat")}>
              Switch to Chat
            </PaletteItem>
            <PaletteItem
              onSelect={() => run("open-settings")}
              shortcut={shortcutFor("open-settings")}
            >
              Open Settings
            </PaletteItem>
            <PaletteItem onSelect={() => run("view-merge")}>
              Open Merge View
            </PaletteItem>
            <PaletteItem onSelect={() => run("view-history")}>
              Open History
            </PaletteItem>
          </CommandGroup>

          <CommandSeparator style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />

          {/* Actions */}
          <CommandGroup
            heading="Actions"
            style={{ padding: "0 8px" }}
          >
            <PaletteItem
              onSelect={() => run("focus-terminal")}
              shortcut={shortcutFor("focus-terminal")}
            >
              Focus Terminal
            </PaletteItem>
            <PaletteItem
              onSelect={() => run("new-workspace")}
              shortcut={shortcutFor("new-workspace")}
            >
              New Workspace
            </PaletteItem>
          </CommandGroup>

          {/* Workspace switching */}
          {workspaces.length > 1 && (
            <>
              <CommandSeparator style={{ height: 1, backgroundColor: "var(--border)", margin: "4px 0" }} />
              <CommandGroup
                heading="Switch Workspace"
                style={{ padding: "0 8px" }}
              >
                {workspaces
                  .filter((ws) => ws.id !== activeWorkspaceId)
                  .map((ws) => {
                    const repo = repositories.find((r) => r.id === ws.repoId);
                    return (
                      <PaletteItem
                        key={ws.id}
                        onSelect={() => {
                          onOpenChange(false);
                          useWorkspaceStore.getState().setActive(ws.id);
                        }}
                      >
                        {ws.name}
                        <span
                          style={{
                            color: "var(--text-muted)",
                            marginLeft: 8,
                            fontSize: 10,
                          }}
                        >
                          {repo?.name} / {ws.branch}
                        </span>
                      </PaletteItem>
                    );
                  })}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function PaletteItem({
  children,
  onSelect,
  shortcut,
  active,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  shortcut?: string;
  active?: boolean;
}) {
  return (
    <CommandItem
      onSelect={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 12,
        color: "var(--text-primary)",
      }}
      data-active={active}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {active && (
          <span
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              backgroundColor: "var(--accent)",
            }}
          />
        )}
        {children}
      </span>
      {shortcut && (
        <kbd
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 3,
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            fontFamily: "inherit",
          }}
        >
          {shortcut}
        </kbd>
      )}
    </CommandItem>
  );
}
