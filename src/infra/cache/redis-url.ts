/** Remove credenciais de uma URL de conexão antes de registrar em log. */
export function redactRedisUrl(raw: string): string {
  try {
    const url = new URL(raw);

    if (url.username) url.username = "***";
    if (url.password) url.password = "***";

    for (const key of ["password", "auth"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "***");
    }

    return url.toString();
  } catch {
    return "[redis-url]";
  }
}
