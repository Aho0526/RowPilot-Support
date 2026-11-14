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
    appSessionId: null,
    appCode: null,
    appExpiresAtMs: 0,
    pollTimer: null,
    countdownTimer: null,
    activeViewTab: "feed"
  };

  // ── DOM Helpers ──
  const $ = (id) => document.getElementById(id);

  function showOnlyView(viewId) {
    const ids = ["view-loading", "view-not-found", "view-set-password", "view-auth", "view-dashboard"];
    for (const id of ids) {
      $(id).hidden = id !== viewId;
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
    if (isCrossSiteApi()) {
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, token);
      } catch {
        // ストレージ無効時は無視
      }
    }
  }

  function clearFallbackToken() {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // 無視
    }
  }

  function getFallbackToken() {
    if (!isCrossSiteApi()) return null;
    try {
      return sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
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
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function roleLabel(role) {
    switch ((role || "").toLowerCase()) {
      case "owner": return "最高管理者";
      case "admin": return "管理者";
      case "manager": return "マネージャー";
      case "athlete": return "選手";
      case "coach": return "Webコーチ";
      case "viewer": return "閲覧専用";
      default: return role || "-";
    }
  }

  function workoutTypeLabel(type) {
    const t = (type || "").toLowerCase();
    if (t === "erg") return "エルゴ";
    if (t === "onwater" || t === "water" || t === "gps") return "水上";
    return type || "その他";
  }

  function isErgType(type) {
    return (type || "").toLowerCase() === "erg";
  }

  // ── Route Extraction ──
  function extractSlugOrId() {
    const params = new URLSearchParams(location.search);
    const qSlug = params.get("slug");
    if (qSlug && qSlug.trim()) return qSlug.trim();

    const m = location.pathname.match(/^\/teams\/([^\/]+)\/?$/);
    if (m && m[1] && m[1] !== "index.html") {
      return decodeURIComponent(m[1]);
    }
    return null;
  }

  function buildTeamUrl(key) {
    const safeKey = String(key || "").trim();
    if (!safeKey || !/^[a-zA-Z0-9_-]+$/.test(safeKey)) {
      return "/teams/";
    }
    return `/teams/${encodeURIComponent(safeKey)}/`;
  }

  // ── Initialization ──
  async function init() {
    bindUIEvents();
    state.slugOrId = extractSlugOrId();

    const params = new URLSearchParams(location.search);
    const inviteToken = params.get("token");
    const mode = params.get("mode");

    // ルートポータル (/teams/) の場合
    if (!state.slugOrId) {
      document.title = "Team Web — RowPilot";
      try {
        const meRes = await apiFetch("/web/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.authenticated && (me.team_slug || me.team_id)) {
            location.assign(buildTeamUrl(me.team_slug || me.team_id));
            return;
          }
        }
      } catch {
        // 未ログインとしてポータル表示を続行
      }
      enterAuthView();
      return;
    }

    // チーム指定あり: 公開情報取得
    try {
      const pubRes = await apiFetch(`/web/teams/${encodeURIComponent(state.slugOrId)}/public`);
      if (!pubRes.ok) {
        showOnlyView("view-not-found");
        return;
      }
      state.publicTeam = await pubRes.json();
      document.title = `${state.publicTeam.name} — RowPilot Team Web`;
    } catch {
      $("not-found-title").textContent = "サーバーに接続できません";
      $("not-found-desc").textContent = "通信環境をご確認の上、再度ページを読み込んでください。";
      showOnlyView("view-not-found");
      return;
    }

    // パスワード設定・リセットリンクの場合
    if (inviteToken && (mode === "setup" || mode === "reset")) {
      $("setup-team-pill").textContent = state.publicTeam.name;
      $("setup-title").textContent = mode === "reset" ? "新しいパスワードの設定" : "Webコーチ パスワード設定";
      showOnlyView("view-set-password");
      return;
    }

    // 既存セッションでダッシュボード取得を試みる
    const loaded = await tryLoadDashboard();
    if (!loaded) {
      enterAuthView();
    }
  }

  async function tryLoadDashboard() {
    if (!state.slugOrId) return false;
    try {
      const res = await apiFetch(`/web/teams/${encodeURIComponent(state.slugOrId)}/dashboard`);
      if (res.status === 401 || res.status === 403) {
        return false;
      }
      if (!res.ok) {
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
    $("header-actions").hidden = true;
    $("form-coach-login").hidden = false;
    $("team-select-panel").hidden = true;
    $("form-coach-reset").hidden = true;
    $("coach-login-error").hidden = true;

    const isTeamSpecific = Boolean(state.slugOrId && state.publicTeam);
    if (isTeamSpecific) {
      $("auth-team-name").textContent = state.publicTeam.name;
      $("portal-heading").textContent = `${state.publicTeam.name} の練習記録へログイン`;
      $("portal-desc").textContent =
        "Webコーチ用アカウントのメールアドレス・パスワード、または RowPilot アプリのワンタップ／QR／6桁コードでログインできます。";
      $("form-slug-jump").hidden = true;
      $("portal-showcase").hidden = true;
    } else {
      $("auth-team-name").textContent = "RowPilot Team Web";
      $("portal-heading").textContent = "チームの練習記録を、ブラウザの大画面で。";
      $("portal-desc").textContent =
        "RowPilot Team・MAXプランの練習データを、PC・タブレット・Android端末から確認できます。ログインすると所属チームの専用ページへ自動で移動します。";
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
    $("polling-status-text").textContent = "認証コードを発行しています...";

    try {
      const payload = state.slugOrId ? { slug_or_id: state.slugOrId } : {};
      const res = await apiFetch("/web-auth/app-session/init", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "認証コードの発行に失敗しました");
      }

      state.appSessionId = data.session_id;
      state.appCode = data.code;
      state.appExpiresAtMs = Date.now() + (data.expires_in_sec || 300) * 1000;

      const formattedCode = `${data.code.slice(0, 3)} ${data.code.slice(3)}`;
      $("app-code-display").textContent = formattedCode;
      const deepLink = `rowpilot://web-auth?code=${encodeURIComponent(data.code)}`;
      $("btn-open-app").href = deepLink;
      $("polling-status-text").textContent = "アプリでの承認を待機しています...";

      renderQRCode(deepLink);
      startCountdown();
      startPollingLoop();
    } catch (err) {
      $("app-auth-error").textContent = err.message || "エラーが発生しました";
      $("app-auth-error").hidden = false;
      $("polling-status-text").textContent = "コードを再発行してください";
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
      $("app-code-timer").textContent = remainSec > 0 ? `有効期限 ${m}:${s}` : "期限切れ";
      if (remainSec <= 0) {
        stopAppPolling();
        $("polling-status-text").textContent = "有効期限が切れました。コードを再発行してください。";
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
          $("polling-status-text").textContent = "承認されました！読み込み中...";
          const targetKey = data.team_slug || data.team_id;
          if (!state.slugOrId || (targetKey && state.slugOrId !== data.team_slug && state.slugOrId !== data.team_id)) {
            if (targetKey) {
              location.assign(buildTeamUrl(targetKey));
              return;
            }
          }
          const ok = await tryLoadDashboard();
          if (!ok) {
            $("app-auth-error").textContent = "ダッシュボードの読み込みに失敗しました。再読み込みしてください。";
            $("app-auth-error").hidden = false;
          }
        } else if (data.status === "expired") {
          stopAppPolling();
          $("polling-status-text").textContent = "有効期限が切れました。コードを再発行してください。";
        }
      } catch {
        // 一時的なネットワークエラーは無視してリトライ
      }
    }, 2500);
  }

  // ── Dashboard Rendering ──
  function renderDashboard() {
    const { team, viewer, members, workouts, summary } = state.dashboard;

    $("header-actions").hidden = false;
    $("viewer-pill").textContent = `${viewer.display_name} (${roleLabel(viewer.role)})`;

    $("dash-team-name").textContent = team.name;
    const badge = $("dash-plan-badge");
    badge.textContent = (team.plan || "TEAM").toUpperCase();
    badge.className = `plan-badge ${["max", "organization", "enterprise"].includes((team.plan || "").toLowerCase()) ? "max" : ""}`;

    $("dash-subtitle").textContent = `登録メンバー ${members.length}名 ・ 読み込み済み記録 ${workouts.length}件`;

    const isSuspended = !team.has_web_access;
    $("suspended-banner").hidden = !isSuspended;
    $("kpi-grid").hidden = isSuspended;
    document.querySelector(".filter-bar").hidden = isSuspended;
    document.querySelector(".view-tabs").hidden = isSuspended;
    $("panel-feed").hidden = isSuspended || state.activeViewTab !== "feed";
    $("panel-athletes").hidden = isSuspended || state.activeViewTab !== "athletes";
    $("panel-analytics").hidden = isSuspended || state.activeViewTab !== "analytics";
    $("btn-print").hidden = isSuspended;
    $("btn-export-csv").hidden = isSuspended;

    const exportBtn = $("btn-export-csv");
    if (team.has_csv_export) {
      exportBtn.textContent = "CSVエクスポート";
      exportBtn.disabled = false;
      exportBtn.title = "現在の絞り込み条件でCSVをダウンロード";
    } else {
      exportBtn.textContent = "CSVエクスポート (MAX限定)";
      exportBtn.disabled = false;
      exportBtn.title = "MAXプラン以上で開放されます";
    }

    // 選手セレクトボックス更新
    const athleteSelect = $("filter-athlete");
    const prevAthlete = athleteSelect.value;
    clearElement(athleteSelect);
    athleteSelect.appendChild(createEl("option", "", "すべての選手")).value = "";

    const seenAthletes = new Map();
    for (const m of members) {
      seenAthletes.set(m.id, m.display_name);
    }
    for (const w of workouts) {
      if (w.athlete_id && !seenAthletes.has(w.athlete_id)) {
        seenAthletes.set(w.athlete_id, w.athlete_name || "不明");
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
      $("kpi-7d-count").textContent = `${summary.workouts_7d_count} 回`;
      $("kpi-30d-dist").textContent = formatDistance(summary.distance_30d_m);
      $("kpi-30d-count").textContent = `${summary.workouts_30d_count} 回`;
      $("kpi-active-athletes").textContent = `${summary.active_athletes_30d} 名`;
      $("kpi-total-members").textContent = `全 ${members.length} 名中`;
    } else {
      $("kpi-7d-dist").textContent = "-";
      $("kpi-7d-count").textContent = "-";
      $("kpi-30d-dist").textContent = "-";
      $("kpi-30d-count").textContent = "-";
      $("kpi-active-athletes").textContent = "-";
      $("kpi-total-members").textContent = "-";
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

  function applyFiltersAndRender() {
    if (!state.dashboard) return;
    const workouts = state.dashboard.workouts || [];
    const f = getFilterState();

    const filtered = workouts.filter((w) => {
      if (f.athleteId && w.athlete_id !== f.athleteId) return false;
      if (f.type && (w.type || "").toLowerCase() !== f.type) return false;
      if (f.from && (!w.recorded_on || w.recorded_on.slice(0, 10) < f.from)) return false;
      if (f.to && (!w.recorded_on || w.recorded_on.slice(0, 10) > f.to)) return false;
      if (f.q) {
        const hay = `${w.athlete_name || ""} ${w.notes || ""} ${w.boat_type || ""} ${w.format || ""}`.toLowerCase();
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
    $("kpi-filtered-count").textContent = `表示中 ${filtered.length} 件`;

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

      tr.appendChild(createEl("td", "", formatShortDate(w.recorded_on)));
      tr.appendChild(createEl("td", "", w.athlete_name || "不明"));

      const typeTd = document.createElement("td");
      const badge = createEl("span", `type-pill ${isErgType(w.type) ? "erg" : "onwater"}`, workoutTypeLabel(w.type));
      typeTd.appendChild(badge);
      typeTd.appendChild(document.createTextNode(w.format || "-"));
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
          name: w.athlete_name || (mem ? mem.display_name : "不明"),
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
      dailyWrap.appendChild(createEl("p", "muted", "表示できるデータがありません。"));
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
      const name = w.athlete_name || "不明";
      byAthlete.set(name, (byAthlete.get(name) || 0) + (Number(w.distance_m) || 0));
    }
    const ranked = Array.from(byAthlete.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (ranked.length === 0) {
      barsWrap.appendChild(createEl("p", "muted", "表示できるデータがありません。"));
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

  // ── Detail Modal ──
  function openWorkoutModal(w) {
    $("modal-type-badge").textContent = `${workoutTypeLabel(w.type)} / ${w.format || "-"}`;
    $("modal-athlete-name").textContent = w.athlete_name || "不明な選手";
    $("modal-date").textContent = formatDateTime(w.recorded_on);

    const metricsEl = $("modal-metrics");
    clearElement(metricsEl);
    const metricPairs = [
      ["距離", formatDistance(w.distance_m)],
      ["時間", formatDuration(w.duration_sec)],
      ["500mペース", formatSplit(w.split_500m_sec)],
      ["レート", w.stroke_rate ? `${Math.round(w.stroke_rate)} spm` : "-"],
      ["平均パワー", w.average_watt ? `${Math.round(w.average_watt)} W` : "-"],
      ["消費カロリー", w.calories ? `${Math.round(w.calories)} kcal` : "-"]
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
        const crew = JSON.parse(w.crew_info);
        if (crew && Array.isArray(crew.members)) {
          hasCrew = true;
          const seats = crew.members;
          seats.forEach((name, idx) => {
            const seatEl = createEl("div", "crew-seat");
            seatEl.appendChild(createEl("span", "", `Seat ${idx + 1} (${crew.boatType || w.boat_type || ""})`));
            seatEl.appendChild(createEl("strong", "", name && name.trim() ? name : "未設定"));
            crewGrid.appendChild(seatEl);
          });
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
    document.querySelectorAll("[data-view-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchViewTab(btn.getAttribute("data-view-tab")));
    });

    document.querySelectorAll(".toggle-pw").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = $(btn.getAttribute("data-target"));
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "隠す" : "表示";
      });
    });

    $("btn-regen-code").addEventListener("click", startNewAppSession);

    $("form-slug-jump").addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = $("slug-jump-input").value.trim().toLowerCase();
      if (!raw || !/^[a-z0-9-]+$/.test(raw)) {
        showToast("専用URLは半角英数字とハイフンのみ入力してください");
        return;
      }
      location.assign(buildTeamUrl(raw));
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

    $("btn-refresh").addEventListener("click", async () => {
      const ok = await tryLoadDashboard();
      if (ok) showToast("最新の記録を取得しました");
    });

    $("btn-logout").addEventListener("click", async () => {
      try {
        await apiFetch("/web-auth/logout", { method: "POST" });
      } catch {
        // 無視
      }
      clearFallbackToken();
      state.dashboard = null;
      enterAuthView();
    });

    $("btn-print").addEventListener("click", () => window.print());
    $("btn-export-csv").addEventListener("click", handleExportCsv);

    ["filter-q", "filter-athlete", "filter-type", "filter-from", "filter-to"].forEach((id) => {
      $(id).addEventListener("input", applyFiltersAndRender);
      $(id).addEventListener("change", applyFiltersAndRender);
    });

    $("filter-period").addEventListener("change", () => {
      const isCustom = $("filter-period").value === "custom";
      $("custom-date-from-wrap").hidden = !isCustom;
      $("custom-date-to-wrap").hidden = !isCustom;
      applyFiltersAndRender();
    });

    $("athlete-sort").addEventListener("change", renderAthleteSummary);

    $("modal-close").addEventListener("click", closeWorkoutModal);
    $("detail-modal").addEventListener("click", (e) => {
      if (e.target === $("detail-modal")) closeWorkoutModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("detail-modal").hidden) {
        closeWorkoutModal();
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
      errEl.textContent = "メールアドレスとパスワードを入力してください。";
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ログインに失敗しました");
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
        throw new Error("ダッシュボードの読み込みに失敗しました");
      }
    } catch (err) {
      $("team-select-panel").hidden = true;
      $("form-coach-login").hidden = false;
      errEl.textContent = err.message;
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
      errEl.textContent = "メールアドレスを入力してください。";
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "送信に失敗しました");
      }
      okEl.textContent = data.message || "再設定メールを送信しました。";
      okEl.hidden = false;
    } catch (err) {
      errEl.textContent = err.message;
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
      errEl.textContent = "パスワードは8文字以上で設定してください。";
      errEl.hidden = false;
      return;
    }
    if (pw !== pw2) {
      errEl.textContent = "確認用のパスワードが一致していません。";
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "設定に失敗しました");
      }
      saveFallbackTokenIfNeeded(data.web_token);
      // URLからtokenを消す
      const cleanUrl = state.publicTeam && state.publicTeam.slug
        ? `/teams/${encodeURIComponent(state.publicTeam.slug)}/`
        : `/teams/?slug=${encodeURIComponent(state.slugOrId)}`;
      history.replaceState(null, "", cleanUrl);
      const ok = await tryLoadDashboard();
      if (!ok) {
        enterAuthView();
      } else {
        showToast("パスワードを設定してログインしました");
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  }

  async function handleExportCsv() {
    if (!state.dashboard || !state.dashboard.team) return;
    if (!state.dashboard.team.has_csv_export) {
      showToast("CSVエクスポートは MAX プラン以上でご利用いただけます");
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
        throw new Error(err.error || "CSVのダウンロードに失敗しました");
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
      showToast("CSVをダウンロードしました");
    } catch (err) {
      showToast(err.message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
