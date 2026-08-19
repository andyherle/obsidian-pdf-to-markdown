import type { LinkReferencePlan, LinkStyle } from "../types";

export interface ParsedLink {
  style: LinkStyle;
  embed: boolean;
  target: string;
  subpath: string;
  alias: string;
  hasAlias: boolean;
  markdownTitle: string;
  angleWrapped: boolean;
}

function splitTargetSubpath(value: string): { target: string; subpath: string } {
  const hash = value.indexOf("#");
  if (hash < 0) return { target: value, subpath: "" };
  return { target: value.slice(0, hash), subpath: value.slice(hash) };
}

function firstUnescapedPipe(value: string): number {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "|") continue;
    let backslashes = 0;
    for (let before = index - 1; before >= 0 && value[before] === "\\"; before -= 1) backslashes += 1;
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function parseWiki(original: string): ParsedLink | null {
  const embed = original.startsWith("![[");
  const start = embed ? 3 : 2;
  if ((!embed && !original.startsWith("[[")) || !original.endsWith("]]")) return null;
  const inner = original.slice(start, -2);
  const pipe = firstUnescapedPipe(inner);
  const rawTarget = pipe >= 0 ? inner.slice(0, pipe) : inner;
  const alias = pipe >= 0 ? inner.slice(pipe + 1) : "";
  const { target, subpath } = splitTargetSubpath(rawTarget);
  if (!target.trim()) return null;
  return {
    style: "wiki",
    embed,
    target: target.trim(),
    subpath,
    alias,
    hasAlias: pipe >= 0,
    markdownTitle: "",
    angleWrapped: false
  };
}

function findMarkdownDestinationBoundary(value: string): number {
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (/\s/.test(character)) return index;
  }
  return value.length;
}

function parseMarkdown(original: string): ParsedLink | null {
  const embed = original.startsWith("![");
  const prefixLength = embed ? 2 : 1;
  if ((!embed && !original.startsWith("[")) || !original.endsWith(")")) return null;
  const labelEnd = original.indexOf("](", prefixLength);
  if (labelEnd < 0) return null;
  const alias = original.slice(prefixLength, labelEnd);
  const inside = original.slice(labelEnd + 2, -1).trim();
  if (!inside) return null;

  let rawTarget = "";
  let markdownTitle = "";
  let angleWrapped = false;
  if (inside.startsWith("<")) {
    const close = inside.indexOf(">");
    if (close < 0) return null;
    rawTarget = inside.slice(1, close);
    markdownTitle = inside.slice(close + 1);
    angleWrapped = true;
  } else {
    const boundary = findMarkdownDestinationBoundary(inside);
    rawTarget = inside.slice(0, boundary);
    markdownTitle = inside.slice(boundary);
  }
  const { target, subpath } = splitTargetSubpath(rawTarget);
  if (!target.trim()) return null;
  return {
    style: "markdown",
    embed,
    target: target.trim(),
    subpath,
    alias,
    hasAlias: true,
    markdownTitle,
    angleWrapped
  };
}

export function parseLink(original: string): ParsedLink | null {
  return parseWiki(original) ?? parseMarkdown(original);
}

export function pdfSubpathToMarkdown(subpath: string, includePageHeadings: boolean): string {
  const match = subpath.match(/^#page=(\d+)(?:[&,].*)?$/i);
  if (!match) return subpath;
  return includePageHeadings ? `#Page ${match[1]}` : "";
}

export function renderReplacement(
  reference: LinkReferencePlan,
  wikiTarget: string,
  markdownTarget: string,
  includePageHeadings: boolean
): string {
  const parsed = parseLink(reference.original);
  if (!parsed) throw new Error(`Unsupported link syntax: ${reference.original}`);
  const subpath = pdfSubpathToMarkdown(parsed.subpath, includePageHeadings);

  if (parsed.style === "wiki") {
    const alias = parsed.hasAlias ? `|${parsed.alias}` : "";
    return `${parsed.embed ? "!" : ""}[[${wikiTarget}${subpath}${alias}]]`;
  }

  const destination = `${markdownTarget}${subpath}`;
  const wrapped = parsed.angleWrapped ? `<${destination}>` : destination;
  return `${parsed.embed ? "!" : ""}[${parsed.alias}](${wrapped}${parsed.markdownTitle})`;
}
