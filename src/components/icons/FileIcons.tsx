import type React from "react";

const S = 16;

interface IconProps {
  className?: string;
}

// -- Folders --

export function FolderIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path
        d="M2 3h3.5l1.5 1.5H14a1 1 0 011 1V13a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1z"
        fill="none"
        stroke="#9E8A78"
        strokeWidth="1"
      />
    </svg>
  );
}

export function FolderOpenIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path
        d="M2 3h3.5l1.5 1.5H14a1 1 0 011 1V7H7L5.5 8.5H1V4a1 1 0 011-1z"
        fill="none"
        stroke="#9E8A78"
        strokeWidth="1"
      />
      <path
        d="M1 8.5h4.5L7 7h8v6a1 1 0 01-1 1H2a1 1 0 01-1-1V8.5z"
        fill="none"
        stroke="#9E8A78"
        strokeWidth="1"
      />
    </svg>
  );
}

// -- Language icons --

export function TypeScriptIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#3178C6" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        TS
      </text>
    </svg>
  );
}

export function JavaScriptIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#F7DF1E" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="#323330"
      >
        JS
      </text>
    </svg>
  );
}

export function RustIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <circle cx="8" cy="8" r="7" fill="none" stroke="#CE422B" strokeWidth="1.5" />
      <text
        x="8"
        y="11.5"
        textAnchor="middle"
        fontSize="8"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="#CE422B"
      >
        R
      </text>
    </svg>
  );
}

export function PythonIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path d="M8 1C5 1 5 2.5 5 3.5V5h3v1H3.5S1 5.8 1 8.5 3 12 3 12h1.5V9.5C4.5 8 5.5 7 7 7h3c1 0 2-1 2-2V3.5C12 2 10.5 1 8 1zm-1.5 1.5a.75.75 0 110 1.5.75.75 0 010-1.5z" fill="#3572A5" />
      <path d="M8 15c3 0 3-1.5 3-2.5V11H8v-1h4.5S15 10.2 15 7.5 13 4 13 4h-1.5v2.5c0 1.5-1 2.5-2.5 2.5H6c-1 0-2 1-2 2v1.5C4 14 5.5 15 8 15zm1.5-1.5a.75.75 0 110-1.5.75.75 0 010 1.5z" fill="#FFD43B" />
    </svg>
  );
}

export function HtmlIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#E44D26" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        {"</>"}
      </text>
    </svg>
  );
}

export function CssIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#1572B6" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        #
      </text>
    </svg>
  );
}

export function JsonIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <text
        x="8"
        y="12.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="400"
        fontFamily="system-ui, sans-serif"
        fill="#F7DF1E"
      >
        {"{}"}
      </text>
    </svg>
  );
}

export function MarkdownIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="2.5" width="14" height="11" rx="1.5" fill="none" stroke="#848484" strokeWidth="1" />
      <path d="M3.5 10V6l2 2.5L7.5 6v4M10 10V6l2.5 2.5" fill="none" stroke="#848484" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GitIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path
        d="M15.1 7.3L8.7.9a1.2 1.2 0 00-1.7 0L5.7 2.2l2.1 2.1a1.4 1.4 0 011.8 1.8l2 2a1.4 1.4 0 11-.8.8l-1.9-1.9v5a1.4 1.4 0 11-1.1 0V6.8a1.4 1.4 0 01-.8-1.8L5 2.9.9 7a1.2 1.2 0 000 1.7l6.4 6.4a1.2 1.2 0 001.7 0l6.1-6.1a1.2 1.2 0 000-1.7"
        fill="#E44D26"
      />
    </svg>
  );
}

export function TomlIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="2" y="1" width="12" height="14" rx="1.5" fill="none" stroke="#848484" strokeWidth="1" />
      <line x1="4.5" y1="5" x2="11.5" y2="5" stroke="#848484" strokeWidth="1" />
      <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="#848484" strokeWidth="1" />
      <line x1="4.5" y1="11" x2="9" y2="11" stroke="#848484" strokeWidth="1" />
    </svg>
  );
}

export function YamlIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="#CB171E"
      >
        yml
      </text>
    </svg>
  );
}

export function ShellIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#2B2B2B" />
      <path d="M4 5l3 3-3 3" fill="none" stroke="#4EC9B0" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="9" y1="11" x2="12" y2="11" stroke="#4EC9B0" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function GoIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#00ADD8" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        Go
      </text>
    </svg>
  );
}

export function JavaIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#B07219" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        J
      </text>
    </svg>
  );
}

export function SwiftIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#F05138" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        S
      </text>
    </svg>
  );
}

export function CppIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#659AD2" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        C++
      </text>
    </svg>
  );
}

export function CIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#555555" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        C
      </text>
    </svg>
  );
}

export function SqlIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <ellipse cx="8" cy="4" rx="6" ry="2.5" fill="none" stroke="#E8A427" strokeWidth="1" />
      <path d="M2 4v8c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V4" fill="none" stroke="#E8A427" strokeWidth="1" />
      <ellipse cx="8" cy="8" rx="6" ry="2.5" fill="none" stroke="#E8A427" strokeWidth="0.7" opacity="0.5" />
    </svg>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" fill="none" stroke="#A074C4" strokeWidth="1" />
      <circle cx="5.5" cy="5.5" r="1.5" fill="#A074C4" />
      <path d="M1.5 11l3-3 2 2 3-4 5 5v1.5a1.5 1.5 0 01-1.5 1.5h-10a1.5 1.5 0 01-1.5-1.5V11z" fill="#A074C4" opacity={0.5} />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="3" y="7" width="10" height="8" rx="1.5" fill="#848484" />
      <path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="#848484" strokeWidth="1.3" />
      <circle cx="8" cy="11" r="1" fill="#2B2B2B" />
    </svg>
  );
}

export function DefaultFileIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path
        d="M3 1.5h6.5L13 5v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-13a1 1 0 011-1z"
        fill="none"
        stroke="#848484"
        strokeWidth="1"
      />
      <path d="M9.5 1.5V5H13" fill="none" stroke="#848484" strokeWidth="1" />
    </svg>
  );
}

export function ReactIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <circle cx="8" cy="8" r="1.5" fill="#61DAFB" />
      <ellipse cx="8" cy="8" rx="7" ry="2.8" fill="none" stroke="#61DAFB" strokeWidth="0.8" />
      <ellipse cx="8" cy="8" rx="7" ry="2.8" fill="none" stroke="#61DAFB" strokeWidth="0.8" transform="rotate(60 8 8)" />
      <ellipse cx="8" cy="8" rx="7" ry="2.8" fill="none" stroke="#61DAFB" strokeWidth="0.8" transform="rotate(120 8 8)" />
    </svg>
  );
}

export function ScssIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="1" width="14" height="14" rx="2" fill="#CF649A" />
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="8"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="white"
      >
        S
      </text>
    </svg>
  );
}

export function XmlIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <text
        x="8"
        y="12"
        textAnchor="middle"
        fontSize="7"
        fontWeight="bold"
        fontFamily="system-ui, sans-serif"
        fill="#E37933"
      >
        {"</>"}
      </text>
    </svg>
  );
}

export function DockerIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path d="M1 8h3V5h3V2h3v3h3v3h2a3.5 3.5 0 01-1 2.5A5 5 0 019.5 14C5 14 1 11 1 8z" fill="#2496ED" />
      <rect x="4.5" y="5.5" width="2" height="2" rx="0.3" fill="white" />
      <rect x="7.5" y="5.5" width="2" height="2" rx="0.3" fill="white" />
      <rect x="7.5" y="2.5" width="2" height="2" rx="0.3" fill="white" />
      <rect x="10.5" y="5.5" width="2" height="2" rx="0.3" fill="white" />
      <rect x="1.5" y="8.5" width="2" height="2" rx="0.3" fill="white" />
    </svg>
  );
}

export function NpmIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <rect x="1" y="3" width="14" height="10" fill="#CB3837" rx="1" />
      <rect x="3" y="5" width="3.5" height="6" fill="white" />
      <rect x="4.5" y="5" width="1.5" height="4.5" fill="#CB3837" />
      <rect x="8" y="5" width="2" height="6" fill="white" />
      <rect x="9" y="5" width="1" height="4.5" fill="#CB3837" />
    </svg>
  );
}

export function ViteIcon({ className }: IconProps) {
  return (
    <svg width={S} height={S} viewBox="0 0 16 16" className={className}>
      <path d="M14.5 2.5L8.3 14.5 6 6.3l-4.5 1" fill="none" stroke="#646CFF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 6.3L14.5 2.5" fill="none" stroke="#FFBD2E" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// -- Resolver --

type FileIconComponent = (props: IconProps) => React.ReactElement;

const EXT_MAP: Record<string, FileIconComponent> = {
  ts: TypeScriptIcon,
  tsx: ReactIcon,
  js: JavaScriptIcon,
  jsx: ReactIcon,
  mjs: JavaScriptIcon,
  cjs: JavaScriptIcon,
  rs: RustIcon,
  py: PythonIcon,
  json: JsonIcon,
  md: MarkdownIcon,
  mdx: MarkdownIcon,
  css: CssIcon,
  scss: ScssIcon,
  html: HtmlIcon,
  htm: HtmlIcon,
  toml: TomlIcon,
  yaml: YamlIcon,
  yml: YamlIcon,
  sh: ShellIcon,
  bash: ShellIcon,
  zsh: ShellIcon,
  go: GoIcon,
  java: JavaIcon,
  swift: SwiftIcon,
  c: CIcon,
  h: CIcon,
  cpp: CppIcon,
  cc: CppIcon,
  hpp: CppIcon,
  sql: SqlIcon,
  xml: XmlIcon,
  svg: XmlIcon,
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  gif: ImageIcon,
  ico: ImageIcon,
  webp: ImageIcon,
};

const NAME_MAP: Record<string, FileIconComponent> = {
  ".gitignore": GitIcon,
  ".gitmodules": GitIcon,
  ".gitattributes": GitIcon,
  "dockerfile": DockerIcon,
  "docker-compose.yml": DockerIcon,
  "docker-compose.yaml": DockerIcon,
  "package.json": NpmIcon,
  "package-lock.json": LockIcon,
  "cargo.lock": LockIcon,
  "yarn.lock": LockIcon,
  "pnpm-lock.yaml": LockIcon,
  "vite.config.ts": ViteIcon,
  "vite.config.js": ViteIcon,
  "vite.config.mts": ViteIcon,
  "tsconfig.json": TypeScriptIcon,
  "tsconfig.node.json": TypeScriptIcon,
  "tsconfig.app.json": TypeScriptIcon,
};

// eslint-disable-next-line react-refresh/only-export-components
export function getFileIcon(name: string): FileIconComponent {
  const lower = name.toLowerCase();

  if (NAME_MAP[lower]) return NAME_MAP[lower];

  const ext = lower.split(".").pop()!;
  if (EXT_MAP[ext]) return EXT_MAP[ext];

  return DefaultFileIcon;
}
