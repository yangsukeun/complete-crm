import "next-auth";

declare module "next-auth" {
  interface User {
    id?: string;
    role?: string;
    team?: string;
  }

  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: string;
      team?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    team?: string;
  }
}
