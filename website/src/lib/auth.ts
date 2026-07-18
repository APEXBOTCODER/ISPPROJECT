import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
    // Inactivity timeout: the session is valid for 30 minutes and is refreshed
    // on activity (any authenticated request), so 30 minutes with no activity
    // invalidates it server-side. The client-side <IdleLogout> signs the user
    // out immediately at 30 minutes idle for a cleaner experience.
    maxAge: 30 * 60,
    updateAge: 5 * 60,
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;
        if (!user.active) return null; // deactivated accounts can't sign in

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
    // Google sign-in activates automatically once AUTH_GOOGLE_ID/SECRET are set
    ...(config.googleAuthEnabled ? [Google] : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "google" && token.email) {
        // First-party account record for OAuth users
        const dbUser = await prisma.user.upsert({
          where: { email: token.email.toLowerCase() },
          update: { emailVerified: new Date() },
          create: {
            email: token.email.toLowerCase(),
            name: token.name ?? token.email,
            emailVerified: new Date(),
          },
        });
        token.uid = dbUser.id;
        token.role = dbUser.role;
      } else if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? "CUSTOMER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        // Re-check the account each request so a deactivation (or role change)
        // takes effect immediately, even for already-issued JWTs.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: { active: true, role: true },
        });
        if (!dbUser || !dbUser.active) {
          // Deactivated/removed → present no authenticated user (locks them out).
          delete (session as { user?: unknown }).user;
          return session;
        }
        session.user.id = token.uid as string;
        session.user.role = dbUser.role ?? "CUSTOMER";
      }
      return session;
    },
  },
});
