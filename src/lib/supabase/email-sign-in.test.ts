import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmailSignIn } from "./email-sign-in";

function setup() {
  const signInWithOtp = vi.fn();
  const client = { auth: { signInWithOtp } } as unknown as SupabaseClient;
  return { client, signInWithOtp };
}

describe("email sign-in", () => {
  it("sends a trimmed address with the public callback URL", async () => {
    const { client, signInWithOtp } = setup();
    signInWithOtp.mockResolvedValue({ error: null });
    const result = await sendEmailSignIn(client, " user@example.com ", "https://signal.example");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      options: { emailRedirectTo: "https://signal.example/auth/callback" },
    });
    expect(result.ok).toBe(true);
  });

  it("does not send malformed email addresses", async () => {
    const { client, signInWithOtp } = setup();
    expect((await sendEmailSignIn(client, "invalid", "https://signal.example")).ok).toBe(false);
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("reports provider errors without claiming a link was sent", async () => {
    const { client, signInWithOtp } = setup();
    signInWithOtp.mockResolvedValue({ error: { message: "Email rate limit exceeded" } });
    expect(await sendEmailSignIn(client, "user@example.com", "https://signal.example"))
      .toEqual({ ok: false, message: "Email rate limit exceeded" });
  });

  it("handles network failures", async () => {
    const { client, signInWithOtp } = setup();
    signInWithOtp.mockRejectedValue(new Error("fetch failed"));
    expect((await sendEmailSignIn(client, "user@example.com", "https://signal.example")).ok).toBe(false);
  });
});
