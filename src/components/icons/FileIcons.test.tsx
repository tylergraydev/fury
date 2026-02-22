import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  getFileIcon,
  TypeScriptIcon,
  JavaScriptIcon,
  RustIcon,
  ReactIcon,
  PythonIcon,
  MarkdownIcon,
  DefaultFileIcon,
  GitIcon,
  DockerIcon,
  NpmIcon,
  LockIcon,
  ViteIcon,
  FolderIcon,
  FolderOpenIcon,
} from "./FileIcons";

describe("getFileIcon - extension mapping", () => {
  it("returns TypeScriptIcon for .ts files", () => {
    expect(getFileIcon("main.ts")).toBe(TypeScriptIcon);
  });

  it("returns ReactIcon for .tsx files", () => {
    expect(getFileIcon("App.tsx")).toBe(ReactIcon);
  });

  it("returns JavaScriptIcon for .js files", () => {
    expect(getFileIcon("index.js")).toBe(JavaScriptIcon);
  });

  it("returns ReactIcon for .jsx files", () => {
    expect(getFileIcon("Component.jsx")).toBe(ReactIcon);
  });

  it("returns RustIcon for .rs files", () => {
    expect(getFileIcon("main.rs")).toBe(RustIcon);
  });

  it("returns PythonIcon for .py files", () => {
    expect(getFileIcon("script.py")).toBe(PythonIcon);
  });

  it("returns MarkdownIcon for .md files", () => {
    expect(getFileIcon("README.md")).toBe(MarkdownIcon);
  });

  it("returns DefaultFileIcon for unknown extensions", () => {
    expect(getFileIcon("file.xyz")).toBe(DefaultFileIcon);
  });

  it("returns DefaultFileIcon for files with no extension", () => {
    expect(getFileIcon("Makefile")).toBe(DefaultFileIcon);
  });
});

describe("getFileIcon - name mapping", () => {
  it("returns GitIcon for .gitignore", () => {
    expect(getFileIcon(".gitignore")).toBe(GitIcon);
  });

  it("returns DockerIcon for Dockerfile", () => {
    expect(getFileIcon("Dockerfile")).toBe(DockerIcon);
  });

  it("returns NpmIcon for package.json", () => {
    expect(getFileIcon("package.json")).toBe(NpmIcon);
  });

  it("returns LockIcon for package-lock.json", () => {
    expect(getFileIcon("package-lock.json")).toBe(LockIcon);
  });

  it("returns ViteIcon for vite.config.ts", () => {
    expect(getFileIcon("vite.config.ts")).toBe(ViteIcon);
  });

  it("returns TypeScriptIcon for tsconfig.json", () => {
    expect(getFileIcon("tsconfig.json")).toBe(TypeScriptIcon);
  });
});

describe("getFileIcon - case insensitivity", () => {
  it("handles uppercase extensions", () => {
    expect(getFileIcon("FILE.TS")).toBe(TypeScriptIcon);
  });

  it("handles mixed case names", () => {
    expect(getFileIcon("DOCKERFILE")).toBe(DockerIcon);
  });
});

describe("icon components render", () => {
  it("renders FolderIcon", () => {
    const { container } = render(<FolderIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders FolderOpenIcon", () => {
    const { container } = render(<FolderOpenIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders DefaultFileIcon with className", () => {
    const { container } = render(<DefaultFileIcon className="test-class" />);
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("test-class");
  });
});
