import { NextResponse } from "next/server";
import { DatabaseUnavailableError } from "@/lib/db";

/**
 * Base controller: uniform JSON envelope and error mapping.
 * Connectivity failures become one typed 503 the UI renders as a friendly
 * "database unreachable" state; nothing ever leaks a stack trace.
 */
export abstract class Controller {
  protected async respond<T>(fn: () => Promise<T>): Promise<NextResponse> {
    try {
      const data = await fn();
      return NextResponse.json({ ok: true, data });
    } catch (err) {
      if (err instanceof DatabaseUnavailableError) {
        return NextResponse.json(
          { ok: false, error: "database_unavailable", message: err.message },
          { status: 503 }
        );
      }
      console.error("API error:", err);
      return NextResponse.json(
        { ok: false, error: "internal", message: "Something went wrong." },
        { status: 500 }
      );
    }
  }

  protected notFound(message: string): NextResponse {
    return NextResponse.json({ ok: false, error: "not_found", message }, { status: 404 });
  }

  protected badRequest(message: string): NextResponse {
    return NextResponse.json({ ok: false, error: "bad_request", message }, { status: 400 });
  }

  /**
   * Like respond(), but a null result from fn becomes a 404 instead of
   * `{ data: null }`.
   */
  protected async respondOr404<T>(
    fn: () => Promise<T | null>,
    message: string
  ): Promise<NextResponse> {
    try {
      const data = await fn();
      if (data === null) return this.notFound(message);
      return NextResponse.json({ ok: true, data });
    } catch (err) {
      if (err instanceof DatabaseUnavailableError) {
        return NextResponse.json(
          { ok: false, error: "database_unavailable", message: err.message },
          { status: 503 }
        );
      }
      console.error("API error:", err);
      return NextResponse.json(
        { ok: false, error: "internal", message: "Something went wrong." },
        { status: 500 }
      );
    }
  }
}
