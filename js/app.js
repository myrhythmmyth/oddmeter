/* ============================================================
 *  ODD METER — アプリ本体
 * ============================================================ */
const OddMeter = (() => {
  "use strict";

  // ---- 状態 ----
  const state = {
    raw: [],          // 正規化済み全データ
    filtered: [],     // 表示中データ
    search: "",
    sort: "title",   // 既定は曲名順（「登録順」は廃止）
    activeMeters: new Set(),
    meterMode: "or", // "or" = いずれか含む / "and" = すべて含む
    activeDifficulties: new Set(),
    activeArtist: null,   // サイドバーで選択中のアーティスト
    artistQuery: "",      // サイドバー内の絞り込みテキスト
    artistSort: "count",  // "count" = 曲数順 / "name" = 名前順
  };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

  /* --------------------------------------------------------
   *  列マッピング：見出しゆれを吸収して内部キーへ
   * -------------------------------------------------------- */
  function resolveColumns(headers, rows) {
    const map = {};
    const lower = headers.map((h) => (h || "").trim());
    for (const [key, candidates] of Object.entries(ODD_METER_CONFIG.COLUMN_MAP)) {
      const found = lower.find((h) =>
        candidates.some((c) => h.toLowerCase() === c.toLowerCase())
      );
      if (found) map[key] = found;
    }
    // 拍子列が見出し名で見つからない場合、値の形から自動検出
    // （Googleスプシで見出しセルが空のまま公開されるケースを救済）
    if (!map.meter && rows && rows.length) {
      let best = null, bestHits = 0;
      headers.forEach((h) => {
        if (Object.values(map).includes(h)) return; // 既に割当済みの列は除外
        let hits = 0, filled = 0;
        for (const r of rows) {
          const v = (r[h] || "").toString().trim();
          if (!v) continue;
          filled++;
          if (/\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(v)) hits++;
        }
        // 値が入っている行の過半数が「数字/数字」形式なら拍子列とみなす
        if (filled >= 1 && hits / filled >= 0.5 && hits > bestHits) {
          bestHits = hits; best = h;
        }
      });
      if (best !== null) map.meter = best;
    }
    return map;
  }

  /* --------------------------------------------------------
   *  YouTube動画ID抽出（watch?v= / youtu.be / embed 対応）
   * -------------------------------------------------------- */
  function extractYouTubeId(url) {
    if (!url) return null;
    const patterns = [
      /[?&]v=([\w-]{11})/,
      /youtu\.be\/([\w-]{11})/,
      /embed\/([\w-]{11})/,
      /shorts\/([\w-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    const bare = url.trim().match(/^([\w-]{11})$/);
    return bare ? bare[1] : null;
  }

  /* --------------------------------------------------------
   *  備考から拍子を抽出（7/8, 5/4, 11/8 ... 複数可）
   * -------------------------------------------------------- */
  function extractMeters(text) {
    if (!text) return [];
    const found = new Set();
    const re = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const den = parseInt(m[2], 10);
      // 拍子として妥当な分母のみ（2,4,8,16,...）
      if ([2, 4, 8, 16, 32].includes(den)) {
        found.add(`${m[1]}/${m[2]}`);
      }
    }
    return [...found];
  }

  // 拍子タグ列（カンマ/読点/スペース区切り）をパース。"5/4, 7/4" → ["5/4","7/4"]
  function parseMeterCell(text) {
    if (!text) return [];
    const out = [];
    String(text).split(/[,、，;\s]+/).forEach((tok) => {
      const m = tok.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
      if (m) out.push(`${m[1]}/${m[2]}`);
    });
    return [...new Set(out)];
  }

  // 拍子の並び順: 分母昇順 → 分子昇順 ("3/4" → [4,3])
  function compareMeters(a, b) {
    const [na, da] = a.split("/").map(Number);
    const [nb, db] = b.split("/").map(Number);
    return da - db || na - nb;
  }

  // 拍子の分母（音価の細かさ）で色分けクラスを返す。
  // 分母が大きいほど分割が細かく、難易度の目安も上がる。
  function meterClass(meter) {
    const den = parseInt(String(meter).split("/")[1], 10);
    if (den <= 4) return "m-d4";    // /2・/4 … 粗い（易）
    if (den === 8) return "m-d8";   // /8 … 中
    if (den === 16) return "m-d16"; // /16 … 細かい（難）
    if (den >= 32) return "m-d32";  // /32〜 … 極細（激）
    return "m-d8";
  }

  /* --------------------------------------------------------
   *  難易度の数値化（★の数 / 数字 / DIFFICULTY_ORDER）
   * -------------------------------------------------------- */
  function difficultyRank(raw) {
    if (!raw) return 999;
    const s = String(raw).trim();
    const full = (s.match(/★/g) || []).length;   // ★ の数 = 1,2,3...
    const empty = (s.match(/☆/g) || []).length;   // ☆ は ★ より下
    if (full > 0) return full;
    if (empty > 0) return 0.5;                     // ☆ → ★(1) より小さい
    const num = s.match(/\d+(\.\d+)?/);
    if (num) return parseFloat(num[0]);
    const idx = ODD_METER_CONFIG.DIFFICULTY_ORDER.indexOf(s);
    if (idx >= 0) return idx + 1;
    return 500; // 未知ラベルは後ろへ
  }

  // 難易度が実際に付いているか（「なし」「空欄」「未知ラベル」は false）
  // 実難易度: ☆=0.5, ★=1〜, 数値, DIFFICULTY_ORDER(1〜) → rank は 100 未満
  function hasDifficulty(d) { return d.difficultyRank < 100; }

  // 難易度ソート用: 難易度ありを前、なしを後ろに固定する比較（同区分は0）
  function cmpHasDiff(a, b) {
    const ah = hasDifficulty(a), bh = hasDifficulty(b);
    if (ah === bh) return 0;
    return ah ? -1 : 1;
  }

  /* --------------------------------------------------------
   *  データ正規化
   * -------------------------------------------------------- */
  function normalize(rows, cols) {
    return rows
      .map((row, i) => {
        // cols[k] は空文字の列名もあり得るため undefined 判定にする
        const get = (k) =>
          (cols[k] != null ? (row[cols[k]] || "").toString().trim() : "");
        const title = get("title");
        const link = get("link");
        // 曲名もリンクも無い行は除外
        if (!title && !link) return null;
        const notes = get("notes");
        // 拍子は「拍子タグ」列のみを参照（備考からの自動抽出はしない）
        // 分母昇順→分子昇順で並べておく
        const meters = parseMeterCell(get("meter")).sort(compareMeters);
        return {
          id: i,
          title: title || "(無題)",
          artist: get("artist"),
          difficulty: get("difficulty"),
          difficultyRank: difficultyRank(get("difficulty")),
          notes,
          link,
          ytId: extractYouTubeId(link),
          meters,
        };
      })
      .filter(Boolean);
  }

  /* --------------------------------------------------------
   *  データ取得
   * -------------------------------------------------------- */
  async function loadData() {
    const url = ODD_METER_CONFIG.SHEET_CSV_URL;
    if (url && url.trim()) {
      try {
        setStatus("loading", "スプレッドシート取得中…");
        const csv = await fetch(url, { redirect: "follow" }).then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        });
        const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
        const cols = resolveColumns(parsed.meta.fields || [], parsed.data);
        if (!cols.title && !cols.link) throw new Error("列が見つかりません");
        const data = normalize(parsed.data, cols);
        setStatus("live", `ライブ接続 · ${data.length}曲`);
        return data;
      } catch (err) {
        console.warn("スプシ取得に失敗。サンプルデータで表示します:", err);
        setStatus("sample", "サンプル表示（接続失敗）");
        return normalize(ODD_METER_SAMPLE, resolveColumns(Object.keys(ODD_METER_SAMPLE[0])));
      }
    }
    setStatus("sample", "サンプルデータ表示中");
    return normalize(ODD_METER_SAMPLE, resolveColumns(Object.keys(ODD_METER_SAMPLE[0])));
  }

  function setStatus(kind, label) {
    const wrap = $("#dataStatus");
    if (!wrap) return;
    wrap.dataset.kind = kind;
    wrap.querySelector(".status-label").textContent = label;
  }

  /* --------------------------------------------------------
   *  統計の算出と描画
   * -------------------------------------------------------- */
  function renderStats() {
    const data = state.raw;
    $("#statTotal").textContent = data.length;
    const artists = new Set(data.map((d) => d.artist).filter(Boolean));
    $("#statArtists").textContent = artists.size;

    // 拍子カウント
    const meterCount = {};
    data.forEach((d) => d.meters.forEach((m) => (meterCount[m] = (meterCount[m] || 0) + 1)));
    const exclude = ODD_METER_CONFIG.DISTRIBUTION_EXCLUDE || [];
    const meterEntries = Object.entries(meterCount)
      .filter(([m]) => !exclude.includes(m))   // 4/4 など土台拍子を分布から除外
      .sort((a, b) => b[1] - a[1]);
    $("#statMeters").textContent = meterEntries.length;

    // ミニ棒グラフ（上位8つ）
    const barsWrap = $("#meterBars");
    barsWrap.innerHTML = "";
    const max = meterEntries.length ? meterEntries[0][1] : 1;
    meterEntries.slice(0, 8).forEach(([meter, count], i) => {
      const bar = el("div", "bar-row");
      bar.innerHTML = `
        <span class="bar-key">${meter}</span>
        <span class="bar-track"><span class="bar-fill" style="width:0%"></span></span>
        <span class="bar-val">${count}</span>`;
      barsWrap.appendChild(bar);
      requestAnimationFrame(() => {
        setTimeout(() => {
          bar.querySelector(".bar-fill").style.width = (count / max) * 100 + "%";
        }, 60 * i);
      });
    });
    if (meterEntries.length) {
      $("#topMeterHint").textContent = `最多: ${meterEntries[0][0]}`;
    }
  }

  /* --------------------------------------------------------
   *  フィルタチップ生成
   * -------------------------------------------------------- */
  function renderChips() {
    // 拍子チップ（分母昇順→分子昇順、分母ごとに改行）
    const meterSet = new Set();
    state.raw.forEach((d) => d.meters.forEach((m) => meterSet.add(m)));
    const meters = [...meterSet].sort(compareMeters);

    const meterWrap = $("#meterChips");
    meterWrap.innerHTML = "";
    let prevDen = null;
    meters.forEach((m) => {
      const den = parseInt(m.split("/")[1], 10);
      // 分母が変わったら改行（先頭以外）
      if (prevDen !== null && den !== prevDen) {
        meterWrap.appendChild(el("span", "chip-break"));
      }
      prevDen = den;
      const chip = el("button", "chip");
      chip.textContent = m;
      chip.dataset.meter = m;
      chip.onclick = () => toggleSet(state.activeMeters, m, chip);
      meterWrap.appendChild(chip);
    });
    if (!meters.length) meterWrap.innerHTML = '<span class="chip-empty">拍子情報なし</span>';

    // 難易度チップ（rank順）
    // 難易度チップ（「なし」は除外、☆→★★★★★ の順）
    const diffs = [...new Set(state.raw.map((d) => d.difficulty).filter(Boolean))]
      .filter((d) => d !== "なし")
      .sort((a, b) => difficultyRank(a) - difficultyRank(b));
    const diffWrap = $("#difficultyChips");
    diffWrap.innerHTML = "";
    diffs.forEach((d) => {
      const chip = el("button", "chip");
      chip.textContent = d;
      chip.dataset.diff = d;
      chip.onclick = () => toggleSet(state.activeDifficulties, d, chip);
      diffWrap.appendChild(chip);
    });
    if (!diffs.length) diffWrap.innerHTML = '<span class="chip-empty">難易度情報なし</span>';
  }

  function toggleSet(set, value, chip) {
    if (set.has(value)) { set.delete(value); chip.classList.remove("active"); }
    else { set.add(value); chip.classList.add("active"); }
    applyFilters();
  }

  /* --------------------------------------------------------
   *  アーティスト一覧（サイドバー）
   * -------------------------------------------------------- */
  function getArtistCounts() {
    const map = new Map();
    state.raw.forEach((d) => {
      const a = d.artist;
      if (!a) return;           // アーティスト名が空白の曲はカウントしない
      map.set(a, (map.get(a) || 0) + 1);
    });
    const entries = [...map.entries()];
    // 並び替え: 曲数順（同数は名前順）/ 名前順
    if (state.artistSort === "name") {
      entries.sort((a, b) => a[0].localeCompare(b[0], "ja"));
    } else {
      entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"));
    }
    return entries;
  }

  function renderArtists() {
    const wrap = $("#artistList");
    if (!wrap) return;
    const all = getArtistCounts();
    $("#artistTotal").textContent = all.length;

    const q = state.artistQuery.toLowerCase();
    const list = q ? all.filter(([a]) => a.toLowerCase().includes(q)) : all;

    wrap.innerHTML = "";
    if (!list.length) {
      wrap.innerHTML = '<p class="artist-empty">該当なし</p>';
      return;
    }
    const frag = document.createDocumentFragment();
    list.forEach(([artist, count]) => {
      const item = el("button", "artist-item" + (state.activeArtist === artist ? " active" : ""));
      item.innerHTML = `<span class="artist-name">${escapeHtml(artist)}</span><span class="artist-count">${count}</span>`;
      item.onclick = () => selectArtist(artist);
      frag.appendChild(item);
    });
    wrap.appendChild(frag);
  }

  function selectArtist(artist) {
    // 同じものを再クリックで解除
    state.activeArtist = state.activeArtist === artist ? null : artist;
    renderArtists();
    applyFilters();
    // グリッド先頭へスクロール
    const grid = $("#cardGrid");
    if (grid && state.activeArtist) grid.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* --------------------------------------------------------
   *  フィルタ適用
   * -------------------------------------------------------- */
  function applyFilters() {
    const q = state.search.toLowerCase();
    let list = state.raw.filter((d) => {
      if (q) {
        const hay = `${d.title} ${d.artist} ${d.notes} ${d.meters.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (state.activeMeters.size) {
        const sel = [...state.activeMeters];
        const ok = state.meterMode === "and"
          ? sel.every((m) => d.meters.includes(m))   // すべて含む
          : sel.some((m) => d.meters.includes(m));    // いずれか含む
        if (!ok) return false;
      }
      if (state.activeDifficulties.size && !state.activeDifficulties.has(d.difficulty)) return false;
      if (state.activeArtist && d.artist !== state.activeArtist) return false;
      return true;
    });

    switch (state.sort) {
      case "title": list.sort((a, b) => a.title.localeCompare(b.title, "ja")); break;
      case "artist": list.sort((a, b) => (a.artist || "").localeCompare(b.artist || "", "ja")); break;
      // 難易度ソート: 「なし」(難易度未設定)は方向に関わらず常に後ろ
      case "difficulty-asc": list.sort((a, b) =>
        cmpHasDiff(a, b) || (a.difficultyRank - b.difficultyRank)); break;
      case "difficulty-desc": list.sort((a, b) =>
        cmpHasDiff(a, b) || (b.difficultyRank - a.difficultyRank)); break;
    }

    state.filtered = list;
    renderGrid();
    updateResultBar();
  }

  function updateResultBar() {
    const n = state.filtered.length;
    const total = state.raw.length;
    $("#resultCount").textContent =
      n === total ? `全 ${total} 曲` : `${n} 曲を表示中 / 全 ${total} 曲`;
    const anyFilter =
      state.search || state.activeMeters.size || state.activeDifficulties.size || state.activeArtist;
    $("#clearFilters").hidden = !anyFilter;
  }

  /* --------------------------------------------------------
   *  カードグリッド描画
   * -------------------------------------------------------- */
  function renderGrid() {
    const grid = $("#cardGrid");
    grid.innerHTML = "";
    const empty = $("#emptyState");

    if (!state.filtered.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const frag = document.createDocumentFragment();
    state.filtered.forEach((d, i) => {
      frag.appendChild(buildCard(d, i));
    });
    grid.appendChild(frag);
  }

  function thumbUrl(ytId) {
    return ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null;
  }

  function buildCard(d, i) {
    const card = el("article", "card glass");
    card.style.animationDelay = Math.min(i * 28, 600) + "ms";

    const thumb = thumbUrl(d.ytId);
    const meterTags = d.meters
      .map((m) => `<span class="tag ${meterClass(m)}">${m}</span>`)
      .join("");

    card.innerHTML = `
      <div class="card-thumb">
        ${thumb
          ? `<img src="${thumb}" alt="${escapeHtml(d.title)}" loading="lazy"
                  onerror="this.parentNode.classList.add('no-thumb')" />`
          : ""}
        <div class="thumb-fallback"><span>${escapeHtml(initials(d.title))}</span></div>
        <div class="play-badge"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z"/></svg></div>
        ${d.difficulty ? `<span class="card-diff">${escapeHtml(d.difficulty)}</span>` : ""}
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(d.title)}</h3>
        <p class="card-artist">${escapeHtml(d.artist || "Unknown Artist")}</p>
        <span class="card-diff-inline">${d.difficulty && d.difficulty !== "なし" ? escapeHtml(d.difficulty) : ""}</span>
        <div class="card-tags">${meterTags || '<span class="tag tag-muted">拍子未分類</span>'}</div>
      </div>`;

    card.onclick = () => openModal(d);
    return card;
  }

  /* --------------------------------------------------------
   *  詳細モーダル
   * -------------------------------------------------------- */
  function openModal(d) {
    const body = $("#modalBody");
    const meterTags = d.meters
      .map((m) => `<span class="tag ${meterClass(m)}">${m}</span>`)
      .join("");

    body.innerHTML = `
      <div class="modal-media">
        ${d.ytId
          ? `<iframe src="https://www.youtube.com/embed/${d.ytId}?rel=0"
                title="${escapeHtml(d.title)}" frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>`
          : `<div class="modal-noembed">▶ 埋め込み動画なし</div>`}
      </div>
      <div class="modal-info">
        <h2 class="modal-title">${escapeHtml(d.title)}</h2>
        <p class="modal-artist">${escapeHtml(d.artist || "Unknown Artist")}</p>
        <div class="modal-meta">
          ${d.difficulty ? `<span class="meta-pill">難易度 · ${escapeHtml(d.difficulty)}</span>` : ""}
          ${meterTags}
        </div>
        ${d.notes ? `<div class="modal-notes"><span class="notes-label">備考</span><p>${escapeHtml(d.notes)}</p></div>` : ""}
        ${d.link ? `<a class="watch-btn" href="${escapeAttr(d.link)}" target="_blank" rel="noopener">
            YouTubeで開く
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
          </a>` : ""}
      </div>`;

    const modal = $("#modal");
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("open"));
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = $("#modal");
    modal.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => {
      modal.hidden = true;
      $("#modalBody").innerHTML = ""; // iframe停止
    }, 250);
  }

  /* --------------------------------------------------------
   *  ユーティリティ
   * -------------------------------------------------------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
  function initials(title) {
    const t = title.trim();
    return t ? t.slice(0, 2).toUpperCase() : "♪";
  }

  function clearAll() {
    state.search = "";
    state.activeMeters.clear();
    state.activeDifficulties.clear();
    state.meterMode = "or";
    state.activeArtist = null;
    $("#searchInput").value = "";
    document.querySelectorAll(".chip.active").forEach((c) => c.classList.remove("active"));
    document.querySelectorAll("#meterMode .mode-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === "or"));
    renderArtists();
    applyFilters();
  }

  /* --------------------------------------------------------
   *  テーマ
   * -------------------------------------------------------- */
  function initTheme() {
    const saved = localStorage.getItem("oddmeter-theme");
    if (saved) document.documentElement.dataset.theme = saved;
    $("#themeToggle").onclick = () => {
      const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = cur;
      localStorage.setItem("oddmeter-theme", cur);
    };
  }

  /* --------------------------------------------------------
   *  表示切替（グリッド / リスト）
   * -------------------------------------------------------- */
  function initView() {
    const saved = localStorage.getItem("oddmeter-view") || "grid";
    document.documentElement.dataset.view = saved;
    const btn = $("#viewToggle");
    if (!btn) return;
    btn.onclick = () => {
      const cur = document.documentElement.dataset.view === "list" ? "grid" : "list";
      document.documentElement.dataset.view = cur;
      localStorage.setItem("oddmeter-view", cur);
    };
  }

  /* --------------------------------------------------------
   *  イベント結線
   * -------------------------------------------------------- */
  function bindEvents() {
    let t;
    $("#searchInput").addEventListener("input", (e) => {
      clearTimeout(t);
      t = setTimeout(() => { state.search = e.target.value.trim(); applyFilters(); }, 120);
    });
    $("#sortSelect").addEventListener("change", (e) => { state.sort = e.target.value; applyFilters(); });
    $("#clearFilters").addEventListener("click", clearAll);

    // 拍子フィルタの OR / AND 切替
    $("#meterMode").addEventListener("click", (e) => {
      const btn = e.target.closest(".mode-btn");
      if (!btn) return;
      state.meterMode = btn.dataset.mode;
      $("#meterMode").querySelectorAll(".mode-btn").forEach((b) =>
        b.classList.toggle("active", b === btn));
      applyFilters();
    });
    // サイドバー内のアーティスト絞り込み
    const artistSearch = $("#artistSearch");
    if (artistSearch) {
      let at;
      artistSearch.addEventListener("input", (e) => {
        clearTimeout(at);
        at = setTimeout(() => { state.artistQuery = e.target.value.trim(); renderArtists(); }, 100);
      });
    }
    // アーティスト一覧の並び替え（曲数順 / 名前順）
    const artistSort = $("#artistSort");
    if (artistSort) {
      artistSort.addEventListener("click", (e) => {
        const btn = e.target.closest(".asort-btn");
        if (!btn) return;
        state.artistSort = btn.dataset.sort;
        artistSort.querySelectorAll(".asort-btn").forEach((b) =>
          b.classList.toggle("active", b === btn));
        renderArtists();
      });
    }

    // モバイル: サイドバー開閉
    const sbToggle = $("#sidebarToggle");
    if (sbToggle) {
      sbToggle.addEventListener("click", () =>
        document.querySelector("#sidebar").classList.toggle("open"));
    }

    $("#modalClose").addEventListener("click", closeModal);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        $("#searchInput").focus();
      }
    });
  }

  /* --------------------------------------------------------
   *  起動
   * -------------------------------------------------------- */
  async function init() {
    initTheme();
    initView();
    bindEvents();
    state.raw = await loadData();
    renderStats();
    renderChips();
    renderArtists();
    applyFilters();
  }

  document.addEventListener("DOMContentLoaded", init);

  // 外部公開
  return { clearAll };
})();
