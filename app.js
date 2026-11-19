/* Renders the page from data/stats.json (or the identical data/stats.js
   payload in window.SITE_STATS, which works from file:// too). */
(function () {
  'use strict';

  var LANG_COLORS = {
    'C#': '#178600', 'TypeScript': '#3178c6', 'JavaScript': '#c9a227',
    'PHP': '#4f5d95', 'T-SQL': '#e38c00', 'C++': '#d1517a', 'C': '#6b7280',
    'C/C++ Header': '#8a8f98', 'Kotlin': '#7f52ff', 'Python': '#3572a5',
    'HTML': '#e34c26', 'CSS': '#663399', 'SCSS': '#c6538c', 'XAML': '#2c7d8c',
    'Razor': '#5b8c5a', 'Shell': '#5da244', 'PowerShell': '#2b4a77',
    'Batch': '#8a8f3a', 'Java': '#b07219', 'Go': '#00add8', 'Rust': '#dea584',
    'Swift': '#f05138', 'Ruby': '#701516'
  };
  var FEATURED_ORDER = ['durable-execution-dotnet', 'redis-csharp',
    'lsm-storage-engine', 'memcached-csharp', 'eso-agent'];
  var DISPLAY_NAME = { 'eso-agent': 'EsoAgent' };
  var SUBSITE = { 'eso-agent': 'https://seneso.github.io/eso-agent/' };

  function fmt(n) { return n == null ? '—' : n.toLocaleString('en-US'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function monthLabel(ym) {
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var p = ym.split('-');
    return names[parseInt(p[1], 10) - 1] + ' ’' + p[0].slice(2);
  }
  function updatedLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }

  function badge(p) {
    return p.visibility === 'Private'
      ? '<span class="badge badge--private">Private</span>'
      : '<span class="badge badge--public">Public</span>';
  }

  function langMix(p) {
    if (!p.topLanguages || !p.topLanguages.length || !p.codeLines) return '';
    var total = p.topLanguages.reduce(function (a, l) { return a + l.lines; }, 0);
    var bars = p.topLanguages.map(function (l) {
      var w = Math.max(2, (l.lines / total) * 100);
      return '<span style="width:' + w + '%;background:' + (LANG_COLORS[l.name] || '#b6ab8e') + '" title="' + esc(l.name) + '"></span>';
    }).join('');
    var line = p.topLanguages.map(function (l) { return esc(l.name); }).join(' · ');
    return '<div class="fcard__langs" aria-hidden="true">' + bars + '</div>' +
           '<p class="fcard__langline">' + line + '</p>';
  }

  function featuredCard(p, i) {
    var name = DISPLAY_NAME[p.name] || p.name;
    var link = SUBSITE[p.name] || p.url;
    var chips = [];
    if (p.tests) chips.push('<span class="chip chip--gold">' + fmt(p.tests) + ' tests passing</span>');
    if (p.license) chips.push('<span class="chip">' + esc(p.license) + '</span>');
    if (p.codeLines != null) chips.push('<span class="chip">' + fmt(p.codeLines) + ' lines</span>');
    if (p.treeLines && p.codeLines != null && p.treeLines > p.codeLines * 1.2) chips.push('<span class="chip">Full project tree: ' + fmt(p.treeLines) + ' lines incl. bundled libraries &amp; data</span>');
    if (p.primaryLanguage) chips.push('<span class="chip chip--sage">' + esc(p.primaryLanguage) + '</span>');
    chips.push(badge(p));
    var cta = SUBSITE[p.name]
      ? '<a class="fcard__cta" href="' + link + '">Visit the EsoAgent site →</a>'
      : '<a class="fcard__cta" href="' + p.url + '" target="_blank" rel="noopener">View on GitHub →</a>';
    return '<article class="fcard reveal' + (p.name === 'eso-agent' ? ' fcard--wide' : '') + '">' +
      '<div class="fcard__top"><h3 class="fcard__name"><a href="' + link + '"' +
        (SUBSITE[p.name] ? '' : ' target="_blank" rel="noopener"') + '>' + esc(name) + '</a></h3>' +
        '<span class="fcard__no">№ ' + (i + 1) + '</span></div>' +
      '<p class="fcard__summary">' + esc(p.summary) + '</p>' +
      langMix(p) +
      '<div class="fcard__meta">' + chips.join('') + '</div>' + cta +
      '</article>';
  }

  function rowFor(p) {
    var name = DISPLAY_NAME[p.name] || p.name;
    var nameHtml = p.visibility === 'Private'
      ? esc(name)
      : '<a href="' + p.url + '" target="_blank" rel="noopener">' + esc(name) + '</a>';
    var meta = [];
    if (p.primaryLanguage) meta.push(esc(p.primaryLanguage));
    if (p.codeLines != null) meta.push(fmt(p.codeLines) + ' lines');
    if (p.treeLines && p.codeLines != null && p.treeLines > p.codeLines * 1.2) meta.push('full project tree ' + fmt(p.treeLines) + ' lines incl. bundled libraries & data');
    if (p.updatedAt) meta.push('upd. ' + updatedLabel(p.updatedAt));
    return '<div class="row reveal">' +
      '<div class="row__name">' + nameHtml + '</div>' +
      '<p class="row__summary">' + esc(p.summary || '—') + '</p>' +
      '<div class="row__meta"><span>' + meta.join(' · ') + '</span>' + badge(p) + '</div>' +
      '</div>';
  }

  function groupBlock(title, projects) {
    if (!projects.length) return '';
    return '<div class="group"><div class="group__head">' +
      '<h3 class="group__title">' + esc(title) + '</h3>' +
      '<span class="group__count">' + projects.length + '</span>' +
      '<span class="group__rule"></span></div>' +
      '<div class="rows">' + projects.map(rowFor).join('') + '</div></div>';
  }

  function renderMonthly(stats) {
    var board = document.getElementById('board');
    if (board) board.style.display = 'none';
    var fig = document.getElementById('monthly-chart');
    if (fig) fig.hidden = false;
    var byMonth = {};
    stats.activity.monthlyCommits.forEach(function (m) { byMonth[m.month] = m.commits; });
    var filled = [];
    if (stats.activity.firstMonth && stats.activity.lastMonth) {
      var cur = stats.activity.firstMonth.split('-').map(Number);
      var end = stats.activity.lastMonth.split('-').map(Number);
      while (cur[0] < end[0] || (cur[0] === end[0] && cur[1] <= end[1])) {
        var key = cur[0] + '-' + String(cur[1]).padStart(2, '0');
        filled.push({ month: key, commits: byMonth[key] || 0 });
        cur[1]++; if (cur[1] === 13) { cur[1] = 1; cur[0]++; }
      }
    }
    var months = filled.slice(-18);
    var max = Math.max.apply(null, months.map(function (m) { return m.commits; }).concat([1]));
    document.getElementById('chart').innerHTML = months.map(function (m) {
      var h = Math.max(2, (m.commits / max) * 100);
      return '<div class="chart__col" title="' + monthLabel(m.month) + ': ' + m.commits + ' commits">' +
        '<div class="chart__bar" style="height:' + h + '%"></div>' +
        '<span class="chart__label">' + monthLabel(m.month) + '</span></div>';
    }).join('');
    document.getElementById('chart-note').textContent =
      fmt(stats.activity.totalCommits) + ' commits counted from ' +
      monthLabel(stats.activity.firstMonth || '') + ' to ' +
      monthLabel(stats.activity.lastMonth || '') +
      ', across public repositories and local mirrors of the private ones.';
  }

  function renderBoard(stats) {
    var byDay = {};
    stats.activity.dailyCommits.forEach(function (d) { byDay[d.date] = d.commits; });

    function parseDay(s) {
      var p = s.split('-').map(Number);
      return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    }
    function dayKey(d) {
      return d.getUTCFullYear() + '-' +
        String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0');
    }
    function fmtDay(d) {
      return d.toLocaleDateString('en-GB',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /* window: the last year, ending today, starting on a Sunday */
    var now = new Date();
    var end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var lastDay = stats.activity.lastDay ? parseDay(stats.activity.lastDay) : null;
    if (lastDay && lastDay > end) end = lastDay;
    var start = new Date(end.getTime() - 364 * 86400000);
    start = new Date(start.getTime() - start.getUTCDay() * 86400000);
    var weeks = Math.round((end - start) / 86400000 / 7) + 1;

    /* level thresholds from the busiest day in the window */
    var max = 1, totalYear = 0, activeDays = 0;
    var probe = new Date(start);
    while (probe <= end) {
      var c0 = byDay[dayKey(probe)] || 0;
      if (c0 > max) max = c0;
      totalYear += c0;
      if (c0 > 0) activeDays++;
      probe = new Date(probe.getTime() + 86400000);
    }
    var t1 = Math.max(1, Math.ceil(max * 0.25));
    var t2 = Math.max(t1 + 1, Math.ceil(max * 0.5));
    var t3 = Math.max(t2 + 1, Math.ceil(max * 0.75));
    function level(c) {
      return c === 0 ? 0 : c <= t1 ? 1 : c <= t2 ? 2 : c <= t3 ? 3 : 4;
    }

    /* cells, column-major (weeks across, Sunday..Saturday down) + month labels */
    var cells = '', monthLabels = [], prevMonth = -1;
    for (var w = 0; w < weeks; w++) {
      var sunday = new Date(start.getTime() + w * 7 * 86400000);
      var mo = sunday.getUTCMonth();
      if (mo !== prevMonth) { monthLabels.push({ col: w, name: MONTHS[mo] }); prevMonth = mo; }
      for (var r = 0; r < 7; r++) {
        var day = new Date(sunday.getTime() + r * 86400000);
        if (day > end) { cells += '<i class="hm__cell hm__cell--future"></i>'; continue; }
        var c = byDay[dayKey(day)] || 0;
        var what = c === 0 ? 'No commits' : c === 1 ? '1 commit' : c + ' commits';
        cells += '<i class="hm__cell lg' + level(c) + '" title="' +
          what + ' on ' + fmtDay(day) + '"></i>';
      }
    }
    var monthsHtml = monthLabels.map(function (m) {
      return '<span class="hm__month" style="grid-column:' + (m.col + 1) + '">' + m.name + '</span>';
    }).join('');
    document.getElementById('heatmap').innerHTML =
      '<div class="hm__months" style="--weeks:' + weeks + '">' + monthsHtml + '</div>' +
      '<div class="hm__body">' +
        '<div class="hm__days" aria-hidden="true"><span></span><span>Mon</span><span></span>' +
          '<span>Wed</span><span></span><span>Fri</span><span></span></div>' +
        '<div class="hm__grid" role="img" aria-label="Contribution graph for the last year">' +
          cells + '</div>' +
      '</div>';

    /* streaks + busiest day across the full counted history */
    var longest = 0, run = 0, busiest = null;
    if (stats.activity.firstDay) {
      var d = parseDay(stats.activity.firstDay);
      while (d <= end) {
        var cc = byDay[dayKey(d)] || 0;
        run = cc > 0 ? run + 1 : 0;
        if (run > longest) longest = run;
        if (!busiest || cc > busiest.commits) busiest = { date: dayKey(d), commits: cc };
        d = new Date(d.getTime() + 86400000);
      }
    }

    document.getElementById('board-total').textContent = fmt(totalYear);
    document.getElementById('board-stats').innerHTML =
      '<span>Longest streak <strong>' + fmt(longest) + ' days</strong></span>' +
      '<span>Active days <strong>' + fmt(activeDays) + '</strong></span>' +
      (busiest && busiest.commits > 0
        ? '<span>Busiest day <strong>' + fmt(busiest.commits) + ' commits</strong> · ' +
          fmtDay(parseDay(busiest.date)) + '</span>' : '');
    document.getElementById('board-note').textContent =
      fmt(stats.activity.totalCommits) + ' commits counted from ' +
      (stats.activity.firstDay ? fmtDay(parseDay(stats.activity.firstDay)) : '—') + ' to ' +
      (stats.activity.lastDay ? fmtDay(parseDay(stats.activity.lastDay)) : '—') +
      ', across public repositories and local mirrors of the private ones.';

    /* on narrow screens the board scrolls sideways — start at the recent end */
    var scroller = document.getElementById('board-scroll');
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  }

  function render(stats) {
    /* stat band */
    document.querySelectorAll('[data-stat]').forEach(function (el) {
      var key = el.getAttribute('data-stat');
      if (stats.totals[key] == null) return; /* keep the static fallback value */
      el.textContent = fmt(stats.totals[key]);
    });
    var stamp = document.getElementById('updated-stamp');
    if (stamp && stats.generatedAt) {
      stamp.textContent = 'Last refreshed ' +
        new Date(stats.generatedAt).toLocaleDateString('en-GB',
          { day: 'numeric', month: 'long', year: 'numeric' }) + '.';
    }

    var byName = {};
    stats.projects.forEach(function (p) { byName[p.name] = p; });

    /* featured */
    var featured = FEATURED_ORDER.map(function (n) { return byName[n]; }).filter(Boolean);
    document.getElementById('featured').innerHTML =
      featured.map(featuredCard).join('');

    /* index groups */
    var rest = stats.projects.filter(function (p) {
      return FEATURED_ORDER.indexOf(p.name) === -1;
    });
    var sdks = rest.filter(function (p) {
      return /\.Net$/.test(p.name) ||
        ['sqlserver-query-toolbox', 'csharp-design-patterns',
         'aspnetcore-webapi-starter'].indexOf(p.name) !== -1;
    });
    var priv = rest.filter(function (p) { return p.group === 'private'; });
    var course = rest.filter(function (p) { return p.group === 'course'; });
    var used = {};
    sdks.concat(priv, course).forEach(function (p) { used[p.name] = 1; });
    var other = rest.filter(function (p) { return !used[p.name]; });
    var byUpdated = function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); };
    document.getElementById('index-groups').innerHTML =
      groupBlock('.NET SDKs & libraries', sdks.sort(byUpdated)) +
      groupBlock('Private projects', priv.sort(byUpdated)) +
      groupBlock('Applications & other work', other.sort(byUpdated)) +
      groupBlock('Coursework — Route Academy', course.sort(byUpdated));

    /* languages */
    var lt = document.getElementById('langtable');
    var maxPct = stats.languages.length ? stats.languages[0].pct : 0;
    lt.innerHTML = stats.languages.map(function (l) {
      return '<div class="langrow reveal">' +
        '<div class="langrow__name"><span class="langrow__dot" style="background:' +
          (LANG_COLORS[l.name] || '#b6ab8e') + '"></span>' + esc(l.name) + '</div>' +
        '<div class="langrow__bar"><div class="langrow__fill" style="width:' +
          Math.max(1.5, (l.pct / maxPct) * 100) + '%;background:' +
          (LANG_COLORS[l.name] || '#b6ab8e') + '"></div></div>' +
        '<div class="langrow__lines">' + fmt(l.lines) + '</div>' +
        '<div class="langrow__pct">' + l.pct.toFixed(1) + '%</div></div>';
    }).join('') +
      '<div class="langtable__total"><span>Total</span><span>' +
        fmt(stats.totals.codeLines) + ' lines</span></div>';

    /* open source — rendered live from the fetched merged-PR list when
       present; the static HTML list stays as the fallback */
    var prsList = document.getElementById('prs-list');
    if (prsList && stats.openSource && stats.openSource.length) {
      var PR_DISPLAY = { 'fluentassertions': 'FluentAssertions' };
      prsList.innerHTML = stats.openSource.map(function (pr) {
        var project = PR_DISPLAY[pr.project] || pr.project;
        var title = esc(pr.title) + (pr.note ? ' — ' + esc(pr.note) : '');
        return '<li class="prs__row">' +
          '<div class="prs__main">' +
            '<p class="prs__project">' + esc(project) +
              ' <span class="prs__repo">' + esc(pr.repo) + '</span></p>' +
            '<a class="prs__title" href="' + esc(pr.url) +
              '" target="_blank" rel="noopener">' + title + '</a>' +
          '</div>' +
          '<span class="prs__no">#' + pr.number + '</span>' +
          '<span class="badge badge--merged">Merged</span>' +
        '</li>';
      }).join('');
    }

    /* activity — GitHub-style contribution board from daily data,
       with the monthly bar chart as fallback for older data files */
    if (stats.activity.dailyCommits && stats.activity.dailyCommits.length) {
      renderBoard(stats);
    } else {
      renderMonthly(stats);
    }

    initReveal();
    animateCounters();
  }

  function animateCounters() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('[data-stat]').forEach(function (el) {
      var target = parseInt(el.textContent.replace(/[^\d]/g, ''), 10);
      if (!target || target < 100) return;
      var start = null;
      function step(ts) {
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / 900);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3))).toLocaleString('en-US');
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.08 });
    els.forEach(function (e) { io.observe(e); });
    /* Failsafe: nothing may stay hidden if observation misfires. */
    setTimeout(function () {
      els.forEach(function (e) { e.classList.add('is-in'); });
    }, 2500);
  }

  /* header scrollspy — highlight the nav link of the section in view */
  var spyLinks = document.querySelectorAll('.topbar__nav a[href^="#"]');
  if ('IntersectionObserver' in window && spyLinks.length) {
    var spyById = {};
    spyLinks.forEach(function (a) { spyById[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        spyLinks.forEach(function (a) {
          a.classList.remove('is-active');
          a.removeAttribute('aria-current');
        });
        var link = spyById[en.target.id];
        if (link) {
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(spyById).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) spy.observe(s);
    });
  }

  if (window.SITE_STATS) {
    render(window.SITE_STATS);
  } else {
    fetch('data/stats.json').then(function (r) { return r.json(); })
      .then(render).catch(function () { /* data file missing — static content still reads fine */ });
  }
})();
