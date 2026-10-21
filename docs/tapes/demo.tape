# Renders docs/demo.gif. Run from the repo root after `npm ci`: vhs docs/tapes/demo.tape
# The --org scene uses a made-up org served from recorded API fixtures by scripts/mock-github.mjs.
Output docs/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 2160
Set Height 560
Set Padding 20
Set TypingSpeed 35ms
Set Theme "Builtin Dark"

Hide
Type "node scripts/mock-github.mjs test/fixtures/org/example-org.json 8765 >/dev/null 2>&1 & sleep 1"
Enter
Type "export PS1='$ ' GITHUB_API_URL=http://127.0.0.1:8765 GH_TOKEN=demo && alias php2shell-repo-audit='node dist/src/cli.js' && clear"
Enter
# First frame (what npm, PDFs and link previews show): the result, not an empty terminal.
Type "php2shell-repo-audit examples/demo-repo"
Enter
Wait+Screen@20s /exit \d/
Show
Sleep 2s
Hide
Type "clear"
Enter
Show

Sleep 500ms
Type `grep -rnE "FROM +php:" examples/demo-repo`
Sleep 300ms
Enter
Sleep 3s

Type "php2shell-repo-audit examples/demo-repo"
Sleep 300ms
Enter
Sleep 8s

Hide
Type "clear"
Enter
Show
Type "php2shell-repo-audit --org example-org --markdown"
Sleep 300ms
Enter
Sleep 8s

Hide
Type "kill %1"
Enter
