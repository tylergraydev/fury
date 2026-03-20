import { useState } from "react";

export function AddEnvVarRow({ onAdd }: { onAdd: (key: string, value: string) => void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const handleAdd = () => {
    if (!key.trim()) return;
    onAdd(key.trim(), value);
    setKey("");
    setValue("");
  };

  return (
    <div className="mt-1 flex gap-1">
      <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="KEY"
        className="w-24 rounded px-1.5 py-0.5 font-mono text-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="value"
        className="flex-1 rounded px-1.5 py-0.5 font-mono text-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        }}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <button
        onClick={handleAdd}
        className="rounded px-2 py-0.5 text-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          color: "var(--text-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        Add
      </button>
    </div>
  );
}
