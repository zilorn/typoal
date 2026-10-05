import type { APIEvent } from "@solidjs/start/server";
import { renderMarkdown } from "~/lib/markdown";
import { matchesOrigin } from "~/lib/origin";

export async function POST({ request }: APIEvent) {
  if (!matchesOrigin(request))
    return Response.json({ error: "请求来源无效" }, { status: 403 });
  try {
    const session = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:8080"}/api/auth/session`,
      {
        headers: { cookie: request.headers.get("cookie") || "" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!session.ok || !(await session.json()).authenticated)
      return Response.json(
        { error: "登录已过期，请重新登录" },
        { status: 401 },
      );
    if (Number(request.headers.get("content-length") || 0) > 2 * 1024 * 1024)
      return Response.json({ error: "正文过大" }, { status: 413 });
    const text = await request.text();
    if (text.length > 2 * 1024 * 1024)
      return Response.json({ error: "正文过大" }, { status: 413 });
    const { content } = JSON.parse(text);
    if (typeof content !== "string" || content.length > 1024 * 1024)
      return Response.json({ error: "正文无效或过大" }, { status: 422 });
    return Response.json(
      { html: renderMarkdown(content) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "暂时无法生成预览" }, { status: 500 });
  }
}
