import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { apiGet, apiPost, apiDelete, setToken, getToken, clearToken } from "@/src/api";
import { runOwnerTeardown } from "@/src/owner/teardown";

/**
 * App-wide authentication.
 *
 * Identity is the authenticated EMAIL — Google, Apple and email-link logins with
 * the same address all resolve to one backend account. After every successful
 * sign-in we call RevenueCat `logIn(user_id)` (iOS native only) so the premium
 * entitlement follows the account, and sync it to the backend.
 */

export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  is_premium?: boolean;
  is_guest?: boolean;
  [key: string]: any;
};

export type AuthResult = { ok: boolean; cancelled?: boolean; error?: string };

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<AuthResult>;
  loginWithApple: () => Promise<AuthResult>;
  requestMagicLink: (email: string) => Promise<{ ok: boolean; devCode?: string; error?: string }>;
  verifyMagicCode: (email: string, code: string) => Promise<AuthResult>;
  continueAsGuest: () => Promise<AuthResult>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<AuthResult>;
};

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  loginWithGoogle: async () => ({ ok: false }),
  loginWithApple: async () => ({ ok: false }),
  requestMagicLink: async () => ({ ok: false }),
  verifyMagicCode: async () => ({ ok: false }),
  continueAsGuest: async () => ({ ok: false }),
  refreshUser: async () => {},
  logout: async () => {},
  deleteAccount: async () => ({ ok: false }),
});

// Native-only modules (same guard pattern as PremiumContext)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Purchases: any = Platform.OS === "web" ? null : require("react-native-purchases").default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AppleAuthentication: any = Platform.OS === "ios" ? require("expo-apple-authentication") : null;

function extractParam(url: string, name: string): string | null {
  const m = url.match(new RegExp(`[#?&]${name}=([^&#]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function syncPurchases(userId: string) {
  if (Platform.OS !== "ios" || !Purchases) return;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    const ent = customerInfo?.entitlements?.active?.premium;
    await apiPost("/billing/revenuecat/sync", {
      is_premium: !!ent,
      product_id: ent?.productIdentifier ?? null,
      expires_at: ent?.expirationDate ?? null,
    });
  } catch (e) {
    console.warn("[auth] purchases sync failed", e);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const establishSession = useCallback(async (sessionToken: string) => {
    await setToken(sessionToken);
    // Always fetch /auth/me — it's the canonical user object incl. is_premium
    const me = await apiGet<AuthUser>("/auth/me");
    setUser(me);
    // Refresh once the purchases sync completes so premium changes reflect immediately
    syncPurchases(me.user_id).then(async () => {
      try {
        setUser(await apiGet<AuthUser>("/auth/me"));
      } catch {
        // keep current user on refresh failure
      }
    });
  }, []);

  // Exchange an Emergent session_id (Google OAuth) for our app session
  const processSessionId = useCallback(async (sessionId: string) => {
    const res = await apiPost<{ session_token: string; user: AuthUser }>("/auth/google/session", {
      session_token: sessionId,
    });
    await establishSession(res.session_token);
  }, [establishSession]);

  // Handle deep links carrying either an Emergent session_id or our own session_token
  const handleUrl = useCallback(async (url: string): Promise<boolean> => {
    const sid = extractParam(url, "session_id");
    if (sid) {
      try {
        await processSessionId(sid);
        return true;
      } catch (e) {
        console.warn("[auth] session_id exchange failed", e);
        return false;
      }
    }
    const tok = extractParam(url, "session_token");
    if (tok) {
      try {
        await establishSession(tok);
        return true;
      } catch (e) {
        console.warn("[auth] session_token restore failed", e);
        return false;
      }
    }
    return false;
  }, [processSessionId, establishSession]);

  // Boot: process redirect params first (avoids races), then check stored session
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const href = window.location.href;
          const sid = extractParam(href, "session_id");
          const appTok = extractParam(href, "app_session");
          if (sid || appTok) {
            window.history.replaceState(null, "", window.location.pathname);
            try {
              if (sid) await processSessionId(sid);
              else if (appTok) await establishSession(appTok);
              return;
            } catch (e) {
              console.warn("[auth] web redirect processing failed", e);
            }
          }
        } else {
          const initial = await Linking.getInitialURL();
          if (initial) {
            const handled = await handleUrl(initial);
            if (handled) return;
          }
        }
        const stored = await getToken();
        if (stored) {
          try {
            const me = await apiGet<AuthUser>("/auth/me");
            if (mounted) setUser(me);
            syncPurchases(me.user_id).then(async () => {
              try {
                const fresh = await apiGet<AuthUser>("/auth/me");
                if (mounted) setUser(fresh);
              } catch {
                // keep current user
              }
            });
          } catch {
            await clearToken();
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    if (Platform.OS !== "web") {
      const sub = Linking.addEventListener("url", (e) => {
        handleUrl(e.url);
      });
      return () => {
        mounted = false;
        sub.remove();
      };
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<AuthResult> => {
    try {
      const redirectUrl = Platform.OS === "web"
        ? window.location.origin + "/"
        : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === "web") {
        window.location.href = authUrl;
        return { ok: true };
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === "success" && (result as any).url) {
        const sid = extractParam((result as any).url, "session_id");
        if (sid) {
          await processSessionId(sid);
          return { ok: true };
        }
        return { ok: false, error: "We couldn't complete sign-in. Please try again." };
      }
      if (result.type === "cancel" || result.type === "dismiss") {
        return { ok: false, cancelled: true };
      }
      return { ok: false, error: "We couldn't complete sign-in. Please try again." };
    } catch (e: any) {
      console.warn("[auth] google login failed", e);
      return { ok: false, error: "Network hiccup — check your connection and try again." };
    }
  }, [processSessionId]);

  const loginWithApple = useCallback(async (): Promise<AuthResult> => {
    if (Platform.OS !== "ios" || !AppleAuthentication) {
      return { ok: false, error: "Sign in with Apple is only available on iOS." };
    }
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential?.identityToken) {
        return { ok: false, error: "Apple didn't return a credential. Please try again." };
      }
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const res = await apiPost<{ session_token: string; user: AuthUser }>("/auth/apple/session", {
        identity_token: credential.identityToken,
        full_name: fullName || null,
      });
      await establishSession(res.session_token);
      return { ok: true };
    } catch (e: any) {
      if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "ERR_CANCELED") {
        return { ok: false, cancelled: true };
      }
      console.warn("[auth] apple login failed", e);
      const msg = String(e?.message || "");
      return {
        ok: false,
        error: msg.includes("400") || msg.includes("401")
          ? "Apple sign-in couldn't be verified. Please try again."
          : "Network hiccup — check your connection and try again.",
      };
    }
  }, [establishSession]);

  const requestMagicLink = useCallback(async (email: string) => {
    try {
      const res = await apiPost<{ sent: boolean; dev_code?: string }>("/auth/email/request", { email });
      return { ok: true, devCode: res.dev_code };
    } catch (e: any) {
      const msg = String(e?.message || "");
      return {
        ok: false,
        error: msg.includes("400")
          ? "Please enter a valid email address."
          : "Couldn't send the email — check your connection and try again.",
      };
    }
  }, []);

  const verifyMagicCode = useCallback(async (email: string, code: string): Promise<AuthResult> => {
    try {
      const res = await apiPost<{ session_token: string; user: AuthUser }>("/auth/email/verify", { email, code });
      await establishSession(res.session_token);
      return { ok: true };
    } catch (e: any) {
      const msg = String(e?.message || "");
      return {
        ok: false,
        error: msg.includes("401")
          ? "That code is invalid or expired. Request a new one."
          : "Network hiccup — check your connection and try again.",
      };
    }
  }, [establishSession]);

  const continueAsGuest = useCallback(async (): Promise<AuthResult> => {
    try {
      const res = await apiPost<{ session_token: string; user: AuthUser }>("/auth/guest/session", {});
      await establishSession(res.session_token);
      return { ok: true };
    } catch (e) {
      console.warn("[auth] guest session failed", e);
      return { ok: false, error: "Couldn't start browsing — check your connection and try again." };
    }
  }, [establishSession]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiGet<AuthUser>("/auth/me"));
    } catch {
      // keep current user on refresh failure
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost("/auth/logout");
    } catch {
      // best effort — clear locally regardless
    }
    await clearToken();
    if (Platform.OS === "ios" && Purchases) {
      try {
        await Purchases.logOut();
      } catch {
        // already anonymous — fine
      }
    }
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (): Promise<AuthResult> => {
    try {
      await apiDelete("/auth/me");
    } catch (e: any) {
      console.warn("[auth] delete account failed", e);
      return { ok: false, error: "Couldn't delete your account. Please check your connection and try again." };
    }
    // The server confirmed the deletion, so tear down this device's local
    // namespace for that account. The guest namespace is deliberately untouched.
    await runOwnerTeardown("account");

    // Fully sign the user out — clear session token + RevenueCat identity — and
    // reset state so the app returns to the login screen.
    await clearToken();
    if (Platform.OS === "ios" && Purchases) {
      try {
        await Purchases.logOut();
      } catch {
        // already anonymous — fine
      }
    }
    setUser(null);
    return { ok: true };
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, loginWithGoogle, loginWithApple, requestMagicLink, verifyMagicCode, continueAsGuest, refreshUser, logout, deleteAccount }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
