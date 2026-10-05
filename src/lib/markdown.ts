import { marked } from "marked";
import sanitize from "sanitize-html";

export function renderMarkdown(content: string) {
  return sanitize(
    marked.parse(content, { async: false, gfm: true, breaks: false }),
    {
      allowedTags: [
        ...sanitize.defaults.allowedTags,
        "img",
        "h1",
        "h2",
        "details",
        "summary",
        "del",
      ],
      allowedAttributes: {
        ...sanitize.defaults.allowedAttributes,
        code: ["class"],
        img: ["src", "alt", "title", "width", "height", "loading"],
        a: ["href", "title", "rel", "target"],
      },
      allowedSchemes: ["https", "http", "mailto"],
      allowProtocolRelative: false,
      transformTags: {
        a: sanitize.simpleTransform("a", { rel: "noopener noreferrer" }),
        img: sanitize.simpleTransform("img", { loading: "lazy" }),
      },
    },
  );
}
