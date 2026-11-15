"""Run after editing the duel CSS: python scripts/scaled-duel-css.py

The scaled duel page (uiScale.ts) is the desktop design at any window size >= 640px.
CSS media queries see the real window, so:
  - every desktop block (@media (min-width: 1001px) / (min-width: 1700px)) gets a copy right after it that
    applies while a scaled duel page exists (zero added specificity, same place in the cascade);
  - every small-screen rule (@media (max-width: ...)) in the duel styles stops applying while it exists.
Idempotent: copies are marked and regenerated."""
import re, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "client", "components", "duel"))

ON = ":has(.duel-page.is-scaled)"
MARK_A = "/* scaled-copy:start */"
MARK_B = "/* scaled-copy:end */"


def scope(sel: str, cond: str) -> str:
    sel = sel.strip()
    if sel.startswith(":where(body") or ":where(:has(.duel-page.is-scaled" in sel or ":where(:not(:has(.duel-page.is-scaled" in sel:
        return sel   # already scoped (the script is re-run)
    for root in ("html", "body", ":root"):
        if sel == root or sel.startswith(root + " ") or sel.startswith(root + ":") or sel.startswith(root + "."):
            return root + f":where({cond})" + sel[len(root):]
    return f":where(body{cond}) {sel}"


def rules(body: str):
    """Flat rules in a block body (no nested blocks expected)."""
    out = []
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", body):
        sel, decl = m.group(1), m.group(2)
        sel = re.sub(r"/\*.*?\*/", "", sel, flags=re.S).strip()
        if sel:
            out.append((sel, decl))
    return out


def find_blocks(s: str, cond_re: str):
    """(start, end, body) of each @media block whose condition matches."""
    res = []
    for m in re.finditer(r"@media\s*\(([^)]*)\)\s*\{", s):
        if not re.fullmatch(cond_re, m.group(1).strip()):
            continue
        i = m.end(); depth = 1
        while depth:
            c = s[i]
            if c == "{": depth += 1
            elif c == "}": depth -= 1
            i += 1
        res.append((m.start(), i, s[m.end():i - 1]))
    return res


def process(path: str):
    s = open(path, encoding="utf-8").read()
    # drop earlier copies
    s = re.sub(re.escape(MARK_A) + r".*?" + re.escape(MARK_B) + r"\n?", "", s, flags=re.S)
    # 1. desktop blocks: insert scoped copies after each
    blocks = find_blocks(s, r"min-width:\s*(1001|1700)px")
    for start, end, body in reversed(blocks):
        copy = [", ".join(scope(x, ON) for x in sel.split(",")) + " {" + decl + "}" for sel, decl in rules(body)]
        if copy:
            s = s[:end] + "\n" + MARK_A + "\n" + "\n".join(copy) + "\n" + MARK_B + "\n" + s[end:]
    # 2. small-screen blocks: not while a scaled page exists
    for start, end, body in reversed(find_blocks(s, r"max-width:\s*\d+px")):
        if MARK_A in body:
            continue
        new = []
        for sel, decl in rules(body):
            new.append(", ".join(scope(x, ":not(:has(.duel-page.is-scaled))") for x in sel.split(",")) + " {" + decl + "}")
        head = s[start:s.index("{", start) + 1]
        s = s[:start] + head + "\n  " + "\n  ".join(new) + "\n}" + s[end:]
    open(path, "w", encoding="utf-8", newline="").write(s)
    print(path, len(blocks), "desktop blocks copied")


for f in ["duel-scene.css", "duel.css", "duel-log.css"]:
    process(f)
