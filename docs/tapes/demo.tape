# Renders docs/demo.gif. Run from the repo root after `npm ci`: vhs docs/tapes/demo.tape
Output docs/demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 1640
Set Height 560
Set Padding 20
Set TypingSpeed 35ms
Set Theme "Builtin Dark"

Hide
Type "export PS1='$ ' NO_COLOR= && alias php2shell-repo-audit='node dist/src/cli.js' && clear"
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
Sleep 9s
