import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useLocation } from "wouter";
import { User, useGetMe, getToken, storeToken, clearToken } from "@/lib/api-client";

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User, rememberMe?: boolean) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);
  const [, setLocation] = useLocation();

  const { data: me, isLoading: isLoadingMe, error } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    },
  });

  useEffect(() => {
    if (me) {
      setUser(me);
    }
    if (error) {
      logout();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, error]);

  const login = (newToken: string, newUser: User, rememberMe = true) => {
    storeToken(newToken, rememberMe);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    clearToken();
    setToken(null);
    setUser(null);
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading: isLoadingMe && !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
