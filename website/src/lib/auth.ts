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
  session: { strategy: "jwt" },
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
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = (token.role as string) ?? "CUSTOMER";
      }
      return session;
    },
  },
});
