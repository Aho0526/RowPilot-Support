(function () {
  "use strict";

  // API エンドポイント設定
  // カスタムドメイン api.rowpilot.jp を設定した場合はこちらを優先利用可能
  const API_BASE = (() => {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      const override = new URLSearchParams(location.search).get("api");
      if (override) return override.replace(/\/$/, "");
    }
    return "https://rowpilot-api.rowpilot-jp.workers.dev";
  })();

  const SESSION_STORAGE_KEY = "rowpilot_web_fallback_token";

  const state = {
    slugOrId: null,
    publicTeam: null,
    dashboard: null,
    filteredWorkouts: [],
    webToken: null,
    appSessionId: null,
    appCode: null,
    appExpiresAtMs: 0,
    pollTimer: null,
    countdownTimer: null,
    activeViewTab: "feed",
    hasAppliedAutoPeriod: false
  };

  // ── DOM Helpers ──
  const $ = (id) => document.getElementById(id);
  const tr = (key, fallback, vars) =>
    window.TeamsI18n && typeof window.TeamsI18n.t === "function"
      ? window.TeamsI18n.t(key, vars) || fallback
      : fallback;

  function setLoadingMessage(message) {
    const el = $("loading-status-text");
    if (el) {
      el.textContent = message || tr("loading", "読み込み中...");
    }
  }

  function showOnlyView(viewId) {
    const ids = ["view-loading", "view-not-found", "view-set-password", "view-auth", "view-dashboard"];
    for (const id of ids) {
      $(id).hidden = id !== viewId;
    }
    const showPortalNav = viewId === "view-auth" || viewId === "view-not-found" || viewId === "view-set-password";
    document.body.classList.toggle("show-portal-nav", showPortalNav);
    if (!showPortalNav) {
      const mobileMenu = $("mobile-menu");
      const navToggle = $("nav-toggle");
      if (mobileMenu) mobileMenu.classList.remove("open");
      if (navToggle) navToggle.classList.remove("open");
    }
  }

  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function clearElement(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function createEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  }

  function formatUserErrorMessage(err, fallback) {
    const raw = err && typeof err.message === "string" ? err.message.trim() : "";
    const lower = raw.toLowerCase();

    if (
      (err && err.name === "TypeError") ||
      lower.includes("failed to fetch") ||
      lower.includes("load failed") ||
      lower.includes("networkerror") ||
      lower.includes("network request failed")
    ) {
      return tr("errNetwork", "通信エラーが発生しました。通信環境をご確認のうえ、時間をおいて再度お試しください。");
    }

    if (/\bunauthorized\b|\bforbidden\b/.test(lower)) {
      return tr("errAuth", "認証が無効になっているか、この操作を行う権限がありません。再ログインしても解決しない場合は、サポートページからお問い合わせください。");
    }

    if (
      lower.includes("internal server error") ||
      lower.includes("unexpected token") ||
      lower.includes("json")
    ) {
      return tr("errServer", "サーバーとの通信中にエラーが発生しました。時間をおいて再度お試しいただくか、解決しない場合はサポートページからお問い合わせください。");
    }

    if (raw && !/^[A-Za-z0-9\s.,:;!?\-_()]+$/.test(raw)) {
      return raw;
    }

    return fallback || tr("errGeneric", "エラーが発生しました。通信環境をご確認のうえ、解決しない場合はサポートページからお問い合わせください。");
  }

  // ── Token / API Fetch Helper ──
  function isCrossSiteApi() {
    try {
      const apiHost = new URL(API_BASE).hostname;
      return !(
        (location.hostname === "rowpilot.jp" || location.hostname.endsWith(".rowpilot.jp")) &&
        (apiHost === "rowpilot.jp" || apiHost.endsWith(".rowpilot.jp"))
      );
    } catch {
      return true;
    }
  }

  function saveFallbackTokenIfNeeded(token) {
    if (!token) return;
    state.webToken = token;
    if (isCrossSiteApi()) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      } catch {
        // ストレージ無効時は無視
      }
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, token);
      } catch {
        // ストレージ無効時は無視
      }
    }
  }

  function clearFallbackToken() {
    state.webToken = null;
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // 無視
    }
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // 無視
    }
  }

  function getFallbackToken() {
    if (state.webToken) return state.webToken;
    if (!isCrossSiteApi()) return null;
    try {
      const fromSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (fromSession) {
        state.webToken = fromSession;
        return fromSession;
      }
    } catch {
      // 無視
    }
    try {
      const fromLocal = localStorage.getItem(SESSION_STORAGE_KEY);
      if (fromLocal) {
        state.webToken = fromLocal;
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, fromLocal);
        } catch {
          // 無視
        }
        return fromLocal;
      }
    } catch {
      // 無視
    }
    return null;
  }

  async function apiFetch(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const fallback = getFallbackToken();
    if (fallback && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${fallback}`);
    }
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include"
    });
  }

  // ── Formatting Helpers ──
  function formatDistance(meters) {
    const n = Number(meters);
    if (!Number.isFinite(n) || n <= 0) return "-";
    if (n >= 1000) return `${(n / 1000).toFixed(1)} km`;
    return `${Math.round(n)} m`;
  }

  function formatDuration(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n) || n < 0) return "-";
    const totalTenths = Math.round(n * 10);
    const hours = Math.floor(totalTenths / 36000);
    const mins = Math.floor((totalTenths % 36000) / 600);
    const secs = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
  }

  function formatSplit(sec) {
    const n = Number(sec);
    if (!Number.isFinite(n) || n <= 0) return "-";
    const totalTenths = Math.round(n * 10);
    const mins = Math.floor(totalTenths / 600);
    const secs = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${mins}:${String(secs).padStart(2, "0")}.${tenths}`;
  }

  function formatDateTime(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatShortDate(isoStr) {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${month}/${day} ${hours}:${mins}`;
  }

  function roleLabel(role) {
    switch ((role || "").toLowerCase()) {
      case "owner": return tr("roleOwner", "最高管理者");
      case "admin": return tr("roleAdmin", "管理者");
      case "manager": return tr("roleManager", "マネージャー");
      case "athlete": return tr("roleAthlete", "選手");
      case "coach": return tr("roleCoach", "Webコーチ");
      case "viewer": return tr("roleViewer", "閲覧専用");
      default: return role || "-";
    }
  }

  function normalizeWorkoutType(type) {
    return (type || "").trim().toLowerCase();
  }

  function isErgType(type) {
    const t = normalizeWorkoutType(type);
    return t === "erg" || t === "indoor";
  }

  function isOnWaterType(type) {
    const t = normalizeWorkoutType(type);
    return t === "onwater" || t === "water" || t === "gps" || t === "outdoor";
  }

  function workoutTypeClass(type) {
    if (isErgType(type)) return "erg";
    if (isOnWaterType(type)) return "onwater";
    return "other";
  }

  function workoutTypeLabel(type) {
    if (isErgType(type)) return tr("optErg", "エルゴ");
    if (isOnWaterType(type)) return tr("optWater", "水上");
    return type || tr("catOther", "その他");
  }

  // ── Route Extraction ──
  function extractSlugOrId() {
    const params = new URLSearchParams(location.search);
    const qSlug = params.get("slug");
    if (qSlug && qSlug.trim()) return qSlug.trim();

    const m = location.pathname.match(/^(?:\/(?:en|de|fr|es|it|zh|ko))?\/teams\/([^\/]+)\/?$/i);
    if (m && m[1] && m[1] !== "index.html") {
      return decodeURIComponent(m[1]);
    }
    return null;
  }

  function buildTeamUrl(key) {
    const safeKey = String(key || "").trim();
    const curLang = window.TeamsI18n && typeof window.TeamsI18n.getLang === "function" ? window.TeamsI18n.getLang() : "ja";
    const langSuffix = curLang && curLang !== "ja" ? `?lang=${encodeURIComponent(curLang)}` : "";
    if (!safeKey || !/^[a-zA-Z0-9_-]+$/.test(safeKey)) {
      return `/teams/${langSuffix}`;
    }
    return `/teams/${encodeURIComponent(safeKey)}/${langSuffix}`;
  }

  function extractSlugInput(value) {
    let raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw) || raw.includes("rowpilot.jp/")) {
      try {
        const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        raw = new URL(normalizedUrl).pathname;
      } catch {
        // URL解析に失敗した場合はそのまま扱う
      }
    }
    const teamsMatch = raw.match(/\/teams\/([^\/?#]+)/i);
    if (teamsMatch && teamsMatch[1]) {
      raw = decodeURIComponent(teamsMatch[1]);
    }
    return raw.replace(/^\/+|\/+$/g, "");
  }

  // ── Initialization ──
  async function init() {
    if (window.TeamsI18n && typeof window.TeamsI18n.applyStaticDomTranslations === "function") {
      window.TeamsI18n.applyStaticDomTranslations();
    }
    bindUIEvents();
    state.slugOrId = extractSlugOrId();

    const params = new URLSearchParams(location.search);
    const inviteToken = params.get("token");
    const mode = params.get("mode");

    // ルートポータル (/teams/) の場合
    if (!state.slugOrId) {
      document.title = "Team Web — RowPilot";
      setLoadingMessage(tr("authenticating", "認証中..."));
      try {
        const meRes = await apiFetch("/web/me");
        if (meRes.status === 401) {
          clearFallbackToken();
        } else if (meRes.ok) {
          const me = await meRes.json();
          if (me.authenticated && (me.team_slug || me.team_id)) {
            setLoadingMessage(tr("authenticatingRedirect", "認証中... チームページへ移動しています"));
            location.assign(buildTeamUrl(me.team_slug || me.team_id));
            return;
          }
          if (me.authenticated === false) {
            clearFallbackToken();
          }
        }
      } catch {
        // 未ログインとしてポータル表示を続行
      }
      enterAuthView();
      return;
    }

    // チーム指定あり: 公開情報取得
    setLoadingMessage(tr("loading", "読み込み中..."));
    try {
      const pubRes = await apiFetch(`/web/teams/${encodeURIComponent(state.slugOrId)}/public`);
      if (!pubRes.ok) {
        showOnlyView("view-not-found");
        return;
      }
      state.publicTeam = await pubRes.json();
      document.title = `${state.publicTeam.name} — RowPilot Team Web`;
    } catch {
      $("not-found-title").textContent = tr("serverConnErrTitle", "サーバーに接続できません");
      $("not-found-desc").textContent = tr("serverConnErrDesc", "通信環境をご確認のうえ、再度ページを読み込んでください。解決しない場合はサポートページからお問い合わせください。");
      showOnlyView("view-not-found");
      return;
    }

    // パスワード設定・リセットリンクの場合
    if (inviteToken && (mode === "setup" || mode === "reset")) {
      $("setup-team-pill").textContent = state.publicTeam.name;
      $("setup-title").textContent = mode === "reset" ? tr("resetPwTitle", "新しいパスワードの設定") : tr("setupTitle", "Webコーチ パスワード設定");
      showOnlyView("view-set-password");
      return;
    }

    // 既存セッションでダッシュボード取得を試みる
    setLoadingMessage(tr("authenticating", "認証中..."));
    const loaded = await tryLoadDashboard();
    if (!loaded) {
      enterAuthView();
    }
  }

  async function tryLoadDashboard() {
    if (!state.slugOrId) return false;
    try {
      const res = await apiFetch(`/web/teams/${encodeURIComponent(state.slugOrId)}/dashboard`);
      if (res.status === 401) {
        clearFallbackToken();
        return false;
      }
      if (res.status === 403 || !res.ok) {
        return false;
      }
      const data = await res.json();
      state.dashboard = data;
      stopAppPolling();
      renderDashboard();
      showOnlyView("view-dashboard");
      return true;
    } catch {
      return false;
    }
  }

  // ── Auth View & App Polling ──
  function enterAuthView() {
    document.body.classList.remove("is-authenticated");
    $("header-actions").hidden = true;
    $("form-coach-login").hidden = false;
    $("team-select-panel").hidden = true;
    $("form-coach-reset").hidden = true;
    $("coach-login-error").hidden = true;

    const isTeamSpecific = Boolean(state.slugOrId && state.publicTeam);
    if (isTeamSpecific) {
      $("auth-team-name").textContent = state.publicTeam.name;
      $("portal-heading").textContent = tr("portalTeamHeading", `${state.publicTeam.name} の練習記録へログイン`, { team: state.publicTeam.name });
      $("portal-desc").textContent = tr(
        "portalTeamDesc",
        "Webコーチ用アカウントのメールアドレス・パスワード、または RowPilot アプリのワンタップ・QR・6桁コードでログインできます。"
      );
      $("form-slug-jump").hidden = true;
      $("portal-showcase").hidden = true;
    } else {
      $("auth-team-name").textContent = "RowPilot Team Web";
      $("portal-heading").textContent = tr("portalHeading", "チームの練習記録を、ブラウザの大画面で。");
      $("portal-desc").textContent = tr(
        "portalDesc",
        "RowPilot Team・MAXプランの練習データを、PC・タブレット・Android端末から確認できます。ログインすると所属チームの専用ページへ自動で移動します。"
      );
      $("form-slug-jump").hidden = false;
      $("portal-showcase").hidden = false;
    }

    showOnlyView("view-auth");
    startNewAppSession();
  }

  function stopAppPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  async function startNewAppSession() {
    stopAppPolling();
    $("app-auth-error").hidden = true;
    $("app-code-display").textContent = "--- ---";
    $("polling-status-text").textContent = tr("pollingIssuing", "認証コードを発行しています...");

    try {
      const payload = state.slugOrId ? { slug_or_id: state.slugOrId } : {};
      const res = await apiFetch("/web-auth/app-session/init", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(data.error || "Unauthorized");
        }
        throw new Error(data.error || tr("errGeneric", "認証コードの発行に失敗しました。時間をおいて再度お試しください。"));
      }

      state.appSessionId = data.session_id;
      state.appCode = data.code;
      state.appExpiresAtMs = Date.now() + (data.expires_in_sec || 300) * 1000;

      const formattedCode = `${data.code.slice(0, 3)} ${data.code.slice(3)}`;
      $("app-code-display").textContent = formattedCode;
      const deepLink = `rowpilot://web-auth?code=${encodeURIComponent(data.code)}`;
      $("btn-open-app").href = deepLink;
      $("polling-status-text").textContent = tr("pollingWaiting", "アプリでの承認を待機しています...");

      renderQRCode(deepLink);
      startCountdown();
      startPollingLoop();
    } catch (err) {
      $("app-auth-error").textContent = formatUserErrorMessage(
        err,
        tr("errGeneric", "認証コードの発行に失敗しました。通信環境をご確認のうえ再度お試しください。")
      );
      $("app-auth-error").hidden = false;
      $("polling-status-text").textContent = tr("pollingReissue", "コードを再発行してください");
    }
  }

  function renderQRCode(text) {
    const qrBox = $("qr-box");
    const wrap = $("qr-canvas-wrap");
    clearElement(wrap);
    if (typeof window.qrcode !== "function") {
      qrBox.hidden = true;
      return;
    }
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      const count = qr.getModuleCount();
      const margin = 2;
      const cell = 4;
      const size = (count + margin * 2) * cell;
      const svgNS = "http://www.w3.org/2000/svg";
      const svgEl = document.createElementNS(svgNS, "svg");
      svgEl.setAttribute("width", "168");
      svgEl.setAttribute("height", "168");
      svgEl.setAttribute("viewBox", `0 0 ${size} ${size}`);
      svgEl.setAttribute("shape-rendering", "crispEdges");

      const bg = document.createElementNS(svgNS, "rect");
      bg.setAttribute("width", String(size));
      bg.setAttribute("height", String(size));
      bg.setAttribute("fill", "#ffffff");
      svgEl.appendChild(bg);

      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (!qr.isDark(r, c)) continue;
          const rect = document.createElementNS(svgNS, "rect");
          rect.setAttribute("x", String((c + margin) * cell));
          rect.setAttribute("y", String((r + margin) * cell));
          rect.setAttribute("width", String(cell));
          rect.setAttribute("height", String(cell));
          rect.setAttribute("fill", "#09090f");
          svgEl.appendChild(rect);
        }
      }
      wrap.appendChild(svgEl);
      qrBox.hidden = false;
    } catch {
      qrBox.hidden = true;
    }
  }

  function startCountdown() {
    const update = () => {
      const remainSec = Math.max(0, Math.floor((state.appExpiresAtMs - Date.now()) / 1000));
      const m = String(Math.floor(remainSec / 60)).padStart(2, "0");
      const s = String(remainSec % 60).padStart(2, "0");
      $("app-code-timer").textContent =
        remainSec > 0 ? `${tr("expiresPrefix", "有効期限")} ${m}:${s}` : tr("expired", "期限切れ");
      if (remainSec <= 0) {
        stopAppPolling();
        $("polling-status-text").textContent = tr("pollingReissue", "コードを再発行してください");
      }
    };
    update();
    state.countdownTimer = setInterval(update, 1000);
  }

  function startPollingLoop() {
    state.pollTimer = setInterval(async () => {
      if (!state.appSessionId) return;
      try {
        const res = await apiFetch(`/web-auth/app-session/status?session_id=${encodeURIComponent(state.appSessionId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "approved") {
          stopAppPolling();
          saveFallbackTokenIfNeeded(data.web_token);
          $("polling-status-text").textContent = tr("loading", "読み込み中...");
          const targetKey = data.team_slug || data.team_id;
          if (!state.slugOrId || (targetKey && state.slugOrId !== data.team_slug && state.slugOrId !== data.team_id)) {
            if (targetKey) {
              location.assign(buildTeamUrl(targetKey));
              return;
            }
          }
          const ok = await tryLoadDashboard();
          if (!ok) {
            $("app-auth-error").textContent = tr("errServer", "ダッシュボードの読み込みに失敗しました。再読み込みしてください。");
            $("app-auth-error").hidden = false;
          }
        } else if (data.status === "expired") {
          stopAppPolling();
          $("polling-status-text").textContent = tr("pollingReissue", "コードを再発行してください");
        }
      } catch {
        // 一時的なネットワークエラーは無視してリトライ
      }
    }, 2500);
  }

  // ── Dashboard Rendering ──
  function renderDashboard() {
    const { team, viewer, members, workouts, summary } = state.dashboard;

    document.body.classList.add("is-authenticated");
    $("header-actions").hidden = false;
    $("viewer-pill").textContent = `${viewer.display_name} (${roleLabel(viewer.role)})`;

    $("dash-team-name").textContent = team.name;
    const badge = $("dash-plan-badge");
    badge.textContent = (team.plan || "TEAM").toUpperCase();
    badge.className = `plan-badge ${["max", "organization", "enterprise"].includes((team.plan || "").toLowerCase()) ? "max" : ""}`;

    $("dash-subtitle").textContent = tr(
      "dashSubtitleCounts",
      `登録メンバー ${members.length}名 ・ 読み込み済み記録 ${workouts.length}件`,
      { members: members.length, workouts: workouts.length }
    );

    const isSuspended = !team.has_web_access;
    $("suspended-banner").hidden = !isSuspended;
    $("kpi-grid").hidden = isSuspended;
    $("filter-section").hidden = isSuspended;
    document.querySelector(".view-tabs").hidden = isSuspended;
    $("panel-feed").hidden = isSuspended || state.activeViewTab !== "feed";
    $("panel-athletes").hidden = isSuspended || state.activeViewTab !== "athletes";
    $("panel-analytics").hidden = isSuspended || state.activeViewTab !== "analytics";
    $("btn-print").hidden = isSuspended;
    $("btn-export-csv").hidden = isSuspended;

    const exportBtn = $("btn-export-csv");
    if (team.has_csv_export) {
      exportBtn.textContent = tr("btnExportCsv", "CSVエクスポート");
      exportBtn.disabled = false;
      exportBtn.title = tr("btnExportCsv", "CSVエクスポート");
    } else {
      exportBtn.textContent = `${tr("btnExportCsv", "CSVエクスポート")} (MAX)`;
      exportBtn.disabled = false;
      exportBtn.title = "MAX";
    }

    // 選手セレクトボックス更新
    const athleteSelect = $("filter-athlete");
    const prevAthlete = athleteSelect.value;
    clearElement(athleteSelect);
    athleteSelect.appendChild(createEl("option", "", tr("optAllAthletes", "すべての選手"))).value = "";

    const seenAthletes = new Map();
    for (const m of members) {
      seenAthletes.set(m.id, m.display_name);
    }
    for (const w of workouts) {
      if (w.athlete_id && !seenAthletes.has(w.athlete_id)) {
        seenAthletes.set(w.athlete_id, w.athlete_name || tr("unknownAthlete", "不明"));
      }
    }
    for (const [id, name] of seenAthletes.entries()) {
      const opt = createEl("option", "", name);
      opt.value = id;
      athleteSelect.appendChild(opt);
    }
    if (prevAthlete && seenAthletes.has(prevAthlete)) {
      athleteSelect.value = prevAthlete;
    }

    // KPI サマリー（全体固定値）
    if (summary) {
      $("kpi-7d-dist").textContent = formatDistance(summary.distance_7d_m);
      $("kpi-7d-count").textContent = tr("unitCount", `${summary.workouts_7d_count} 回`, { n: summary.workouts_7d_count });
      $("kpi-30d-dist").textContent = formatDistance(summary.distance_30d_m);
      $("kpi-30d-count").textContent = tr("unitCount", `${summary.workouts_30d_count} 回`, { n: summary.workouts_30d_count });
      $("kpi-active-athletes").textContent = tr("unitPeople", `${summary.active_athletes_30d} 名`, { n: summary.active_athletes_30d });
      $("kpi-total-members").textContent = tr("kpiTotalMembers", `全 ${members.length} 名中`, { n: members.length });
    } else {
      $("kpi-7d-dist").textContent = "-";
      $("kpi-7d-count").textContent = "-";
      $("kpi-30d-dist").textContent = "-";
      $("kpi-30d-count").textContent = "-";
      $("kpi-active-athletes").textContent = "-";
      $("kpi-total-members").textContent = "-";
    }

    if (!state.hasAppliedAutoPeriod) {
      state.hasAppliedAutoPeriod = true;
      if ($("filter-period").value === "30" && summary && summary.workouts_30d_count === 0 && workouts.length > 0) {
        $("filter-period").value = "all";
      }
    }

    applyFiltersAndRender();
  }

  function getFilterState() {
    const period = $("filter-period").value;
    let from = "";
    let to = "";
    if (period === "custom") {
      from = $("filter-from").value;
      to = $("filter-to").value;
    } else if (period !== "all") {
      const days = Number.parseInt(period, 10);
      if (Number.isFinite(days)) {
        const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        from = d.toISOString().slice(0, 10);
      }
    }
    return {
      q: $("filter-q").value.trim().toLowerCase(),
      athleteId: $("filter-athlete").value,
      type: $("filter-type").value.toLowerCase(),
      from,
      to
    };
  }

  function updateFilterSummaryUi() {
    const q = $("filter-q") ? $("filter-q").value.trim() : "";
    const athleteId = $("filter-athlete") ? $("filter-athlete").value : "";
    const type = $("filter-type") ? $("filter-type").value : "";
    const period = $("filter-period") ? $("filter-period").value : "all";

    let activeCount = 0;
    if (q) activeCount += 1;
    if (athleteId) activeCount += 1;
    if (type) activeCount += 1;
    if (period && period !== "all") activeCount += 1;

    const badge = $("filter-active-badge");
    const toggleBtn = $("btn-toggle-filters");
    const quickResetBtn = $("btn-reset-filters-quick");
    const resetBtn = $("btn-reset-filters");

    if (badge) {
      badge.hidden = activeCount === 0;
      badge.textContent = activeCount > 0 ? tr("filterActiveCount", `${activeCount}件適用中`, { n: activeCount }) : "";
    }
    if (toggleBtn) {
      toggleBtn.classList.toggle("has-active", activeCount > 0);
    }
    if (quickResetBtn) {
      quickResetBtn.hidden = activeCount === 0;
    }
    if (resetBtn) {
      resetBtn.disabled = activeCount === 0;
    }
  }

  function setFiltersOpen(isOpen) {
    const section = $("filter-section");
    const toggleBtn = $("btn-toggle-filters");
    if (section) section.classList.toggle("is-open", isOpen);
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function resetAllFilters() {
    if ($("filter-q")) $("filter-q").value = "";
    if ($("filter-athlete")) $("filter-athlete").value = "";
    if ($("filter-type")) $("filter-type").value = "";
    if ($("filter-period")) $("filter-period").value = "all";
    if ($("filter-from")) $("filter-from").value = "";
    if ($("filter-to")) $("filter-to").value = "";
    if ($("custom-date-from-wrap")) $("custom-date-from-wrap").hidden = true;
    if ($("custom-date-to-wrap")) $("custom-date-to-wrap").hidden = true;
    applyFiltersAndRender();
  }

  function applyFiltersAndRender() {
    if (!state.dashboard) return;
    updateFilterSummaryUi();
    const workouts = state.dashboard.workouts || [];
    const f = getFilterState();

    const filtered = workouts.filter((w) => {
      if (f.athleteId && w.athlete_id !== f.athleteId) return false;
      if (f.type) {
        if (f.type === "erg" && !isErgType(w.type)) return false;
        if (f.type === "onwater" && !isOnWaterType(w.type)) return false;
        if (f.type !== "erg" && f.type !== "onwater" && normalizeWorkoutType(w.type) !== f.type) return false;
      }
      if (f.from && (!w.recorded_on || w.recorded_on.slice(0, 10) < f.from)) return false;
      if (f.to && (!w.recorded_on || w.recorded_on.slice(0, 10) > f.to)) return false;
      if (f.q) {
        const formatText = isOnWaterType(w.type) ? "" : (w.format || "");
        const hay = `${w.athlete_name || ""} ${w.notes || ""} ${w.boat_type || ""} ${formatText}`.toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    });

    state.filteredWorkouts = filtered;

    // 4つ目のKPI（表示中のベスト500m）を更新
    let bestSplit = null;
    for (const w of filtered) {
      const s = Number(w.split_500m_sec);
      if (Number.isFinite(s) && s > 0 && (bestSplit === null || s < bestSplit)) {
        bestSplit = s;
      }
    }
    $("kpi-best-split").textContent = bestSplit ? `${formatSplit(bestSplit)}` : "-";
    $("kpi-filtered-count").textContent = tr("kpiFilteredCount", `表示中 ${filtered.length} 件`, { n: filtered.length });

    renderWorkoutFeed();
    renderAthleteSummary();
    renderAnalytics();
  }

  function renderWorkoutFeed() {
    const tbody = $("workouts-tbody");
    clearElement(tbody);
    const list = state.filteredWorkouts;
    $("workouts-empty").hidden = list.length > 0;

    for (const w of list) {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => openWorkoutModal(w));

      tr.appendChild(createEl("td", "date-cell", formatShortDate(w.recorded_on)));
      tr.appendChild(createEl("td", "", w.athlete_name || tr("unknownAthlete", "不明")));

      const typeTd = document.createElement("td");
      const badge = createEl("span", `type-pill ${workoutTypeClass(w.type)}`, workoutTypeLabel(w.type));
      typeTd.appendChild(badge);
      if (!isOnWaterType(w.type)) {
        typeTd.appendChild(document.createTextNode(w.format || "-"));
      }
      tr.appendChild(typeTd);

      tr.appendChild(createEl("td", "num", formatDistance(w.distance_m)));
      tr.appendChild(createEl("td", "num", formatDuration(w.duration_sec)));
      tr.appendChild(createEl("td", "num", formatSplit(w.split_500m_sec)));
      tr.appendChild(createEl("td", "num", w.stroke_rate ? `${Math.round(w.stroke_rate)} spm` : "-"));
      tr.appendChild(createEl("td", "num", w.average_watt ? `${Math.round(w.average_watt)} W` : "-"));
      tr.appendChild(createEl("td", "notes-cell", w.notes || "-"));

      tbody.appendChild(tr);
    }
  }

  function renderAthleteSummary() {
    const tbody = $("athletes-tbody");
    clearElement(tbody);
    const list = state.filteredWorkouts;
    const membersMap = new Map((state.dashboard.members || []).map((m) => [m.id, m]));
    const statsMap = new Map();

    for (const w of list) {
      const id = w.athlete_id || "unknown";
      if (!statsMap.has(id)) {
        const mem = membersMap.get(id);
        statsMap.set(id, {
          id,
          name: w.athlete_name || (mem ? mem.display_name : tr("unknownAthlete", "不明")),
          role: mem ? mem.role : "athlete",
          count: 0,
          distance: 0,
          bestSplit: null,
          splitSum: 0,
          splitCount: 0,
          rateSum: 0,
          rateCount: 0,
          wattSum: 0,
          wattCount: 0
        });
      }
      const s = statsMap.get(id);
      s.count += 1;
      s.distance += Number(w.distance_m) || 0;
      const split = Number(w.split_500m_sec);
      if (Number.isFinite(split) && split > 0) {
        if (s.bestSplit === null || split < s.bestSplit) s.bestSplit = split;
        s.splitSum += split;
        s.splitCount += 1;
      }
      const rate = Number(w.stroke_rate);
      if (Number.isFinite(rate) && rate > 0) {
        s.rateSum += rate;
        s.rateCount += 1;
      }
      const watt = Number(w.average_watt);
      if (Number.isFinite(watt) && watt > 0) {
        s.wattSum += watt;
        s.wattCount += 1;
      }
    }

    const rows = Array.from(statsMap.values());
    const sortBy = $("athlete-sort").value;
    rows.sort((a, b) => {
      if (sortBy === "best_split") {
        if (a.bestSplit === null) return 1;
        if (b.bestSplit === null) return -1;
        return a.bestSplit - b.bestSplit;
      }
      if (sortBy === "count") return b.count - a.count;
      return b.distance - a.distance;
    });

    $("athletes-empty").hidden = rows.length > 0;

    for (const s of rows) {
      const tr = document.createElement("tr");
      tr.addEventListener("click", () => {
        $("filter-athlete").value = s.id;
        switchViewTab("feed");
        applyFiltersAndRender();
      });

      tr.appendChild(createEl("td", "", s.name));
      const roleTd = document.createElement("td");
      roleTd.appendChild(createEl("span", "role-chip", roleLabel(s.role)));
      tr.appendChild(roleTd);
      tr.appendChild(createEl("td", "num", `${s.count}`));
      tr.appendChild(createEl("td", "num", formatDistance(s.distance)));
      tr.appendChild(createEl("td", "num", s.bestSplit ? formatSplit(s.bestSplit) : "-"));
      tr.appendChild(createEl("td", "num", s.splitCount ? formatSplit(s.splitSum / s.splitCount) : "-"));
      tr.appendChild(createEl("td", "num", s.rateCount ? `${(s.rateSum / s.rateCount).toFixed(1)} spm` : "-"));
      tr.appendChild(createEl("td", "num", s.wattCount ? `${Math.round(s.wattSum / s.wattCount)} W` : "-"));
      tbody.appendChild(tr);
    }
  }

  function renderAnalytics() {
    const list = state.filteredWorkouts;

    // 1. 日別集計（最新14日分）
    const dailyWrap = $("chart-daily-wrap");
    clearElement(dailyWrap);
    const byDay = new Map();
    for (const w of list) {
      if (!w.recorded_on) continue;
      const day = w.recorded_on.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + (Number(w.distance_m) || 0));
    }
    const dayKeys = Array.from(byDay.keys()).sort().slice(-14);
    if (dayKeys.length === 0) {
      dailyWrap.appendChild(createEl("p", "muted", tr("noChartData", "表示できるデータがありません。")));
    } else {
      const maxVal = Math.max(...dayKeys.map((k) => byDay.get(k)), 1);
      const svgNS = "http://www.w3.org/2000/svg";
      const width = 620;
      const height = 220;
      const padL = 44;
      const padB = 28;
      const padT = 16;
      const chartH = height - padB - padT;
      const chartW = width - padL - 12;
      const step = chartW / dayKeys.length;
      const barW = Math.max(10, Math.min(30, step * 0.58));

      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      // グリッド線
      for (let i = 0; i <= 3; i++) {
        const y = padT + (chartH / 3) * i;
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", String(padL));
        line.setAttribute("x2", String(width - 8));
        line.setAttribute("y1", String(y));
        line.setAttribute("y2", String(y));
        line.setAttribute("stroke", "rgba(255,255,255,0.08)");
        svg.appendChild(line);

        const valKm = ((maxVal * (3 - i)) / 3 / 1000).toFixed(0);
        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", String(padL - 6));
        label.setAttribute("y", String(y + 4));
        label.setAttribute("text-anchor", "end");
        label.setAttribute("fill", "#8a90a8");
        label.setAttribute("font-size", "10");
        label.textContent = `${valKm}k`;
        svg.appendChild(label);
      }

      dayKeys.forEach((k, idx) => {
        const val = byDay.get(k);
        const h = (val / maxVal) * chartH;
        const x = padL + step * idx + (step - barW) / 2;
        const y = padT + chartH - h;

        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", String(x));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(barW));
        rect.setAttribute("height", String(Math.max(2, h)));
        rect.setAttribute("rx", "4");
        rect.setAttribute("fill", "#4dcbff");
        const title = document.createElementNS(svgNS, "title");
        title.textContent = `${k}: ${formatDistance(val)}`;
        rect.appendChild(title);
        svg.appendChild(rect);

        const xText = document.createElementNS(svgNS, "text");
        xText.setAttribute("x", String(x + barW / 2));
        xText.setAttribute("y", String(height - 8));
        xText.setAttribute("text-anchor", "middle");
        xText.setAttribute("fill", "#8a90a8");
        xText.setAttribute("font-size", "10");
        xText.textContent = k.slice(5).replace("-", "/");
        svg.appendChild(xText);
      });

      dailyWrap.appendChild(svg);
    }

    // 2. 選手別ランキング横棒
    const barsWrap = $("chart-athlete-bars");
    clearElement(barsWrap);
    const byAthlete = new Map();
    for (const w of list) {
      const name = w.athlete_name || tr("unknownAthlete", "不明");
      byAthlete.set(name, (byAthlete.get(name) || 0) + (Number(w.distance_m) || 0));
    }
    const ranked = Array.from(byAthlete.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (ranked.length === 0) {
      barsWrap.appendChild(createEl("p", "muted", tr("noChartData", "表示できるデータがありません。")));
      return;
    }
    const topDist = Math.max(ranked[0][1], 1);
    for (const [name, dist] of ranked) {
      const row = createEl("div", "bar-row");
      const head = createEl("div", "bar-row-head");
      head.appendChild(createEl("span", "", name));
      head.appendChild(createEl("strong", "", formatDistance(dist)));
      const track = createEl("div", "bar-track");
      const fill = createEl("div", "bar-fill");
      fill.style.width = `${Math.max(4, Math.round((dist / topDist) * 100))}%`;
      track.appendChild(fill);
      row.appendChild(head);
      row.appendChild(track);
      barsWrap.appendChild(row);
    }
  }

  // ── Boat Crew Visualization ──
  const SVG_NS = "http://www.w3.org/2000/svg";

  const BOAT_SPECS = {
    "1x": { code: "1x", i18nKey: "boat1x", displayName: "シングル", rowerCount: 1, hasCoxswain: false, isScull: true, widthFactor: 0.52, iconKind: "single" },
    "2x": { code: "2x", i18nKey: "boat2x", displayName: "ダブルスカル", rowerCount: 2, hasCoxswain: false, isScull: true, widthFactor: 0.66, iconKind: "double" },
    "2-": { code: "2-", i18nKey: "boat2Minus", displayName: "ペア", rowerCount: 2, hasCoxswain: false, isScull: false, widthFactor: 0.66, iconKind: "double" },
    "4x+": { code: "4x+", i18nKey: "boat4xPlus", displayName: "舵手付きクォード", rowerCount: 4, hasCoxswain: true, isScull: true, widthFactor: 0.80, iconKind: "group" },
    "4-": { code: "4-", i18nKey: "boat4Minus", displayName: "フォア", rowerCount: 4, hasCoxswain: false, isScull: false, widthFactor: 0.80, iconKind: "group" },
    "8+": { code: "8+", i18nKey: "boat8Plus", displayName: "エイト", rowerCount: 8, hasCoxswain: true, isScull: false, widthFactor: 0.94, iconKind: "group" }
  };

  function svgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function getBoatSeatLabels(spec) {
    const labels = [];
    for (let i = 1; i <= spec.rowerCount; i++) {
      if (i === 1) labels.push("Bow");
      else if (i === spec.rowerCount) labels.push("Stroke");
      else labels.push(String(i));
    }
    if (spec.hasCoxswain) labels.push("Cox");
    return labels;
  }

  function createHeaderCrewIcon(iconKind) {
    const svg = svgEl("svg", {
      class: "crew-header-icon",
      viewBox: "0 0 28 20",
      width: "24",
      height: "17",
      "aria-hidden": "true"
    });
    const drawPerson = (cx, cy, rHead, bodyW, bodyH, opacity = "1") => {
      svg.appendChild(svgEl("circle", { cx, cy, r: rHead, fill: "currentColor", opacity }));
      svg.appendChild(svgEl("path", {
        d: `M ${cx - bodyW / 2} ${cy + rHead + bodyH} C ${cx - bodyW / 2} ${cy + rHead + 1.5} ${cx + bodyW / 2} ${cy + rHead + 1.5} ${cx + bodyW / 2} ${cy + rHead + bodyH} Z`,
        fill: "currentColor",
        opacity
      }));
    };
    if (iconKind === "single") {
      drawPerson(14, 5.5, 3.2, 11, 7.5);
    } else if (iconKind === "double") {
      drawPerson(9.5, 7, 2.5, 8.5, 6, "0.78");
      drawPerson(18, 5.8, 3, 10.5, 7.2);
    } else {
      drawPerson(6.5, 7.2, 2.3, 7.5, 5.5, "0.75");
      drawPerson(21.5, 7.2, 2.3, 7.5, 5.5, "0.75");
      drawPerson(14, 5.8, 2.9, 10, 7);
    }
    return svg;
  }

  function appendSeatIcon(svg, cx, cy, isCox, isEmpty) {
    if (isCox) {
      svg.appendChild(svgEl("circle", {
        cx, cy, r: 12,
        fill: "rgba(249, 115, 22, 0.28)"
      }));
      const g = svgEl("g", {
        transform: `translate(${cx - 6}, ${cy - 5.5})`,
        fill: "#fb923c"
      });
      g.appendChild(svgEl("path", {
        d: "M10.5 1.5L4.5 4H2a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h.8l.9 2.6a.6.6 0 0 0 .57.4h1a.5.5 0 0 0 .47-.67L5.1 8l5.4 2.5a.5.5 0 0 0 .7-.46V1.96a.5.5 0 0 0-.7-.46z"
      }));
      svg.appendChild(g);
    } else {
      svg.appendChild(svgEl("circle", {
        cx, cy, r: 12,
        fill: "rgba(77, 203, 255, 0.2)"
      }));
      const fill = isEmpty ? "rgba(138, 144, 168, 0.55)" : "#4dcbff";
      svg.appendChild(svgEl("circle", { cx, cy: cy - 2.6, r: 2.6, fill }));
      svg.appendChild(svgEl("path", {
        d: `M ${cx - 4.8} ${cy + 5.6} C ${cx - 4.8} ${cy + 1.4} ${cx + 4.8} ${cy + 1.4} ${cx + 4.8} ${cy + 5.6} Z`,
        fill
      }));
    }
  }

  function buildCrewDiagramCard(boatTypeRaw, members) {
    const spec = BOAT_SPECS[boatTypeRaw];
    if (!spec) return null;

    const card = createEl("div", "crew-diagram-card");
    const boatName = tr(spec.i18nKey, spec.displayName);

    const titleRow = createEl("div", "crew-diagram-title");
    titleRow.appendChild(createHeaderCrewIcon(spec.iconKind));
    titleRow.appendChild(createEl("span", "", `${boatName} (${spec.code})`));
    card.appendChild(titleRow);

    const totalSeats = spec.rowerCount + (spec.hasCoxswain ? 1 : 0);
    const labels = getBoatSeatLabels(spec);
    const isSmallBoat = spec.code === "1x" || spec.code === "2x" || spec.code === "2-";
    const isEight = spec.code === "8+";

    const W = 560;
    const H = isSmallBoat ? 148 : isEight ? 236 : 190;
    const centerY = isSmallBoat ? 66 : isEight ? 118 : 95;
    const boatHeight = 16;

    const boatWidth = W * spec.widthFactor;
    const boatLeft = (W - boatWidth) / 2;
    const usableWidth = boatWidth * 0.85;
    const startX = boatLeft + boatWidth * 0.075;
    const bowX = boatLeft + boatWidth * 0.03;
    const sternX = boatLeft + boatWidth * 0.97;

    const svg = svgEl("svg", {
      class: "crew-diagram-svg",
      viewBox: `0 0 ${W} ${H}`,
      role: "img",
      "aria-label": tr("crewDiagramAria", `${boatName} (${spec.code}) クルー編成図`, { name: boatName, code: spec.code })
    });

    // Boat hull gradient
    const defs = svgEl("defs");
    const grad = svgEl("linearGradient", {
      id: `hull-grad-${spec.code.replace(/[^a-z0-9]/gi, "")}`,
      x1: "0%", y1: "0%", x2: "100%", y2: "0%"
    });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#4dcbff", "stop-opacity": "0.17" }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#3a8aff", "stop-opacity": "0.10" }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    // Boat hull path
    const hullTop = centerY - boatHeight;
    const hullBot = centerY + boatHeight;
    const hullD = [
      `M ${bowX} ${centerY}`,
      `Q ${boatLeft + boatWidth * 0.08} ${centerY - boatHeight * 0.3} ${boatLeft + boatWidth * 0.2} ${hullTop}`,
      `L ${boatLeft + boatWidth * 0.8} ${hullTop}`,
      `Q ${boatLeft + boatWidth * 0.95} ${centerY - boatHeight * 0.5} ${sternX} ${centerY}`,
      `Q ${boatLeft + boatWidth * 0.95} ${centerY + boatHeight * 0.5} ${boatLeft + boatWidth * 0.8} ${hullBot}`,
      `L ${boatLeft + boatWidth * 0.2} ${hullBot}`,
      `Q ${boatLeft + boatWidth * 0.08} ${centerY + boatHeight * 0.3} ${bowX} ${centerY}`,
      "Z"
    ].join(" ");
    svg.appendChild(svgEl("path", {
      d: hullD,
      fill: `url(#${grad.getAttribute("id")})`,
      stroke: "rgba(77, 203, 255, 0.55)",
      "stroke-width": "1.5"
    }));

    // Oars (for 1x, 2x, 2- only)
    if (isSmallBoat) {
      for (let i = 0; i < spec.rowerCount; i++) {
        const seatX = startX + (usableWidth / (totalSeats + 1)) * (i + 1);
        if (spec.isScull) {
          svg.appendChild(svgEl("polyline", {
            points: `${seatX},${centerY} ${seatX - 4},${centerY - 22}`,
            fill: "none",
            stroke: "rgba(77, 203, 255, 0.42)",
            "stroke-width": "1.6",
            "stroke-linecap": "round"
          }));
          svg.appendChild(svgEl("polyline", {
            points: `${seatX},${centerY} ${seatX - 4},${centerY + 22}`,
            fill: "none",
            stroke: "rgba(77, 203, 255, 0.42)",
            "stroke-width": "1.6",
            "stroke-linecap": "round"
          }));
        } else {
          const isTopSide = i % 2 === 0;
          svg.appendChild(svgEl("polyline", {
            points: `${seatX},${centerY} ${seatX - 6},${isTopSide ? centerY - 24 : centerY + 24}`,
            fill: "none",
            stroke: "rgba(77, 203, 255, 0.42)",
            "stroke-width": "1.6",
            "stroke-linecap": "round"
          }));
        }
      }
    }

    // Leader polylines (for 4x+, 4-, 8+)
    const seatPositions = [];
    for (let i = 0; i < totalSeats; i++) {
      const seatX = startX + (usableWidth / (totalSeats + 1)) * (i + 1);
      const rawName = i < members.length ? String(members[i] || "").trim() : "";
      const isEmpty = rawName.length === 0;
      const isCox = spec.hasCoxswain && i === totalSeats - 1;

      let layout;
      if (isSmallBoat) {
        layout = {
          drawLine: false,
          nameX: seatX,
          nameY: centerY + 46
        };
      } else {
        const isTop = isEight ? Math.floor(i / 2) % 2 === 0 : i % 2 === 0;
        const isFurther = isEight && i % 2 !== 0 && i !== totalSeats - 1;
        const offsetY = isEight ? (isFurther ? 78 : 48) : 52;
        const lineY = isTop ? centerY - offsetY : centerY + offsetY;
        const dx = isFurther ? 24 : (isEight ? 12 : 15);
        const horizLen = isEight ? 26 : 28;
        const startY = isTop ? centerY - 14 : centerY + 14;
        const midX = seatX + dx;
        const endX = midX + horizLen;

        svg.appendChild(svgEl("polyline", {
          points: `${seatX},${startY} ${midX},${lineY} ${endX},${lineY}`,
          fill: "none",
          stroke: "rgba(148, 163, 184, 0.46)",
          "stroke-width": "1.2",
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        }));

        layout = {
          drawLine: true,
          nameX: midX + horizLen / 2,
          nameY: isTop ? lineY - 7 : lineY + 15
        };
      }

      seatPositions.push({ seatX, label: labels[i], rawName, isEmpty, isCox, layout });
    }

    // Seat labels & icons inside hull
    for (const s of seatPositions) {
      const labelEl = svgEl("text", {
        x: s.seatX,
        y: centerY - boatHeight - 7,
        "text-anchor": "middle",
        fill: s.isCox ? "#fb923c" : "#4dcbff",
        "font-size": "10.5",
        "font-weight": "700"
      });
      labelEl.textContent = s.label;
      svg.appendChild(labelEl);

      appendSeatIcon(svg, s.seatX, centerY, s.isCox, s.isEmpty);
    }

    // Crew member names
    for (const s of seatPositions) {
      const displayText = s.isEmpty ? "—" : (s.rawName.length > 10 ? `${s.rawName.slice(0, 9)}…` : s.rawName);
      const nameEl = svgEl("text", {
        x: s.layout.nameX,
        y: s.layout.nameY,
        "text-anchor": "middle",
        fill: s.isEmpty ? "rgba(138, 144, 168, 0.55)" : "#f0f2f8",
        "font-size": isEight ? "10.5" : "11.5",
        "font-weight": s.isEmpty ? "400" : "600"
      });
      nameEl.textContent = displayText;
      if (!s.isEmpty && s.rawName.length > 10) {
        const titleEl = svgEl("title");
        titleEl.textContent = s.rawName;
        nameEl.appendChild(titleEl);
      }
      svg.appendChild(nameEl);
    }

    // Bow direction indicator (bottom-left)
    const bowY = H - 10;
    const bowGroup = svgEl("g", { fill: "rgba(138, 144, 168, 0.65)" });
    bowGroup.appendChild(svgEl("polygon", {
      points: `${bowX},${bowY - 3.5} ${bowX + 6},${bowY - 7} ${bowX + 6},${bowY}`
    }));
    const bowText = svgEl("text", {
      x: bowX + 10,
      y: bowY,
      "font-size": "9.5",
      "font-weight": "600"
    });
    bowText.textContent = "Bow";
    bowGroup.appendChild(bowText);
    svg.appendChild(bowGroup);

    card.appendChild(svg);
    return card;
  }

  // ── Detail Modal ──
  function openWorkoutModal(w) {
    const modalBadge = $("modal-type-badge");
    modalBadge.className = `modal-badge ${workoutTypeClass(w.type)}`;
    modalBadge.textContent = isOnWaterType(w.type)
      ? workoutTypeLabel(w.type)
      : `${workoutTypeLabel(w.type)} / ${w.format || "-"}`;
    $("modal-athlete-name").textContent = w.athlete_name || tr("unknownAthleteFull", "不明な選手");
    $("modal-date").textContent = formatDateTime(w.recorded_on);

    const metricsEl = $("modal-metrics");
    clearElement(metricsEl);
    const metricPairs = [
      [tr("metricDist", "距離"), formatDistance(w.distance_m)],
      [tr("metricTime", "時間"), formatDuration(w.duration_sec)],
      [tr("metricSplit", "500mペース"), formatSplit(w.split_500m_sec)],
      [tr("metricRate", "レート"), w.stroke_rate ? `${Math.round(w.stroke_rate)} spm` : "-"],
      [tr("metricPower", "平均パワー"), w.average_watt ? `${Math.round(w.average_watt)} W` : "-"],
      [tr("metricCalories", "消費カロリー"), w.calories ? `${Math.round(w.calories)} kcal` : "-"]
    ];
    for (const [label, val] of metricPairs) {
      const box = createEl("div", "modal-metric-box");
      box.appendChild(createEl("span", "", label));
      box.appendChild(createEl("strong", "", val));
      metricsEl.appendChild(box);
    }

    const notesSection = $("modal-notes-section");
    if (w.notes && w.notes.trim()) {
      $("modal-notes-text").textContent = w.notes;
      notesSection.hidden = false;
    } else {
      notesSection.hidden = true;
    }

    const crewSection = $("modal-crew-section");
    const crewGrid = $("modal-crew-grid");
    clearElement(crewGrid);
    let hasCrew = false;
    if (w.crew_info) {
      try {
        const crew = typeof w.crew_info === "string" ? JSON.parse(w.crew_info) : w.crew_info;
        if (crew && Array.isArray(crew.members)) {
          hasCrew = true;
          const boatKey = crew.boatType || w.boat_type || "";
          const diagramCard = buildCrewDiagramCard(boatKey, crew.members);
          if (diagramCard) {
            crewGrid.className = "crew-diagram-wrap";
            crewGrid.appendChild(diagramCard);
          } else {
            crewGrid.className = "crew-grid";
            crew.members.forEach((name, idx) => {
              const seatEl = createEl("div", "crew-seat");
              seatEl.appendChild(createEl("span", "", `Seat ${idx + 1}${boatKey ? ` (${boatKey})` : ""}`));
              seatEl.appendChild(createEl("strong", "", name && name.trim() ? name : tr("seatUnassigned", "未設定")));
              crewGrid.appendChild(seatEl);
            });
          }
        }
      } catch {
        // JSON不正時は非表示
      }
    }
    crewSection.hidden = !hasCrew;

    const sumSection = $("modal-summary-section");
    const sumList = $("modal-summary-list");
    clearElement(sumList);
    let hasSummary = false;
    if (w.summary_json) {
      try {
        const parsed = JSON.parse(w.summary_json);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const entries = Object.entries(parsed).slice(0, 12);
          if (entries.length > 0) {
            hasSummary = true;
            for (const [k, v] of entries) {
              const item = createEl("div", "summary-item");
              item.appendChild(createEl("span", "", k));
              item.appendChild(createEl("strong", "", typeof v === "object" ? JSON.stringify(v) : String(v)));
              sumList.appendChild(item);
            }
          }
        }
      } catch {
        // JSON不正時は非表示
      }
    }
    sumSection.hidden = !hasSummary;

    $("detail-modal").hidden = false;
  }

  function closeWorkoutModal() {
    $("detail-modal").hidden = true;
  }

  // ── Contact / Feedback Modal ──
  function getContactPlaceholder(cat) {
    if (cat === "bug") return tr("phContactBug", "発生した画面や操作手順、表示されたエラーなどをご記入ください");
    if (cat === "feature") return tr("phContactFeature", "あると嬉しい機能や改善したい点をご記入ください");
    return tr("phContactOther", "お問い合わせ内容をご記入ください");
  }

  function getSelectedContactCategory() {
    const checked = document.querySelector('input[name="contact-category"]:checked');
    return checked ? checked.value : "bug";
  }

  function updateContactPlaceholder() {
    const msgEl = $("contact-message");
    if (!msgEl) return;
    msgEl.placeholder = getContactPlaceholder(getSelectedContactCategory());
  }

  function openContactModal() {
    const modal = $("contact-modal");
    if (!modal) return;
    $("contact-error").hidden = true;
    const teamName = (state.dashboard && state.dashboard.team && state.dashboard.team.name)
      || (state.publicTeam && state.publicTeam.name)
      || "";
    if ($("contact-club") && !$("contact-club").value.trim()) {
      $("contact-club").value = teamName;
    }
    const viewerEmail = state.dashboard && state.dashboard.viewer && state.dashboard.viewer.email
      ? state.dashboard.viewer.email
      : "";
    if ($("contact-email") && !$("contact-email").value.trim() && viewerEmail) {
      $("contact-email").value = viewerEmail;
    }
    updateContactPlaceholder();
    modal.hidden = false;
  }

  function closeContactModal() {
    const modal = $("contact-modal");
    if (modal) modal.hidden = true;
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    const errEl = $("contact-error");
    errEl.hidden = true;

    const category = getSelectedContactCategory();
    const clubName = $("contact-club").value.trim();
    const message = $("contact-message").value.trim();
    const needsReply = $("contact-needs-reply").checked;
    const replyEmail = $("contact-email").value.trim();

    if (!clubName) {
      errEl.textContent = tr("errClubRequired", "クラブ名を入力してください。");
      errEl.hidden = false;
      return;
    }
    if (!message) {
      errEl.textContent = tr("errMsgRequired", "内容を入力してください。");
      errEl.hidden = false;
      return;
    }
    if (needsReply && (!replyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail))) {
      errEl.textContent = tr("errReplyEmailInvalid", "返信を希望する場合は、有効なメールアドレスを入力してください。");
      errEl.hidden = false;
      return;
    }

    const submitBtn = $("btn-contact-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = tr("btnSending", "送信中...");

    try {
      const targetKey = state.slugOrId || (state.dashboard && state.dashboard.team && (state.dashboard.team.slug || state.dashboard.team.id));
      const res = await apiFetch(`/web/teams/${encodeURIComponent(targetKey)}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          category,
          club_name: clubName,
          message,
          needs_reply: needsReply,
          reply_email: needsReply ? replyEmail : "",
          page_url: location.href
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(data.error || "Unauthorized");
        }
        throw new Error(data.error || tr("contactSendFailed", "送信に失敗しました。時間をおいて再度お試しください。"));
      }
      $("contact-message").value = "";
      $("contact-needs-reply").checked = false;
      $("contact-reply-wrap").hidden = true;
      closeContactModal();
      showToast(tr("contactSentToast", "送信しました。ご連絡ありがとうございます"));
    } catch (err) {
      errEl.textContent = formatUserErrorMessage(
        err,
        tr("contactSendFailed", "送信に失敗しました。通信環境をご確認のうえ再度お試しください。")
      );
      errEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = tr("btnSend", "送信する");
    }
  }

  // ── View / Tab Switching ──
  function switchViewTab(tabName) {
    state.activeViewTab = tabName;
    document.querySelectorAll("[data-view-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view-tab") === tabName);
    });
    $("panel-feed").hidden = tabName !== "feed";
    $("panel-athletes").hidden = tabName !== "athletes";
    $("panel-analytics").hidden = tabName !== "analytics";
  }

  // ── Event Binding ──
  function bindUIEvents() {
    const navToggle = $("nav-toggle");
    const mobileMenu = $("mobile-menu");
    if (navToggle && mobileMenu) {
      navToggle.addEventListener("click", () => {
        const open = mobileMenu.classList.toggle("open");
        navToggle.classList.toggle("open", open);
      });
      mobileMenu.querySelectorAll("a").forEach((a) => {
        a.addEventListener("click", () => {
          mobileMenu.classList.remove("open");
          navToggle.classList.remove("open");
        });
      });
    }

    window.addEventListener("popstate", () => {
      location.reload();
    });

    document.querySelectorAll("[data-view-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchViewTab(btn.getAttribute("data-view-tab")));
    });

    document.querySelectorAll(".toggle-pw").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = $(btn.getAttribute("data-target"));
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? tr("btnHide", "隠す") : tr("btnShow", "表示");
      });
    });

    $("btn-regen-code").addEventListener("click", startNewAppSession);

    $("form-slug-jump").addEventListener("submit", async (e) => {
      e.preventDefault();
      const key = extractSlugInput($("slug-jump-input").value);
      if (!key || !/^[a-zA-Z0-9_-]+$/.test(key)) {
        showToast(tr("slugToastInvalid", "専用URLのチーム識別子（半角英数字・ハイフン・アンダースコア）を入力してください"));
        return;
      }
      const submitBtn = $("form-slug-jump").querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      setLoadingMessage(tr("authenticating", "認証中..."));
      showOnlyView("view-loading");

      let resolvedKey = key;
      try {
        const res = await apiFetch(`/web/teams/${encodeURIComponent(key)}/public`);
        if (res.status === 404) {
          showOnlyView("view-auth");
          showToast(tr("notFoundTitle", "指定された専用URLのチームが見つかりません"));
          return;
        }
        if (res.ok) {
          const team = await res.json();
          resolvedKey = team.slug || team.id || key;
          state.publicTeam = team;
          state.slugOrId = resolvedKey;
          document.title = `${team.name} — RowPilot Team Web`;

          const loaded = await tryLoadDashboard();
          if (loaded) {
            history.pushState(null, "", buildTeamUrl(resolvedKey));
            return;
          }

          history.pushState(null, "", buildTeamUrl(resolvedKey));
          enterAuthView();
          return;
        }
      } catch (err) {
        showOnlyView("view-auth");
        showToast(
          formatUserErrorMessage(
            err,
            tr("errNetwork", "通信エラーが発生しました。通信環境をご確認のうえ再度お試しください。")
          )
        );
        return;
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
      showOnlyView("view-auth");
      showToast(tr("errServer", "チーム情報の取得に失敗しました。通信環境をご確認のうえ再度お試しください。"));
    });

    $("btn-show-reset").addEventListener("click", () => {
      $("form-coach-login").hidden = true;
      $("team-select-panel").hidden = true;
      $("form-coach-reset").hidden = false;
      $("reset-error").hidden = true;
      $("reset-success").hidden = true;
    });

    $("btn-back-login").addEventListener("click", () => {
      $("form-coach-reset").hidden = true;
      $("team-select-panel").hidden = true;
      $("form-coach-login").hidden = false;
      $("coach-login-error").hidden = true;
    });

    $("btn-cancel-team-select").addEventListener("click", () => {
      $("team-select-panel").hidden = true;
      $("form-coach-login").hidden = false;
      $("coach-login-error").hidden = true;
    });

    $("form-coach-login").addEventListener("submit", handleCoachLogin);
    $("form-coach-reset").addEventListener("submit", handleCoachResetRequest);
    $("form-set-password").addEventListener("submit", handleSetPassword);

    $("btn-contact").addEventListener("click", openContactModal);

    $("btn-refresh").addEventListener("click", async () => {
      const ok = await tryLoadDashboard();
      if (ok) {
        showToast(tr("refreshOk", "最新の記録を取得しました"));
      } else {
        showToast(tr("refreshFail", "最新の記録を取得できませんでした。通信環境をご確認のうえ再度お試しください。"));
      }
    });

    $("btn-logout").addEventListener("click", async () => {
      try {
        await apiFetch("/web-auth/logout", { method: "POST" });
      } catch {
        // 無視
      }
      clearFallbackToken();
      document.body.classList.remove("is-authenticated");
      state.dashboard = null;
      state.slugOrId = null;
      state.publicTeam = null;
      location.assign(buildTeamUrl(""));
    });

    $("btn-print").addEventListener("click", () => window.print());
    $("btn-export-csv").addEventListener("click", handleExportCsv);

    $("filter-q").addEventListener("input", applyFiltersAndRender);
    ["filter-athlete", "filter-type", "filter-from", "filter-to"].forEach((id) => {
      $(id).addEventListener("change", applyFiltersAndRender);
    });

    $("filter-period").addEventListener("change", () => {
      const isCustom = $("filter-period").value === "custom";
      $("custom-date-from-wrap").hidden = !isCustom;
      $("custom-date-to-wrap").hidden = !isCustom;
      applyFiltersAndRender();
    });

    if ($("btn-toggle-filters")) {
      $("btn-toggle-filters").addEventListener("click", () => {
        const section = $("filter-section");
        const nextOpen = !(section && section.classList.contains("is-open"));
        setFiltersOpen(nextOpen);
      });
    }
    if ($("btn-close-filters")) {
      $("btn-close-filters").addEventListener("click", () => setFiltersOpen(false));
    }
    if ($("btn-reset-filters")) {
      $("btn-reset-filters").addEventListener("click", resetAllFilters);
    }
    if ($("btn-reset-filters-quick")) {
      $("btn-reset-filters-quick").addEventListener("click", resetAllFilters);
    }
    updateFilterSummaryUi();

    $("athlete-sort").addEventListener("change", renderAthleteSummary);

    $("modal-close").addEventListener("click", closeWorkoutModal);
    $("detail-modal").addEventListener("click", (e) => {
      if (e.target === $("detail-modal")) closeWorkoutModal();
    });

    if ($("contact-modal")) {
      $("contact-modal-close").addEventListener("click", closeContactModal);
      $("btn-contact-cancel").addEventListener("click", closeContactModal);
      $("contact-modal").addEventListener("click", (e) => {
        if (e.target === $("contact-modal")) closeContactModal();
      });
      $("form-contact").addEventListener("submit", handleContactSubmit);
      document.querySelectorAll('input[name="contact-category"]').forEach((radio) => {
        radio.addEventListener("change", updateContactPlaceholder);
      });
      $("contact-needs-reply").addEventListener("change", () => {
        const needsReply = $("contact-needs-reply").checked;
        $("contact-reply-wrap").hidden = !needsReply;
        if (needsReply) {
          $("contact-email").focus();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!$("detail-modal").hidden) closeWorkoutModal();
        if ($("contact-modal") && !$("contact-modal").hidden) closeContactModal();
      }
    });
  }

  function renderTeamSelection(teams) {
    const list = $("team-select-list");
    clearElement(list);

    for (const team of teams) {
      const btn = createEl("button", "team-select-btn");
      btn.type = "button";
      btn.appendChild(createEl("span", "team-select-name", team.name || "RowPilot Team"));
      if (team.slug) {
        btn.appendChild(createEl("span", "team-select-slug", `/teams/${team.slug}/`));
      }
      btn.addEventListener("click", () => submitCoachLogin(team.id));
      list.appendChild(btn);
    }

    $("form-coach-login").hidden = true;
    $("form-coach-reset").hidden = true;
    $("team-select-panel").hidden = false;
  }

  async function submitCoachLogin(overrideSlugOrId) {
    const errEl = $("coach-login-error");
    errEl.hidden = true;

    const email = $("coach-email").value.trim();
    const password = $("coach-password").value;
    if (!email || !password) {
      errEl.textContent = tr("errEmailPwRequired", "メールアドレスとパスワードを入力してください。");
      errEl.hidden = false;
      return;
    }

    const btn = $("btn-coach-login");
    btn.disabled = true;
    document.querySelectorAll(".team-select-btn").forEach((b) => {
      b.disabled = true;
    });

    try {
      const targetSlug = overrideSlugOrId || state.slugOrId;
      const payload = targetSlug
        ? { slug_or_id: targetSlug, email, password }
        : { email, password };

      const res = await apiFetch("/web-auth/coach/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(data.error || tr("errAuthFailed", "認証に失敗しました。入力内容をご確認のうえ、解決しない場合はサポートページからお問い合わせください。"));
        }
        throw new Error(data.error || tr("errLoginFailed", "ログインに失敗しました。時間をおいて再度お試しください。"));
      }

      if (data.requires_team_selection && Array.isArray(data.teams)) {
        renderTeamSelection(data.teams);
        return;
      }

      saveFallbackTokenIfNeeded(data.web_token);
      $("coach-password").value = "";

      const targetKey = data.team_slug || data.team_id;
      if (!state.slugOrId || (targetKey && state.slugOrId !== data.team_slug && state.slugOrId !== data.team_id)) {
        if (targetKey) {
          location.assign(buildTeamUrl(targetKey));
          return;
        }
      }

      $("team-select-panel").hidden = true;
      $("form-coach-login").hidden = false;
      const ok = await tryLoadDashboard();
      if (!ok) {
        throw new Error(tr("errDashboardLoad", "ダッシュボードの読み込みに失敗しました。通信環境をご確認のうえ、解決しない場合はサポートページからお問い合わせください。"));
      }
    } catch (err) {
      $("team-select-panel").hidden = true;
      $("form-coach-login").hidden = false;
      errEl.textContent = formatUserErrorMessage(
        err,
        tr("errLoginFailed", "ログインに失敗しました。通信環境をご確認のうえ、解決しない場合はサポートページからお問い合わせください。")
      );
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
      document.querySelectorAll(".team-select-btn").forEach((b) => {
        b.disabled = false;
      });
    }
  }

  async function handleCoachLogin(e) {
    e.preventDefault();
    await submitCoachLogin(null);
  }

  async function handleCoachResetRequest(e) {
    e.preventDefault();
    const errEl = $("reset-error");
    const okEl = $("reset-success");
    errEl.hidden = true;
    okEl.hidden = true;

    const email = $("reset-email").value.trim();
    if (!email) {
      errEl.textContent = tr("errEmailRequired", "メールアドレスを入力してください。");
      errEl.hidden = false;
      return;
    }

    const btn = $("btn-submit-reset");
    btn.disabled = true;
    try {
      const payload = state.slugOrId
        ? { slug_or_id: state.slugOrId, email }
        : { email };
      const res = await apiFetch("/web-auth/coach/request-reset", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(data.error || "Unauthorized");
        }
        throw new Error(data.error || tr("errSendFailed", "送信に失敗しました。時間をおいて再度お試しください。"));
      }
      okEl.textContent = data.message || tr("resetSentMsg", "再設定メールを送信しました。");
      okEl.hidden = false;
    } catch (err) {
      errEl.textContent = formatUserErrorMessage(
        err,
        tr("errSendFailed", "送信に失敗しました。通信環境をご確認のうえ再度お試しください。")
      );
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  async function handleSetPassword(e) {
    e.preventDefault();
    const errEl = $("setup-error");
    errEl.hidden = true;

    const pw = $("setup-password").value;
    const pw2 = $("setup-password-confirm").value;
    if (pw.length < 8) {
      errEl.textContent = tr("errPwMinLen", "パスワードは8文字以上で設定してください。");
      errEl.hidden = false;
      return;
    }
    if (pw !== pw2) {
      errEl.textContent = tr("errPwMismatch", "確認用のパスワードが一致していません。");
      errEl.hidden = false;
      return;
    }

    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    const btn = $("btn-submit-setup");
    btn.disabled = true;
    try {
      const res = await apiFetch("/web-auth/coach/set-password", {
        method: "POST",
        body: JSON.stringify({ token, password: pw })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(data.error || tr("errInvalidSetupLink", "設定リンクが無効または期限切れです。チームの管理者に再招待を依頼するか、サポートページからお問い合わせください。"));
        }
        throw new Error(data.error || tr("errSetupFailed", "設定に失敗しました。時間をおいて再度お試しください。"));
      }
      saveFallbackTokenIfNeeded(data.web_token);
      // URLからtokenを消す（?lang= は維持）
      const cleanKey = (state.publicTeam && state.publicTeam.slug) || state.slugOrId;
      history.replaceState(null, "", buildTeamUrl(cleanKey));
      const ok = await tryLoadDashboard();
      if (!ok) {
        enterAuthView();
      } else {
        showToast(tr("setupSuccessToast", "パスワードを設定してログインしました"));
      }
    } catch (err) {
      errEl.textContent = formatUserErrorMessage(
        err,
        tr("errSetupFailed", "設定に失敗しました。通信環境をご確認のうえ、解決しない場合はサポートページからお問い合わせください。")
      );
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  async function handleExportCsv() {
    if (!state.dashboard || !state.dashboard.team) return;
    if (!state.dashboard.team.has_csv_export) {
      showToast(tr("csvMaxOnly", "CSVエクスポートは MAX プラン以上でご利用いただけます"));
      return;
    }

    const f = getFilterState();
    const qs = new URLSearchParams();
    if (f.from) qs.set("from", f.from);
    if (f.to) qs.set("to", f.to);
    if (f.athleteId) qs.set("athlete_id", f.athleteId);
    if (f.type) qs.set("type", f.type);
    if (f.q) qs.set("q", f.q);

    try {
      const res = await apiFetch(`/web/teams/${encodeURIComponent(state.slugOrId)}/export.csv?${qs.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          throw new Error(err.error || "Unauthorized");
        }
        throw new Error(err.error || tr("csvDownloadFailed", "CSVのダウンロードに失敗しました"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rowpilot-${state.slugOrId}-workouts.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast(tr("csvDownloadedToast", "CSVをダウンロードしました"));
    } catch (err) {
      showToast(
        formatUserErrorMessage(
          err,
          tr("csvDownloadFailed", "CSVのダウンロードに失敗しました。通信環境をご確認のうえ再度お試しください。")
        )
      );
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
