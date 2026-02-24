import { CheckCircle, XCircle, Info, X } from "lucide-react";
import { useToastStore } from "../stores/toastStore";

const icons = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colors = {
  success: "var(--success)",
  error: "var(--error)",
  info: "var(--accent)",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className="toast-slide-in flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              minWidth: 240,
            }}
          >
            <Icon
              className="h-4 w-4 flex-shrink-0"
              style={{ color: colors[toast.type] }}
            />
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 rounded p-0.5 transition-colors hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
