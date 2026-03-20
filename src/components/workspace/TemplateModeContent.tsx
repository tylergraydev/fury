import { Sparkles } from "lucide-react";
import type { WorkspaceTemplate } from "../../lib/tauri";

interface Props {
  templates: WorkspaceTemplate[];
  loadingTemplates: boolean;
  selectedTemplate: WorkspaceTemplate | null;
  onSelectTemplate: (template: WorkspaceTemplate) => void;
}

export function TemplateModeContent({
  templates,
  loadingTemplates,
  selectedTemplate,
  onSelectTemplate,
}: Props) {
  return (
    <div className="mb-4">
      <div
        className="max-h-40 overflow-y-auto rounded-lg"
        style={{ border: "1px solid var(--border)" }}
      >
        {loadingTemplates ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div
            className="px-3 py-4 text-center text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            No templates saved yet. Create one from Repo Settings.
          </div>
        ) : (
          templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTemplate(t)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors"
              style={{
                backgroundColor:
                  selectedTemplate?.id === t.id
                    ? "var(--bg-hover)"
                    : "transparent",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Sparkles
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                style={{ color: "var(--accent)" }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-xs font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t.name}
                </div>
                {t.description && (
                  <div
                    className="truncate text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {t.description}
                  </div>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
