/* ============================================================
 * 董宇辉最经典语录100句 · 阅读小工具
 * 基于「知行学习包」脚手架：保留错误兜底、状态版本化、SW 离线机制与水墨配色。
 * 语录为长句，故只做「翻阅 / 搜索 / 收藏 / 听读」，不设背诵与自测。
 * ============================================================ */
try { (function () {
  "use strict";

  /* ---------------- 错误兜底（脚手架保留） ---------------- */
  window.showFatal = function (msg) {
    var v = document.getElementById("view");
    if (!v) return;
    v.innerHTML = '<div class="empty" style="text-align:left;padding:20px;">' +
      '<div style="font-size:18px;margin-bottom:10px;">页面出错了</div>' +
      '<pre style="background:#f8f0e8;padding:10px;border-radius:6px;overflow:auto;max-height:60vh;font-size:13px;line-height:1.5;color:#522;">' +
      String(msg).replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>' +
      '<div style="margin-top:10px;">请截图此页，或尝试<a href="javascript:void(0)" onclick="localStorage.clear();location.reload()" style="color:#a33;text-decoration:underline;">清空本机数据并刷新</a>。</div></div>';
  };
  window.addEventListener("error", function (ev) {
    var detail = (ev.message || ev.error && ev.error.message || "Script error");
    if (ev.filename) detail += "\n文件: " + ev.filename + " 行:" + ev.lineno + " 列:" + ev.colno;
    if (ev.error && ev.error.stack) detail += "\n堆栈:\n" + ev.error.stack;
    showFatal(detail);
  });
  window.addEventListener("unhandledrejection", function (ev) {
    showFatal("未处理的 Promise 错误:\n" + (ev.reason && ev.reason.stack || ev.reason || ""));
  });
  setTimeout(function () {
    var v = document.getElementById("view");
    if (!v) return;
    var txt = v.innerText || v.textContent || "";
    if (txt.trim()) return;
    v.innerHTML = '<div class="empty">主区域暂无内容。<br>' +
      'ENTRIES=' + (window.ENTRIES ? window.ENTRIES.length : "未加载") +
      ', COLLECTIONS=' + (window.COLLECTIONS ? window.COLLECTIONS.length : "未加载") +
      '<br>请刷新页面；若本地 file:// 打开，可尝试用浏览器“打开文件”或部署到线上访问。</div>';
  }, 1000);

  /* ---------------- 常量与数据 ---------------- */
  // ★数据版本：源文稿一旦增删/重排，id↔句子映射就变了，必须把 DATA_REV +1 换键，
  // 否则旧收藏会串到别的句子上。旧键数据保留不删，自然归档。
  var DATA_REV = 1;
  var STORE_KEY = "dyh100_state_v" + DATA_REV;
  var LIB_PAGE_SIZE = 12;   // 长句，每页少放几条
  var CN = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

  var ENTRIES = window.ENTRIES || [];
  var COLLECTIONS = window.COLLECTIONS || [];
  var BY_ID = {};
  ENTRIES.forEach(function (e) { BY_ID[e.id] = e; });

  // 分类 → 卷首图（直接取数据里的 vol，避免手写映射与分类名对不上）
  var CAT_VOL = {};
  var CHAPTERS = [];
  var chapSeen = {};
  ENTRIES.forEach(function (e) {
    CAT_VOL[e.category] = e.vol;
    if (!chapSeen[e.chapter]) {
      chapSeen[e.chapter] = { chapter: e.chapter, name: e.category, count: 0 };
      CHAPTERS.push(chapSeen[e.chapter]);
    }
    chapSeen[e.chapter].count++;
  });

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function chapLabel(e) { return "第" + CN[e.chapter - 1] + "篇 · " + e.category; }

  /* ---------------- API 抽象层（全栈预留） ---------------- */
  var api = {
    getEntries: function () { return ENTRIES; },
    loadState: loadState,
    saveState: saveState
  };

  /* ---------------- 状态（localStorage） ---------------- */
  function defaultState() {
    return { favorites: [], lastView: "lib" };
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (!s || typeof s !== "object" || Array.isArray(s)) return defaultState();
      if (!Array.isArray(s.favorites)) s.favorites = [];
      // 过滤掉已不存在的句子 id
      s.favorites = s.favorites.filter(function (id) { return !!BY_ID[id]; });
      if (typeof s.lastView !== "string") s.lastView = "lib";
      return s;
    } catch (e) { return defaultState(); }
  }
  function saveState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
    catch (e) { /* file:// 或隐私模式下 localStorage 可能不可用，静默降级为内存态 */ }
  }
  var state = api.loadState();

  function toggleFav(id) {
    var i = state.favorites.indexOf(id);
    if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(id);
    saveState(state);
  }

  /* ---------------- 朗读（浏览器语音，无需音频文件） ---------------- */
  var _zhVoice = null;
  function pickZhVoice() {
    if (!("speechSynthesis" in window)) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    var zh = vs.filter(function (v) { return /zh|chinese/i.test(v.lang); });
    if (!zh.length) return null;
    var m = zh.filter(function (v) { return /yunyang|male|男|晓|云|yang/i.test(v.name); });
    return m[0] || zh[0];
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = function () { _zhVoice = pickZhVoice(); };
  }
  function showToast(msg, ms) {
    try {
      var t = document.getElementById("__toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "__toast";
        t.style.cssText = "position:fixed;left:50%;bottom:86px;transform:translateX(-50%);max-width:86%;background:rgba(0,0,0,.82);color:#fff;font-size:13px;line-height:1.5;padding:9px 14px;border-radius:10px;z-index:9999;pointer-events:none;opacity:0;transition:opacity .2s;text-align:center;";
        document.body.appendChild(t);
      }
      t.textContent = msg; t.style.opacity = "1";
      clearTimeout(t._t); t._t = setTimeout(function () { t.style.opacity = "0"; }, ms || 2600);
    } catch (e) {}
  }
  function stopSpeak() {
    if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }
  function speak(text, btn) {
    stopSpeak();
    if (!("speechSynthesis" in window)) {
      showToast("当前浏览器不支持朗读，可换用系统浏览器打开");
      return;
    }
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN"; u.rate = 0.9; u.pitch = 1.0;
      var v = _zhVoice || pickZhVoice();
      if (v) u.voice = v;
      if (btn) btn.textContent = "♪ 朗读中…";
      var restore = function () { if (btn) btn.textContent = "🔊 听这句"; };
      u.onend = restore;
      u.onerror = function () { restore(); showToast("朗读未成功，建议在浏览器中打开"); };
      window.speechSynthesis.speak(u);
    } catch (e) {
      showToast("朗读未成功，建议在浏览器中打开");
    }
  }

  /* ---------------- 渲染框架 ---------------- */
  var view = document.getElementById("view");
  var tabs = document.querySelectorAll(".tab");
  var TABS = ["lib", "fav", "about"];

  function setTab(name) {
    if (TABS.indexOf(name) < 0) name = "lib";
    tabs.forEach(function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    if (state.lastView !== name) { state.lastView = name; saveState(state); }
    stopSpeak();
    if (name === "lib") renderLib();
    else if (name === "fav") renderFav();
    else renderAbout();
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { setTab(t.dataset.tab); });
  });

  /* ---------------- 语录 ---------------- */
  var libPage = 1, libCat = "all", libQ = "";

  function libFiltered() {
    var q = libQ.trim();
    return api.getEntries().filter(function (e) {
      if (libCat !== "all" && e.category !== libCat) return false;
      if (q && e.term.indexOf(q) < 0 && e.category.indexOf(q) < 0) return false;
      return true;
    });
  }

  function quoteCard(e, withRemove) {
    var fav = state.favorites.indexOf(e.id) >= 0;
    var h = "";
    h += "<div class='item quote-item'>";
    h += "<span class='lib-fav" + (fav ? " on" : "") + "' data-id='" + e.id + "'>" + (fav ? "★" : "☆") + "</span>";
    h += "<div class='q-head'><span class='q-no'>" + e.id + "、</span><span class='q-cat'>" + esc(chapLabel(e)) + "</span></div>";
    h += "<div class='q-text'>" + esc(e.term) + "</div>";
    h += "<div class='q-foot'>";
    h += "<button class='q-speak' data-id='" + e.id + "'>🔊 听这句</button>";
    if (withRemove) h += "<button class='q-remove' data-id='" + e.id + "'>移除收藏</button>";
    h += "</div></div>";
    return h;
  }

  // 列表 + 分页（输入框不在这段里，搜索时只刷新这一段，避免光标丢失）
  function listHtml() {
    var list = libFiltered();
    var pages = Math.max(1, Math.ceil(list.length / LIB_PAGE_SIZE));
    if (libPage > pages) libPage = pages;
    var start = (libPage - 1) * LIB_PAGE_SIZE;
    var slice = list.slice(start, start + LIB_PAGE_SIZE);
    var h = "";
    h += '<div class="progress">共 ' + list.length + " 句 · 第 " + libPage + " / " + pages + " 页</div>";
    h += "<div class='list'>";
    if (!slice.length) h += "<div class='empty'>没有找到相关的句子</div>";
    slice.forEach(function (e) { h += quoteCard(e, false); });
    h += "</div>";
    if (pages > 1) {
      h += '<div class="lib-pager">';
      h += '<button class="btn btn-ghost" id="libPrev"' + (libPage <= 1 ? " disabled" : "") + ">‹ 上一页</button>";
      h += '<span class="lib-pageinfo">' + libPage + " / " + pages + "</span>";
      h += '<button class="btn btn-ghost" id="libNext"' + (libPage >= pages ? " disabled" : "") + ">下一页 ›</button>";
      h += "</div>";
    }
    return h;
  }

  function bindListEvents() {
    view.querySelectorAll(".lib-fav").forEach(function (b) {
      b.onclick = function () {
        var id = parseInt(b.dataset.id, 10);
        toggleFav(id);
        if (view.dataset.tab === "fav") renderFav(); else refreshList();
      };
    });
    view.querySelectorAll(".q-speak").forEach(function (b) {
      b.onclick = function () {
        var e = BY_ID[parseInt(b.dataset.id, 10)];
        if (e) speak(e.term, b);
      };
    });
    view.querySelectorAll(".q-remove").forEach(function (b) {
      b.onclick = function () {
        var id = parseInt(b.dataset.id, 10);
        toggleFav(id); renderFav();
      };
    });
    var pv = document.getElementById("libPrev"), nx = document.getElementById("libNext");
    if (pv) pv.onclick = function () { if (libPage > 1) { libPage--; refreshList(); window.scrollTo(0, 0); } };
    if (nx) nx.onclick = function () { libPage++; refreshList(); window.scrollTo(0, 0); };
  }

  function refreshList() {
    var wrap = document.getElementById("libListWrap");
    if (!wrap) { renderLib(); return; }
    wrap.innerHTML = listHtml();
    bindListEvents();
  }

  function renderLib() {
    view.dataset.tab = "lib";
    var h = "";
    h += '<div class="lib-banner"><img src="assets/cover.jpg" alt="董宇辉最经典语录100句" /></div>';
    h += '<div class="lib-search"><input id="libQ" placeholder="搜一句话，或搜篇名…" value="' + esc(libQ) + '" /></div>';
    h += '<div class="lib-cats" id="libCats">';
    h += '<span class="lib-cat' + (libCat === "all" ? " on" : "") + '" data-c="all">全部</span>';
    CHAPTERS.forEach(function (c) {
      h += '<span class="lib-cat' + (libCat === c.name ? " on" : "") + '" data-c="' + esc(c.name) + '">' + esc(c.name) + "</span>";
    });
    h += "</div>";
    if (libCat !== "all" && CAT_VOL[libCat]) {
      h += '<div class="lib-vol"><img src="assets/' + CAT_VOL[libCat] + '" alt="' + esc(libCat) + '" /></div>';
    }
    h += '<div id="libListWrap">' + listHtml() + "</div>";
    view.innerHTML = h;

    document.getElementById("libQ").addEventListener("input", function () {
      libQ = this.value; libPage = 1; refreshList();
    });
    view.querySelectorAll(".lib-cat").forEach(function (b) {
      b.onclick = function () { libCat = b.dataset.c; libPage = 1; renderLib(); };
    });
    bindListEvents();
  }

  /* ---------------- 收藏 ---------------- */
  function renderFav() {
    view.dataset.tab = "fav";
    if (!state.favorites.length) {
      view.innerHTML = '<div class="empty">还没有收藏。<br>读到喜欢的句子，点右上角 ☆ 就能存到这里。</div>';
      return;
    }
    var h = '<div class="progress">我的收藏 · 共 ' + state.favorites.length + " 句</div><div class='list'>";
    state.favorites.forEach(function (id) {
      var e = BY_ID[id];
      if (e) h += quoteCard(e, true);
    });
    h += "</div>";
    view.innerHTML = h;
    bindListEvents();
  }

  /* ---------------- 关于 ---------------- */
  function renderAbout() {
    view.dataset.tab = "about";
    var h = "";
    h += '<div class="progress">关于本书</div>';
    h += '<div class="about-card">';
    h += '<div class="about-title">董宇辉最经典语录 100 句</div>';
    h += '<p>一百句广为流传的话语，按九个题目编为九篇。随手翻读，不必从头看起；遇到喜欢的，收进收藏里。</p>';
    h += '<p>愿你翻到某一页时，恰好有一句话，接住此刻的自己。</p>';
    h += "</div>";

    h += '<div class="progress">九 篇</div>';
    h += '<div class="chap-list">';
    CHAPTERS.forEach(function (c) {
      h += '<div class="chap-row"><span class="chap-no">第' + CN[c.chapter - 1] + '篇</span>' +
           '<span class="chap-name">' + esc(c.name) + '</span>' +
           '<span class="chap-count">' + c.count + ' 句</span></div>';
    });
    h += "</div>";

    h += '<div class="progress">说 明</div>';
    h += '<div class="about-card about-note">';
    h += '<p>本书为编者据公开资料整理的学习摘录，非官方出版物，与本人及其所属机构无关联，亦未经授权或背书。书名中的人名，仅用于指明这些话语的流传所自。</p>';
    h += '<p>所录语句多来自公开报道、直播讲述与网络流传文字。坊间转录常有增删，其中仍有部分仅见于流传、未见原始出处；引用时宜自行复核。</p>';
    h += '<p>本书仅供个人阅读与学习参考，请勿翻印、转售或用于公开商业宣传。</p>';
    h += "</div>";

    h += '<div class="card-actions" style="margin-top:18px">';
    h += '<button class="btn btn-ghost" id="resetBtn">清空收藏</button>';
    h += "</div>";
    h += '<div class="about-foot">壹页格物 · 编　|　二〇二六年</div>';
    view.innerHTML = h;

    document.getElementById("resetBtn").onclick = function () {
      if (confirm("确定清空本机收藏吗？")) {
        state = defaultState(); saveState(state); renderAbout();
        showToast("收藏已清空");
      }
    };
  }

  /* ---------------- 启动 ---------------- */
  try {
    if (!ENTRIES.length) {
      view.innerHTML = '<div class="empty">数据未加载。<br>请确认 data.js 与 index.html 在同一目录，并刷新页面。</div>';
    } else {
      setTab(state.lastView || "lib");
    }
  } catch (e) {
    window.showFatal("启动渲染失败:\n" + (e && e.stack || e));
  }
})(); } catch (e) {
  if (window.showFatal) window.showFatal("应用启动失败:\n" + (e && e.stack || e));
  else {
    var _v = document.getElementById("view");
    if (_v) _v.innerHTML = '<div class="empty">应用启动失败，请刷新或清空本机数据。<br><pre>' +
      String(e && e.stack || e).replace(/</g, '&lt;') + '</pre></div>';
  }
}
