import sanitizeHtml from "sanitize-html";

/** Parse and decode editable policy HTML before enforcing its small presentation allowlist. */
export function sanitizePolicyHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ["p", "br", "strong", "em", "u", "ul", "ol", "li", "h2", "h3", "a"],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: [
      "script",
      "style",
      "textarea",
      "option",
      "iframe",
      "object",
      "embed",
      "form",
      "button",
    ],
  });
}
