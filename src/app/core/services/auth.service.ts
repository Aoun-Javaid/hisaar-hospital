import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';

import { CONFIG } from '../../../../config';
import {
  resolveDefaultRoute,
  sanitizePermissions,
} from '../../modules/auth/access-control';

type AuthPayload = {
  token?: string;
  refreshToken?: string | null;
  user?: any;
  [key: string]: any;
};

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly userSignal = signal<any | null>(this.loadStoredUser());
  private readonly tokenPayloadSignal = signal<any | null>(
    this.decodeToken(this.getToken())
  );

  private refreshInFlight$: Observable<string> | null = null;
  private meInFlight$: Observable<any> | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private hostedLoginRedirectInFlight = false;
  private readonly HOSTED_LOGIN_URL = 'https://hisaar360.com/login';
  private readonly LOCAL_AUTH_PORTAL_LOGIN_URL = 'http://localhost:4200/login';

  readonly currentUser = this.userSignal.asReadonly();
  readonly tokenPayload = this.tokenPayloadSignal.asReadonly();
  readonly isAuthenticated = computed(
    () => this.hasToken() && Boolean(this.userSignal())
  );

  constructor() {
    this.scheduleAccessTokenWatch();
  }

  login(email: string, password: string): Observable<any> {
    return this.http
      .post<ApiEnvelope<AuthPayload>>(CONFIG.auth.login, {
        email: String(email || '')
          .trim()
          .toLowerCase(),
        password,
      })
      .pipe(
        tap((response) => {
          this.persistAuthResponse(response?.data);
          const user = this.getCurrentUser();
          void this.router.navigateByUrl(this.defaultAppRoute(user));
        })
      );
  }

  ssoLogin(code: string): Observable<any> {
    // Treat every SSO handoff as a brand-new login — discard any prior session.
    this.beginFreshSsoHandoff();

    return this.http
      .post<ApiEnvelope<AuthPayload>>(CONFIG.auth.ssoLogin, { code })
      .pipe(
        tap((response) => {
          this.persistAuthResponse(response?.data);
          const user = this.getCurrentUser();
          const route = this.defaultAppRoute(user);
          // Full page load so menus/permissions boot only from the new session.
          this.navigateAsFreshSession(route);
        })
      );
  }

  refreshSession(): Observable<string> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    this.refreshInFlight$ = this.http
      .post<ApiEnvelope<AuthPayload>>(CONFIG.auth.refresh, { refreshToken })
      .pipe(
        map((response) => {
          const newToken = response?.data?.token;
          if (!newToken) {
            throw new Error('Refresh response is missing an access token');
          }

          this.saveToken(newToken);
          if (response?.data?.refreshToken) {
            this.saveRefreshToken(response.data.refreshToken);
          }

          return newToken;
        }),
        finalize(() => {
          this.refreshInFlight$ = null;
        }),
        shareReplay(1)
      );

    return this.refreshInFlight$;
  }

  me(options?: { force?: boolean }): Observable<any> {
    if (!options?.force) {
      const existing = this.userSignal();
      if (existing) {
        return of(existing);
      }
      if (this.meInFlight$) {
        return this.meInFlight$;
      }
    }

    this.meInFlight$ = this.http.get<ApiEnvelope<any>>(CONFIG.auth.me).pipe(
      map((response) => response?.data ?? response),
      tap((user) => {
        this.setCurrentUser(user);
      }),
      finalize(() => {
        this.meInFlight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    return this.meInFlight$;
  }

  logout(): void {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http
        .post(CONFIG.auth.logout, { refreshToken })
        .subscribe({ next: () => {}, error: () => {} });
    } else if (this.getToken()) {
      this.http
        .post(CONFIG.auth.logout, {})
        .subscribe({ next: () => {}, error: () => {} });
    }

    this.clearSession();
    this.redirectToHostedLogin();
  }

  handleAuthFailure(): void {
    this.clearSession();
    this.redirectToHostedLogin();
  }

  changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Observable<any> {
    return this.http.post(CONFIG.auth.changePassword, payload);
  }

  /**
   * Password change revokes the session server-side. Clear local auth and send
   * the user back to hosted login without attempting a refresh.
   */
  signOutAfterPasswordChange(): void {
    this.handleAuthFailure();
  }

  redirectToHostedLogin(_options?: { forceHosted?: boolean }): void {
    if (this.hostedLoginRedirectInFlight) {
      return;
    }
    this.hostedLoginRedirectInFlight = true;
    // Session timeout / auth failure always goes to Central Auth portal —
    // never the hospital SPA login form.
    window.location.replace(this.resolveAuthPortalLoginUrl());
  }

  shouldUseLocalLogin(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const { hostname } = window.location;
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  }

  /** Central Auth login URL for the current environment. */
  resolveAuthPortalLoginUrl(): string {
    if (CONFIG.authPortalLoginUrl) {
      return CONFIG.authPortalLoginUrl;
    }
    return this.shouldUseLocalLogin()
      ? this.LOCAL_AUTH_PORTAL_LOGIN_URL
      : this.HOSTED_LOGIN_URL;
  }

  localLoginUrl(): string {
    return this.resolveAuthPortalLoginUrl();
  }

  saveToken(token: string): void {
    localStorage.setItem(CONFIG.storage.token, token);
    this.tokenPayloadSignal.set(this.decodeToken(token));
    this.scheduleAccessTokenWatch();
  }

  isAccessTokenExpired(skewSeconds = 5): boolean {
    const expMs = this.getAccessTokenExpiryMs();
    if (!expMs) {
      return !this.hasToken();
    }
    return Date.now() >= expMs - skewSeconds * 1000;
  }

  getAccessTokenExpiryMs(): number | null {
    const exp = Number(this.tokenPayloadSignal()?.exp || this.decodeToken(this.getToken())?.exp);
    if (!Number.isFinite(exp) || exp <= 0) {
      return null;
    }
    return exp * 1000;
  }

  private clearAccessTokenWatch(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private scheduleAccessTokenWatch(): void {
    this.clearAccessTokenWatch();
    if (typeof window === 'undefined') {
      return;
    }

    const token = this.getToken();
    if (!token) {
      return;
    }

    const expMs = this.getAccessTokenExpiryMs();
    if (!expMs) {
      return;
    }

    const refreshLeadMs = 30_000;
    const delay = Math.max(0, expMs - Date.now() - refreshLeadMs);

    this.expiryTimer = setTimeout(() => {
      if (this.hasRefreshToken()) {
        this.refreshSession().subscribe({
          next: () => undefined,
          error: () => this.handleAuthFailure(),
        });
        return;
      }
      this.handleAuthFailure();
    }, delay);
  }

  getToken(): string | null {
    return localStorage.getItem(CONFIG.storage.token);
  }

  hasToken(): boolean {
    return Boolean(this.getToken());
  }

  hasSessionToken(): boolean {
    return this.hasToken();
  }

  saveRefreshToken(token: string | null | undefined): void {
    if (token) {
      localStorage.setItem(CONFIG.storage.refreshToken, token);
    } else {
      localStorage.removeItem(CONFIG.storage.refreshToken);
    }
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(CONFIG.storage.refreshToken);
  }

  hasRefreshToken(): boolean {
    return Boolean(this.getRefreshToken());
  }

  setCurrentUser(user: any | null): any | null {
    const normalized = this.normalizeUser(user);
    this.userSignal.set(normalized);

    if (!normalized) {
      localStorage.removeItem(CONFIG.storage.currentUser);
      localStorage.removeItem(CONFIG.storage.role);
      localStorage.removeItem(CONFIG.storage.roleId);
      localStorage.removeItem(CONFIG.storage.permissions);
      return null;
    }

    localStorage.setItem(
      CONFIG.storage.currentUser,
      JSON.stringify(normalized)
    );

    const roleName = normalized?.role?.name || normalized?.roleName || '';
    const roleId = normalized?.role?._id || normalized?.roleId || '';
    const permissions = sanitizePermissions(
      normalized?.role?.permissions ||
        normalized?.permissions ||
        normalized?.hmsPermissions ||
        []
    );

    localStorage.setItem(CONFIG.storage.role, roleName);
    localStorage.setItem(CONFIG.storage.roleId, roleId);
    localStorage.setItem(
      CONFIG.storage.permissions,
      JSON.stringify(permissions)
    );

    return normalized;
  }

  getCurrentUser(): any | null {
    return this.userSignal();
  }

  getUserPermissions(user: any | null = this.getCurrentUser()): string[] {
    return sanitizePermissions(
      user?.role?.permissions ||
        user?.permissions ||
        user?.hmsPermissions ||
        []
    );
  }

  defaultAppRoute(user: any | null = this.getCurrentUser()): string {
    const permissions = this.getUserPermissions(user);
    const role =
      user?.role?.name || user?.roleName || localStorage.getItem(CONFIG.storage.role) || '';
    return resolveDefaultRoute(permissions, role);
  }

  clearSession(): void {
    localStorage.removeItem(CONFIG.storage.token);
    localStorage.removeItem(CONFIG.storage.refreshToken);
    localStorage.removeItem(CONFIG.storage.currentUser);
    localStorage.removeItem(CONFIG.storage.role);
    localStorage.removeItem(CONFIG.storage.roleId);
    localStorage.removeItem(CONFIG.storage.permissions);
    // Legacy / ancillary session keys
    localStorage.removeItem('access_token');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth_session');
    localStorage.removeItem('hospital');
    localStorage.removeItem('userName');

    this.userSignal.set(null);
    this.tokenPayloadSignal.set(null);
    this.meInFlight$ = null;
    this.refreshInFlight$ = null;
    this.hostedLoginRedirectInFlight = false;
    this.clearAccessTokenWatch();
  }

  /**
   * New SSO code arrived while a previous hospital session may still exist.
   * Wipe everything so the exchange behaves as if the user was never logged in.
   */
  beginFreshSsoHandoff(): void {
    this.clearSession();
  }

  /** Hard navigation after SSO so UI state cannot leak from the prior role/session. */
  private navigateAsFreshSession(route: string): void {
    const path = route.startsWith('/') ? route : `/${route}`;
    window.location.replace(`${window.location.origin}${path}`);
  }

  private persistAuthResponse(data: AuthPayload | null | undefined): void {
    if (!data?.token) {
      throw new Error('Invalid auth response');
    }

    this.saveToken(data.token);
    this.saveRefreshToken(data.refreshToken);
    this.setCurrentUser(data.user || data);
  }

  private normalizeUser(user: any | null): any | null {
    if (!user || typeof user !== 'object') {
      return null;
    }

    const role =
      user.role && typeof user.role === 'object'
        ? user.role
        : {
            _id: user.roleId || '',
            name: user.roleName || (typeof user.role === 'string' ? user.role : ''),
            permissions: user.permissions || user.hmsPermissions || [],
          };

    const permissions = sanitizePermissions(
      role.permissions || user.permissions || user.hmsPermissions || []
    );

    return {
      ...user,
      name: user.name || user.displayName || '',
      email: user.email || user.displayEmail || '',
      phone: user.phone || user.displayPhone || null,
      roleId: user.roleId || role._id || '',
      roleName: user.roleName || role.name || '',
      role: {
        ...role,
        _id: role._id || user.roleId || '',
        name: role.name || user.roleName || '',
        permissions,
      },
      permissions,
      hmsPermissions: permissions,
    };
  }

  private loadStoredUser(): any | null {
    const raw = localStorage.getItem(CONFIG.storage.currentUser);
    if (!raw) {
      return null;
    }

    try {
      return this.normalizeUser(JSON.parse(raw));
    } catch {
      localStorage.removeItem(CONFIG.storage.currentUser);
      return null;
    }
  }

  private decodeToken(token: string | null): any | null {
    if (!token) {
      return null;
    }

    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(normalized));
    } catch {
      return null;
    }
  }
}
