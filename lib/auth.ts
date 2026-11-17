import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";

export type User = { id: number; email: string; name: string; role: "admin" | "rep" };

const COOKIE = "dwx_session";
const SESSION_DAYS = 14;

export async function createSession(userId: number): Promise<void> {
  const id = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const d = await db();
  await d.query("insert into sessions (id, user_id, expires_at) values ($1, $2, $3)", [id, userId, expires]);
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await (await db()).query("delete from sessions where id = $1", [id]);
  jar.delete(COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const currentUser = cache(async (): Promise<User | null> => {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const rows = await (await db()).query<User>(
    `select u.id, u.email, u.name, u.role
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()`,
    [id],
  );
  return rows[0] ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
