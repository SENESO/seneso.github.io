#!/usr/bin/env python3
"""
Regenerate data/stats.json (+ data/stats.js) for the profile site.

Data sources (all GitHub, all his own account):
  * Repository metadata  -> GitHub REST API  GET /user/repos (token) or
                            GET /users/SENESO/repos (public only, no token).
  * Lines of code        -> each repo is cloned and counted locally with the
                            counter below (non-blank lines in recognised source
                            files; .git/bin/obj/node_modules/vendor/dist and
                            lockfiles excluded). This is a tokei-equivalent
                            approximation, applied identically everywhere.
  * Activity             -> `git log` author history inside each clone,
                            aggregated by month.

Usage:
  GITHUB_TOKEN=... python3 scripts/update_stats.py            # full CI mode
  python3 scripts/update_stats.py --repos-json repos.json \
      --clones-dir clones --mirrors mirrors.json              # offline mode

mirrors.json maps private repo names to local working copies used only when
a repo cannot be cloned (their counts are flagged locSource="local-mirror").
"""
import argparse, json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timezone

OWNER = "SENESO"

EXT_LANG = {
    '.cs': 'C#', '.csx': 'C#',
    '.ts': 'TypeScript', '.tsx': 'TypeScript',
    '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
    '.php': 'PHP', '.sql': 'T-SQL',
    '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.hpp': 'C++', '.hh': 'C++',
    '.c': 'C', '.h': 'C/C++ Header',
    '.kt': 'Kotlin', '.kts': 'Kotlin', '.py': 'Python',
    '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'SCSS',
    '.xaml': 'XAML', '.axaml': 'XAML', '.razor': 'Razor', '.cshtml': 'Razor',
    '.sh': 'Shell', '.bash': 'Shell', '.ps1': 'PowerShell', '.psm1': 'PowerShell',
    '.bat': 'Batch', '.cmd': 'Batch',
    '.java': 'Java', '.go': 'Go', '.rs': 'Rust', '.swift': 'Swift', '.rb': 'Ruby',
}
SKIP_DIRS = {'.git', 'bin', 'obj', 'node_modules', 'vendor', 'vendors',
             'thirdparty', 'third-party', 'third_party', 'extern', 'externals',
             'external', 'deps', 'dist', 'out', 'packages', '.vs', 'target',
             'build', 'pods', '.idea', '__pycache__', 'testresults'}
SKIP_FILES = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
              'composer.lock', 'packages.lock.json'}
# Vendored SDK trees committed inside a repo's own folders (not the owner's
# code — preserved upstream libraries). Matched per path component.
EXTRA_EXCLUDE_DIRS = {
    'ivmp-platform': {'raknet', 'cegui', 'eawebkit'},
}
# The owner's commit identities across the years.
AUTHORS = ['SENESO', 'Eslam Ashraf', 'ea8199468@gmail.com']

# ---- curated, factual overrides (kept in-repo so CI output stays stable) ----
FEATURED = {
    'durable-execution-dotnet': {'tests': 524, 'license': 'Apache-2.0'},
    'redis-csharp':             {'tests': 219, 'license': 'MIT'},
    'lsm-storage-engine':       {'tests': 117, 'license': 'MIT'},
    'memcached-csharp':         {'tests': 66,  'license': 'MIT'},
}
SUMMARY_OVERRIDES = {
    'G-NET-91-EF02': 'Route Academy — EF Core case study: EventHub. Data annotations and Fluent API configuration, verified live against SQL Server.',
    'G-NET-91-EF03': 'Route Academy — EF Core case study: online learning platform. Fluent API only, composite keys, two migrations with seeded data.',
    'sada-platform': 'Platform backend for SADA, a tactical FPS project — .NET services, APIs and match infrastructure.',
    'conquer-source': 'Private game-server project — Conquer Online server development and tooling.',
    'SENESO': 'GitHub profile configuration repository.',
    'G-NET-91-EF01': 'Route Academy — EF Core assignment, Session 01 (G-NET-91).',
    'G-NET-91-Linq01': 'Route Academy — LINQ assignment, Session 01 (G-NET-91).',
    'G-NET-91-DB04': 'Route Academy — Database assignment, Session 04 (G-NET-91).',
    'G-NET-91-DB03': 'Route Academy — Database Session 03: OnlineRetailStore & HotelReservationSystem (SQL Server).',
    'eso-agent': 'EsoAgent — a fleet remote-administration platform of my own design: signed commands, a WireGuard mesh, remote desktop and software management for Windows and Linux machines, with a desktop app and an owner panel. It is the tool I operate my own devices with.',
}
COURSE_PREFIXES = ('G-NET', 'C48-')


def count_tree(root, extra_exclude=()):
    extra = {d.lower() for d in extra_exclude}
    langs = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames
                       if d.lower() not in SKIP_DIRS and d.lower() not in extra]
        rel = os.path.relpath(dirpath, root)
        if any(part.lower() in SKIP_DIRS or part.lower() in extra
               for part in rel.split(os.sep)):
            continue
        for fn in filenames:
            if fn in SKIP_FILES or fn.endswith(('.min.js', '.min.css')):
                continue
            lang = EXT_LANG.get(os.path.splitext(fn)[1].lower())
            if not lang:
                continue
            p = os.path.join(dirpath, fn)
            try:
                with open(p, 'rb') as f:
                    data = f.read()
                if b'\x00' in data[:8192]:
                    continue
                # Machine-generated files (EF Core migration designers and
                # model snapshots, designer stubs, ...) are not hand code.
                if b'<auto-generated' in data[:1024]:
                    continue
                n = sum(1 for ln in data.decode('utf-8', 'ignore').splitlines() if ln.strip())
            except OSError:
                continue
            langs[lang] = langs.get(lang, 0) + n
    return langs


def count_tree_lines(root):
    """Full-tree line count: non-empty lines of every non-binary file in the
    tree (only .git skipped). Includes bundled/vendored code and data files
    that count_tree excludes — the honest 'whole project' figure, labelled
    as such wherever it is displayed."""
    total = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != '.git']
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            try:
                with open(p, 'rb') as f:
                    data = f.read()
                if b'\x00' in data[:8192]:
                    continue
                total += sum(1 for ln in data.decode('utf-8', 'ignore').splitlines()
                             if ln.strip())
            except OSError:
                continue
    return total


def detect_license(root):
    for name in ('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license'):
        p = os.path.join(root, name)
        if os.path.isfile(p):
            try:
                head = open(p, encoding='utf-8', errors='ignore').read(600)
            except OSError:
                continue
            if 'Apache License' in head and '2.0' in head:
                return 'Apache-2.0'
            if 'MIT License' in head:
                return 'MIT'
            if 'GNU GENERAL PUBLIC LICENSE' in head:
                return 'GPL-3.0' if 'Version 3' in head else 'GPL'
            if 'BSD' in head:
                return 'BSD'
            return 'See LICENSE'
    return None


def git_months(root):
    """{YYYY-MM: commit count} for commits authored by the owner."""
    try:
        cmd = ['git', '-C', root, 'log', '--all', '--format=%ad',
               '--date=format:%Y-%m']
        for a in AUTHORS:
            cmd.append(f'--author={a}')
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        months = {}
        for line in out.stdout.splitlines():
            line = line.strip()
            if re.fullmatch(r'\d{4}-\d{2}', line):
                months[line] = months.get(line, 0) + 1
        return months
    except Exception:
        return {}


def fetch_repos_api(token):
    repos, page = [], 1
    while True:
        url = (f'https://api.github.com/user/repos?per_page=100&page={page}'
               '&affiliation=owner&sort=updated')
        req = urllib.request.Request(url, headers={
            'Accept': 'application/vnd.github+json',
            'Authorization': f'Bearer {token}',
            'User-Agent': 'profile-site-stats'})
        with urllib.request.urlopen(req) as r:
            batch = json.load(r)
        if not batch:
            break
        repos.extend(batch)
        page += 1
    return [{'name': r['name'], 'description': r.get('description'),
             'html_url': r['html_url'], 'language': r.get('language'),
             'stargazers_count': r.get('stargazers_count', 0),
             'forks_count': r.get('forks_count', 0),
             'private': r.get('private', False), 'fork': r.get('fork', False),
             'created_at': r.get('created_at'), 'updated_at': r.get('updated_at'),
             'clone_url': r.get('clone_url')} for r in repos]


def clone_repo(repo, dest, token):
    url = repo['clone_url']
    if token and url.startswith('https://'):
        url = url.replace('https://', f'https://x-access-token:{token}@', 1)
    subprocess.run(['git', 'clone', '-q', url, dest],
                   capture_output=True, timeout=600)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repos-json')
    ap.add_argument('--clones-dir')
    ap.add_argument('--mirrors')
    ap.add_argument('--out', default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'stats.json'))
    args = ap.parse_args()

    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if args.repos_json:
        repos = json.load(open(args.repos_json))
    elif token:
        repos = fetch_repos_api(token)
    else:
        sys.exit('Need GITHUB_TOKEN or --repos-json')

    mirrors = json.load(open(args.mirrors)) if args.mirrors else {}
    clones_dir = args.clones_dir
    tmp_clones = None
    if not clones_dir:
        import tempfile
        tmp_clones = tempfile.mkdtemp(prefix='stats-clones-')
        clones_dir = tmp_clones

    projects, lang_total, activity = [], {}, {}
    total_loc = 0
    for repo in sorted(repos, key=lambda r: r['name'].lower()):
        name = repo['name']
        loc_path = os.path.join(clones_dir, name)
        git_path = loc_path
        loc_source = 'github-clone'
        if not os.path.isdir(loc_path) and name in mirrors:
            m = mirrors[name]
            if isinstance(m, dict):
                loc_path = m.get('loc') or m.get('git')
                git_path = m.get('git') or m.get('loc')
            else:
                loc_path = git_path = m
            loc_source = 'local-mirror'
        if not os.path.isdir(loc_path) and not args.clones_dir:
            try:
                clone_repo(repo, loc_path, token)
                git_path = loc_path
            except Exception:
                loc_path = None
        langs, months, license_ = {}, {}, None
        tree_lines = None
        if loc_path and os.path.isdir(loc_path):
            langs = count_tree(loc_path, EXTRA_EXCLUDE_DIRS.get(name, ()))
            tree_lines = count_tree_lines(loc_path)
            license_ = detect_license(loc_path)
            if git_path and os.path.isdir(os.path.join(git_path, '.git')):
                months = git_months(git_path)
        else:
            loc_source = 'unavailable'
        code_lines = sum(langs.values())
        if loc_source != 'unavailable':
            total_loc += code_lines
            for k, v in langs.items():
                lang_total[k] = lang_total.get(k, 0) + v
            for k, v in months.items():
                activity[k] = activity.get(k, 0) + v
        top = sorted(langs.items(), key=lambda kv: -kv[1])[:3]
        feat = FEATURED.get(name, {})
        summary = repo.get('description') or SUMMARY_OVERRIDES.get(name) or ''
        group = ('featured' if name in FEATURED else
                 'private' if repo['private'] else
                 'course' if name.startswith(COURSE_PREFIXES) else 'library')
        projects.append({
            'name': name,
            'url': repo['html_url'],
            'visibility': 'Private' if repo['private'] else 'Public',
            'summary': summary,
            'primaryLanguage': repo.get('language'),
            'topLanguages': [{'name': k, 'lines': v} for k, v in top],
            'codeLines': code_lines if loc_source != 'unavailable' else None,
            'treeLines': tree_lines if loc_source != 'unavailable' else None,
            'locSource': loc_source,
            'license': feat.get('license') or license_,
            'tests': feat.get('tests'),
            'stars': repo.get('stargazers_count', 0),
            'forks': repo.get('forks_count', 0),
            'createdAt': repo.get('created_at'),
            'updatedAt': repo.get('updated_at'),
            'group': group,
        })

    languages = [{'name': k, 'lines': v,
                  'pct': round(100.0 * v / total_loc, 1) if total_loc else 0}
                 for k, v in sorted(lang_total.items(), key=lambda kv: -kv[1])]
    months_sorted = sorted(activity.items())
    stats = {
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'owner': OWNER,
        'totals': {
            'repositories': len(repos),
            'public': sum(1 for r in repos if not r['private']),
            'private': sum(1 for r in repos if r['private']),
            'codeLines': total_loc,
            'commits': sum(activity.values()),
            'languages': len(languages),
        },
        'languages': languages,
        'activity': {
            'monthlyCommits': [{'month': m, 'commits': c} for m, c in months_sorted],
            'totalCommits': sum(activity.values()),
            'firstMonth': months_sorted[0][0] if months_sorted else None,
            'lastMonth': months_sorted[-1][0] if months_sorted else None,
        },
        'projects': projects,
    }
    out = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(stats, f, indent=1, ensure_ascii=False)
    with open(os.path.join(os.path.dirname(out), 'stats.js'), 'w') as f:
        f.write('window.SITE_STATS = ')
        json.dump(stats, f, ensure_ascii=False)
        f.write(';\n')
    print(f'wrote {out}: {len(projects)} projects, {total_loc} code lines, '
          f'{stats["totals"]["commits"]} commits')


if __name__ == '__main__':
    main()
