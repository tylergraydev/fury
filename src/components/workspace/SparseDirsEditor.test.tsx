import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SparseDirsEditor } from "./SparseDirsEditor";
import { listRepoDirectories } from "../../lib/tauri";

vi.mock("../../lib/tauri", () => ({
  listRepoDirectories: vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SparseDirsEditor", () => {
  it("shows loading state initially", () => {
    vi.mocked(listRepoDirectories).mockReturnValue(new Promise(() => {}));
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={[]} onChange={vi.fn()} />,
    );
    expect(screen.getByText("Loading directories...")).toBeInTheDocument();
  });

  it("shows empty state when no directories found", async () => {
    vi.mocked(listRepoDirectories).mockResolvedValue([]);
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={[]} onChange={vi.fn()} />,
    );
    expect(await screen.findByText("No directories found at repo root.")).toBeInTheDocument();
  });

  it("renders directories with checkboxes", async () => {
    vi.mocked(listRepoDirectories).mockResolvedValue(["src", "tests", "docs"]);
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={["src"]} onChange={vi.fn()} />,
    );
    expect(await screen.findByText("src/")).toBeInTheDocument();
    expect(screen.getByText("tests/")).toBeInTheDocument();
    expect(screen.getByText("docs/")).toBeInTheDocument();
  });

  it("checks selected directories", async () => {
    vi.mocked(listRepoDirectories).mockResolvedValue(["src", "tests"]);
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={["src"]} onChange={vi.fn()} />,
    );
    await screen.findByText("src/");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked(); // src
    expect(checkboxes[1]).not.toBeChecked(); // tests
  });

  it("calls onChange when toggling a directory", async () => {
    vi.mocked(listRepoDirectories).mockResolvedValue(["src", "tests"]);
    const onChange = vi.fn();
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={["src"]} onChange={onChange} />,
    );
    await screen.findByText("src/");
    // Click tests checkbox to add it
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith(["src", "tests"]);
  });

  it("removes directory from selection when unchecked", async () => {
    vi.mocked(listRepoDirectories).mockResolvedValue(["src", "tests"]);
    const onChange = vi.fn();
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={["src", "tests"]} onChange={onChange} />,
    );
    await screen.findByText("src/");
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]); // Uncheck src
    expect(onChange).toHaveBeenCalledWith(["tests"]);
  });

  it("shows error state on failure", async () => {
    vi.mocked(listRepoDirectories).mockRejectedValue(new Error("fetch failed"));
    render(
      <SparseDirsEditor repoId="r1" selectedDirs={[]} onChange={vi.fn()} />,
    );
    expect(await screen.findByText("Error: fetch failed")).toBeInTheDocument();
  });
});
