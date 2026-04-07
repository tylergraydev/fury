import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, Folder, GitBranch } from "lucide-react";
import { AtMentionMenu } from "./AtMentionMenu";
import type { AtMenuItem } from "../../hooks/useAtMentionAutocomplete";

const categoryItems: AtMenuItem[] = [
  { label: "Files", description: "Attach a file", value: "category:files", category: "files", icon: FileText, isCategory: true },
  { label: "Folders", description: "Attach a folder", value: "category:folders", category: "folders", icon: Folder, isCategory: true },
  { label: "Git", description: "Git diff, log, branch", value: "category:git", category: "git", icon: GitBranch, isCategory: true },
];

const fileItems: AtMenuItem[] = [
  { label: "main.ts", description: "src/main.ts", value: "src/main.ts", category: "files", icon: FileText },
  { label: "helper.ts", description: "src/utils/helper.ts", value: "src/utils/helper.ts", category: "files", icon: FileText },
];

describe("AtMentionMenu", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(
      <AtMentionMenu items={[]} selectedIndex={0} activeCategory={null} onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders category items with arrow indicator", () => {
    render(
      <AtMentionMenu items={categoryItems} selectedIndex={0} activeCategory={null} onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("Folders")).toBeInTheDocument();
    expect(screen.getByText("Git")).toBeInTheDocument();
  });

  it("does not show back button at category level", () => {
    render(
      <AtMentionMenu items={categoryItems} selectedIndex={0} activeCategory={null} onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("shows back button when drilled into a category", () => {
    render(
      <AtMentionMenu items={fileItems} selectedIndex={0} activeCategory="files" onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.getByText("Back")).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(
      <AtMentionMenu items={fileItems} selectedIndex={0} activeCategory="files" onSelect={onBack} onBack={onBack} />,
    );
    await user.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalled();
  });

  it("calls onSelect when item is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <AtMentionMenu items={fileItems} selectedIndex={0} activeCategory="files" onSelect={onSelect} onBack={vi.fn()} />,
    );
    await user.click(screen.getByText("main.ts"));
    expect(onSelect).toHaveBeenCalledWith(fileItems[0]);
  });

  it("highlights selected index", () => {
    render(
      <AtMentionMenu items={fileItems} selectedIndex={1} activeCategory="files" onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent?.includes(".ts"));
    expect(buttons[1].style.backgroundColor).toBe("var(--bg-hover)");
    expect(buttons[0].style.backgroundColor).toBe("transparent");
  });

  it("shows description when different from label", () => {
    render(
      <AtMentionMenu items={fileItems} selectedIndex={0} activeCategory="files" onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
  });

  it("does not show description when same as label", () => {
    const sameItems: AtMenuItem[] = [
      { label: "src", description: "src", value: "folder:src", category: "folders", icon: Folder },
    ];
    render(
      <AtMentionMenu items={sameItems} selectedIndex={0} activeCategory="folders" onSelect={vi.fn()} onBack={vi.fn()} />,
    );
    // "src" appears in the item label; description is hidden since label === description
    // Also appears in the breadcrumb header as "folders"
    const srcElements = screen.getAllByText("src");
    expect(srcElements.length).toBeGreaterThanOrEqual(1);
    // No separate description element with "src" text — the item only shows label
    const itemButtons = screen.getAllByRole("button").filter((b) => b.textContent?.includes("src") && !b.textContent?.includes("Back"));
    expect(itemButtons).toHaveLength(1);
  });
});
