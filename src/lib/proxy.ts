import "server-only";
import type { APIEvent } from "@solidjs/start/server";
import { matchesOrigin } from "./origin";

export async function proxy({ request }: APIEvent, path?: string) {
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      !matchesOrigin(request) ||
      (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    ) {
      return Response.json({ error: "请求来源无效" }, { status: 403 });
    }
    const size = Number(request.headers.get("content-length") || 0);
    if (size > 2 * 1024 * 1024)
      return Response.json({ error: "提交内容过大" }, { status: 413 });
  }
  const headers = new Headers();
  for (const key of ["cookie", "content-type", "origin", "sec-fetch-site"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("x-forwarded-host", url.host);
  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 2 * 1024 * 1024)
      return Response.json({ error: "提交内容过大" }, { status: 413 });
    const response = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:8080"}${path ?? url.pathname}${url.search}`,
      {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(12000),
      },
    );
    const outgoing = new Headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    for (const key of ["content-type", "set-cookie", "retry-after"]) {
      const value = response.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { error: "服务暂时不可用，请稍后重试" },
      { status: 502 },
    );
  }
}
