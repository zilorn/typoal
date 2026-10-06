import "server-only";
import type { APIEvent } from "@solidjs/start/server";
import { matchesOrigin } from "./origin";

export async function proxy({ request }: APIEvent, path?: string) {
  const url = new URL(request.url);
  const maxBodyBytes =
    url.pathname === "/api/images" ? 300 * 1024 * 1024 : 2 * 1024 * 1024;
  if (!["GET", "HEAD"].includes(request.method)) {
    const fetchSite = request.headers.get("sec-fetch-site");
    if (
      !matchesOrigin(request) ||
      (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    ) {
      return Response.json({ error: "请求来源无效" }, { status: 403 });
    }
    const size = Number(request.headers.get("content-length") || 0);
    if (size > maxBodyBytes)
      return Response.json({ error: "提交内容过大" }, { status: 413 });
  }
  const headers = new Headers();
  for (const key of ["cookie", "content-type", "origin", "sec-fetch-site"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set("x-forwarded-host", url.host);
  try {
    let body: Uint8Array<ArrayBuffer> | undefined;
    if (!["GET", "HEAD"].includes(request.method) && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBodyBytes) {
            await reader.cancel();
            return Response.json({ error: "提交内容过大" }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    const response = await fetch(
      `${process.env.API_URL || "http://127.0.0.1:8080"}${path ?? url.pathname}${url.search}`,
      {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(
          url.pathname === "/api/images" ? 600000 : 12000,
        ),
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
