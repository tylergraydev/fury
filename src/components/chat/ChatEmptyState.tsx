import {
  Sparkles,
  Bug,
  Code2,
  GitPullRequest,
  Zap,
  FileText,
  GitMerge,
  Terminal,
} from "lucide-react";

interface QuickAction {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
  color: string;
  prompt: string;
}

const PRIMARY_ACTIONS: QuickAction[] = [
  {
    icon: Sparkles,
    title: "Add Feature",
    description: "Implement a new feature with AI assistance",
    color: "#a78bfa",
    prompt: "I want to add a new feature. ",
  },
  {
    icon: Bug,
    title: "Fix Bug",
    description: "Debug and fix issues in your code",
    color: "#f87171",
    prompt: "I need help fixing a bug. ",
  },
  {
    icon: Code2,
    title: "Refactor Code",
    description: "Improve code structure and quality",
    color: "#60a5fa",
    prompt: "I want to refactor ",
  },
  {
    icon: GitPullRequest,
    title: "Create Pull Request",
    description: "Generate PR with description and changes",
    color: "#4ade80",
    prompt: "/commit-push-pr ",
  },
  {
    icon: Zap,
    title: "Write Tests",
    description: "Generate unit and integration tests",
    color: "#facc15",
    prompt: "Write tests for ",
  },
  {
    icon: FileText,
    title: "Document Code",
    description: "Add comments and documentation",
    color: "#2dd4bf",
    prompt: "Add documentation to ",
  },
];

const SECONDARY_ACTIONS: QuickAction[] = [
  {
    icon: GitMerge,
    title: "Merge from Main",
    description: "Sync changes from the main branch",
    color: "#fb923c",
    prompt: "Merge the latest changes from the main branch and resolve any conflicts.",
  },
  {
    icon: Terminal,
    title: "Run Command",
    description: "Execute a shell command or script",
    color: "#94a3b8",
    prompt: "Run ",
  },
];

interface ChatEmptyStateProps {
  workspaceName: string;
  onAction: (prompt: string) => void;
}

export function ChatEmptyState({ workspaceName, onAction }: ChatEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-1.5 flex items-center justify-center gap-2">
            <Sparkles
              className="h-5 w-5"
              style={{ color: "var(--accent)" }}
            />
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {workspaceName}
            </h1>
          </div>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            What would you like to work on?
          </p>
        </div>

        {/* Primary actions — 2-column grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {PRIMARY_ACTIONS.map((action) => (
            <QuickActionCard
              key={action.title}
              action={action}
              onClick={() => onAction(action.prompt)}
            />
          ))}
        </div>

        {/* Secondary actions — compact row */}
        <div className="mt-2.5 flex gap-2.5">
          {SECONDARY_ACTIONS.map((action) => (
            <SecondaryActionPill
              key={action.title}
              action={action}
              onClick={() => onAction(action.prompt)}
            />
          ))}
        </div>

        {/* Hint */}
        <p
          className="mt-6 text-center text-xs"
          style={{ color: "var(--text-muted)", opacity: 0.6 }}
        >
          or type a message below to get started
        </p>
      </div>
    </div>
  );
}

function QuickActionCard({
  action,
  onClick,
}: {
  action: QuickAction;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all duration-200"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = action.color + "0F";
        e.currentTarget.style.borderColor = action.color + "40";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-surface)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: action.color + "15" }}
      >
        <action.icon
          className="h-4.5 w-4.5"
          style={{ color: action.color }}
        />
      </div>
      <div className="min-w-0">
        <div
          className="text-sm font-medium leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {action.title}
        </div>
        <div
          className="text-xs leading-snug"
          style={{ color: "var(--text-muted)" }}
        >
          {action.description}
        </div>
      </div>
    </button>
  );
}

function SecondaryActionPill({
  action,
  onClick,
}: {
  action: QuickAction;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = action.color + "0F";
        e.currentTarget.style.borderColor = action.color + "40";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "var(--bg-surface)";
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <action.icon
        className="h-3.5 w-3.5"
        style={{ color: action.color }}
      />
      {action.title}
    </button>
  );
}
