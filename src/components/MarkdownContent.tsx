export default function MarkdownContent(props: { html: string }) {
  // HTML comes exclusively from the shared server-side Markdown sanitizer.
  // eslint-disable-next-line solid/no-innerhtml
  return <div innerHTML={props.html} />;
}
