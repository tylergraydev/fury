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

const QUICK_ACTIONS: QuickAction[] = [
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
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-1 flex items-center justify-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--accent)" }}
            >
              <Sparkles className="h-4.5 w-4.5" style={{ color: "#fff" }} />
            </div>
            <h1
              className="text-xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {workspaceName}
            </h1>
          </div>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            What would you like to work on?
          </p>
        </div>

        {/* Quick action grid */}
        <div className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard
              key={action.title}
              action={action}
              onClick={() => onAction(action.prompt)}
            />
          ))}
        </div>
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
      className="group flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all duration-150"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderLeftWidth: "3px",
        borderLeftColor: action.color,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = action.color;
        e.currentTarget.style.borderLeftColor = action.color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.borderLeftColor = action.color;
      }}
    >
      <div
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: action.color + "18" }}
      >
        <action.icon
          className="h-5 w-5"
          style={{ color: action.color }}
        />
      </div>
      <div className="min-w-0">
        <div
          className="text-sm font-medium"
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
