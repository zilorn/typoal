export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body instanceof Blob
          ? { "Content-Type": options.body.type || "application/octet-stream" }
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError("连接失败，请检查网络后重试。你的输入已保留。", 0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || "操作失败，请稍后重试。", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
