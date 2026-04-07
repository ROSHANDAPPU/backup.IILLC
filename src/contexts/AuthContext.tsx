import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type AppRole = "admin" | "manager" | "photographer" | "assistant" | "logistics";

interface AuthContextType {
  user: User | null;
  profile: Record<string, unknown> | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isManager: boolean;
  isPhotographer: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    console.log("Fetching user data for:", userId);
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (profileRes.error) {
      console.error("Error fetching profile:", profileRes.error);
      alert(`Profile Error: ${profileRes.error.message || JSON.stringify(profileRes.error)}`);
    } else if (profileRes.data) {
      console.log("Profile fetched successfully:", profileRes.data);
      setProfile(profileRes.data);
    }

    if (rolesRes.error) {
      console.error("Error fetching roles:", rolesRes.error);
      alert(`Roles Error: ${rolesRes.error.message || JSON.stringify(rolesRes.error)}`);
    } else if (rolesRes.data) {
      console.log("Roles fetched successfully:", rolesRes.data);
      setRoles(rolesRes.data.map((r) => r.role as AppRole));
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUser(session.user);
        await fetchUserData(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setRoles([]);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const signOut = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      supabase.auth.signOut().catch(() => { });
      window.location.href = "/";
    } catch (err) {
      window.location.href = "/";
    }
  };

  const hasRole = (role: AppRole) => roles.includes(role);

  return (
    <AuthContext.Provider
      value={{
        user, profile, roles, loading,
        signIn, signUp, signOut, hasRole,
        isAdmin: hasRole("admin"),
        isManager: hasRole("manager"),
        isPhotographer: hasRole("photographer"),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
