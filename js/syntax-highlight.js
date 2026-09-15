// Thin wrapper around the vendored highlight.js (js/highlight/, BSD-3-Clause, see its
// own LICENSE file) — only the YAML grammar is registered, since every rendered
// cloud-init output file (user-data/meta-data/network-config) is YAML.
import hljs from "./highlight/es/highlight.js";
import yaml from "./highlight/es/languages/yaml.js";

hljs.registerLanguage("yaml", yaml);

// highlight.js HTML-escapes the source text itself before wrapping it in <span> tokens,
// so the returned string is safe to assign via innerHTML even though the underlying
// content came from a template substitution rather than a hardcoded literal.
export function highlightYaml(code) {
  return hljs.highlight(code, { language: "yaml", ignoreIllegals: true }).value;
}
