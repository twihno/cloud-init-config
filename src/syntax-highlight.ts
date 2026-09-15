// Thin wrapper around highlight.js — only the core + YAML grammar are imported, since
// every rendered cloud-init output file (user-data/meta-data/network-config) is YAML.
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";

hljs.registerLanguage("yaml", yaml);

// highlight.js HTML-escapes the source text itself before wrapping it in <span> tokens,
// so the returned string is safe to assign via innerHTML even though the underlying
// content came from a template substitution rather than a hardcoded literal.
export function highlightYaml(code: string): string {
  return hljs.highlight(code, { language: "yaml", ignoreIllegals: true }).value;
}
