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
  HtmlIcon,
  CssIcon,
  JsonIcon,
  TomlIcon,
  YamlIcon,
  ShellIcon,
  GoIcon,
  JavaIcon,
  SwiftIcon,
  CppIcon,
  CIcon,
  SqlIcon,
  ImageIcon,
  ScssIcon,
  XmlIcon,
} from "./FileIcons";

// --- Extension mapping tests ---

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

  it("returns JavaScriptIcon for .mjs files", () => {
    expect(getFileIcon("module.mjs")).toBe(JavaScriptIcon);
  });

  it("returns JavaScriptIcon for .cjs files", () => {
    expect(getFileIcon("config.cjs")).toBe(JavaScriptIcon);
  });

  it("returns RustIcon for .rs files", () => {
    expect(getFileIcon("main.rs")).toBe(RustIcon);
  });

  it("returns PythonIcon for .py files", () => {
    expect(getFileIcon("script.py")).toBe(PythonIcon);
  });

  it("returns JsonIcon for .json files", () => {
    expect(getFileIcon("data.json")).toBe(JsonIcon);
  });

  it("returns MarkdownIcon for .md files", () => {
    expect(getFileIcon("README.md")).toBe(MarkdownIcon);
  });

  it("returns MarkdownIcon for .mdx files", () => {
    expect(getFileIcon("page.mdx")).toBe(MarkdownIcon);
  });

  it("returns CssIcon for .css files", () => {
    expect(getFileIcon("styles.css")).toBe(CssIcon);
  });

  it("returns ScssIcon for .scss files", () => {
    expect(getFileIcon("styles.scss")).toBe(ScssIcon);
  });

  it("returns HtmlIcon for .html files", () => {
    expect(getFileIcon("index.html")).toBe(HtmlIcon);
  });

  it("returns HtmlIcon for .htm files", () => {
    expect(getFileIcon("page.htm")).toBe(HtmlIcon);
  });

  it("returns TomlIcon for .toml files", () => {
    expect(getFileIcon("Cargo.toml")).toBe(TomlIcon);
  });

  it("returns YamlIcon for .yaml files", () => {
    expect(getFileIcon("config.yaml")).toBe(YamlIcon);
  });

  it("returns YamlIcon for .yml files", () => {
    expect(getFileIcon("config.yml")).toBe(YamlIcon);
  });

  it("returns ShellIcon for .sh files", () => {
    expect(getFileIcon("build.sh")).toBe(ShellIcon);
  });

  it("returns ShellIcon for .bash files", () => {
    expect(getFileIcon("run.bash")).toBe(ShellIcon);
  });

  it("returns ShellIcon for .zsh files", () => {
    expect(getFileIcon("init.zsh")).toBe(ShellIcon);
  });

  it("returns GoIcon for .go files", () => {
    expect(getFileIcon("main.go")).toBe(GoIcon);
  });

  it("returns JavaIcon for .java files", () => {
    expect(getFileIcon("Main.java")).toBe(JavaIcon);
  });

  it("returns SwiftIcon for .swift files", () => {
    expect(getFileIcon("App.swift")).toBe(SwiftIcon);
  });

  it("returns CIcon for .c files", () => {
    expect(getFileIcon("main.c")).toBe(CIcon);
  });

  it("returns CIcon for .h files", () => {
    expect(getFileIcon("header.h")).toBe(CIcon);
  });

  it("returns CppIcon for .cpp files", () => {
    expect(getFileIcon("main.cpp")).toBe(CppIcon);
  });

  it("returns CppIcon for .cc files", () => {
    expect(getFileIcon("main.cc")).toBe(CppIcon);
  });

  it("returns CppIcon for .hpp files", () => {
    expect(getFileIcon("header.hpp")).toBe(CppIcon);
  });

  it("returns SqlIcon for .sql files", () => {
    expect(getFileIcon("query.sql")).toBe(SqlIcon);
  });

  it("returns XmlIcon for .xml files", () => {
    expect(getFileIcon("data.xml")).toBe(XmlIcon);
  });

  it("returns XmlIcon for .svg files", () => {
    expect(getFileIcon("icon.svg")).toBe(XmlIcon);
  });

  it("returns ImageIcon for .png files", () => {
    expect(getFileIcon("photo.png")).toBe(ImageIcon);
  });

  it("returns ImageIcon for .jpg files", () => {
    expect(getFileIcon("photo.jpg")).toBe(ImageIcon);
  });

  it("returns ImageIcon for .jpeg files", () => {
    expect(getFileIcon("photo.jpeg")).toBe(ImageIcon);
  });

  it("returns ImageIcon for .gif files", () => {
    expect(getFileIcon("anim.gif")).toBe(ImageIcon);
  });

  it("returns ImageIcon for .ico files", () => {
    expect(getFileIcon("favicon.ico")).toBe(ImageIcon);
  });

  it("returns ImageIcon for .webp files", () => {
    expect(getFileIcon("image.webp")).toBe(ImageIcon);
  });

  it("returns DefaultFileIcon for unknown extensions", () => {
    expect(getFileIcon("file.xyz")).toBe(DefaultFileIcon);
  });

  it("returns DefaultFileIcon for files with no extension", () => {
    expect(getFileIcon("Makefile")).toBe(DefaultFileIcon);
  });
});

// --- Name mapping tests ---

describe("getFileIcon - name mapping", () => {
  it("returns GitIcon for .gitignore", () => {
    expect(getFileIcon(".gitignore")).toBe(GitIcon);
  });

  it("returns GitIcon for .gitmodules", () => {
    expect(getFileIcon(".gitmodules")).toBe(GitIcon);
  });

  it("returns GitIcon for .gitattributes", () => {
    expect(getFileIcon(".gitattributes")).toBe(GitIcon);
  });

  it("returns DockerIcon for Dockerfile", () => {
    expect(getFileIcon("Dockerfile")).toBe(DockerIcon);
  });

  it("returns DockerIcon for docker-compose.yml", () => {
    expect(getFileIcon("docker-compose.yml")).toBe(DockerIcon);
  });

  it("returns DockerIcon for docker-compose.yaml", () => {
    expect(getFileIcon("docker-compose.yaml")).toBe(DockerIcon);
  });

  it("returns NpmIcon for package.json", () => {
    expect(getFileIcon("package.json")).toBe(NpmIcon);
  });

  it("returns LockIcon for package-lock.json", () => {
    expect(getFileIcon("package-lock.json")).toBe(LockIcon);
  });

  it("returns LockIcon for cargo.lock", () => {
    expect(getFileIcon("cargo.lock")).toBe(LockIcon);
  });

  it("returns LockIcon for yarn.lock", () => {
    expect(getFileIcon("yarn.lock")).toBe(LockIcon);
  });

  it("returns LockIcon for pnpm-lock.yaml", () => {
    expect(getFileIcon("pnpm-lock.yaml")).toBe(LockIcon);
  });

  it("returns ViteIcon for vite.config.ts", () => {
    expect(getFileIcon("vite.config.ts")).toBe(ViteIcon);
  });

  it("returns ViteIcon for vite.config.js", () => {
    expect(getFileIcon("vite.config.js")).toBe(ViteIcon);
  });

  it("returns ViteIcon for vite.config.mts", () => {
    expect(getFileIcon("vite.config.mts")).toBe(ViteIcon);
  });

  it("returns TypeScriptIcon for tsconfig.json", () => {
    expect(getFileIcon("tsconfig.json")).toBe(TypeScriptIcon);
  });

  it("returns TypeScriptIcon for tsconfig.node.json", () => {
    expect(getFileIcon("tsconfig.node.json")).toBe(TypeScriptIcon);
  });

  it("returns TypeScriptIcon for tsconfig.app.json", () => {
    expect(getFileIcon("tsconfig.app.json")).toBe(TypeScriptIcon);
  });
});

// --- Case insensitivity ---

describe("getFileIcon - case insensitivity", () => {
  it("handles uppercase extensions", () => {
    expect(getFileIcon("FILE.TS")).toBe(TypeScriptIcon);
  });

  it("handles mixed case names", () => {
    expect(getFileIcon("DOCKERFILE")).toBe(DockerIcon);
  });
});

// --- Icon component rendering tests ---

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

  it("renders TypeScriptIcon", () => {
    const { container } = render(<TypeScriptIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders JavaScriptIcon", () => {
    const { container } = render(<JavaScriptIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders RustIcon", () => {
    const { container } = render(<RustIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders PythonIcon", () => {
    const { container } = render(<PythonIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders HtmlIcon", () => {
    const { container } = render(<HtmlIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders CssIcon", () => {
    const { container } = render(<CssIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders JsonIcon", () => {
    const { container } = render(<JsonIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders MarkdownIcon", () => {
    const { container } = render(<MarkdownIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders GitIcon", () => {
    const { container } = render(<GitIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders TomlIcon", () => {
    const { container } = render(<TomlIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders YamlIcon", () => {
    const { container } = render(<YamlIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders ShellIcon", () => {
    const { container } = render(<ShellIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders GoIcon", () => {
    const { container } = render(<GoIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders JavaIcon", () => {
    const { container } = render(<JavaIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders SwiftIcon", () => {
    const { container } = render(<SwiftIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders CppIcon", () => {
    const { container } = render(<CppIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders CIcon", () => {
    const { container } = render(<CIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders SqlIcon", () => {
    const { container } = render(<SqlIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders ImageIcon", () => {
    const { container } = render(<ImageIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders LockIcon", () => {
    const { container } = render(<LockIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders ReactIcon", () => {
    const { container } = render(<ReactIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders ScssIcon", () => {
    const { container } = render(<ScssIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders XmlIcon", () => {
    const { container } = render(<XmlIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders DockerIcon", () => {
    const { container } = render(<DockerIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders NpmIcon", () => {
    const { container } = render(<NpmIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders ViteIcon", () => {
    const { container } = render(<ViteIcon />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
