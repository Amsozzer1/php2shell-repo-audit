# LinkedIn version of the demo: portrait 4:5, large font. Run from the repo root once v0.1.0 is on npm:
#   mkdir -p ../linkedin-demo && vhs docs/tapes/linkedin.tape
# Writes a GIF and an MP4 outside the repo (../linkedin-demo/); neither is committed.
Output "../linkedin-demo/php2shell-linkedin.gif"
Output "../linkedin-demo/php2shell-linkedin.mp4"

Set Shell "bash"
Set FontSize 32
Set Width 1080
Set Height 1350
Set Padding 24
Set Framerate 15
Set TypingSpeed 30ms
Set Theme "Builtin Dark"

# Warm the npx cache off camera so the visible run doesn't include the download.
Hide
# npx can't run this package from inside its own repo (npm resolves the local package.json), so the
# synthetic demo repo is copied next to the output folder, outside the repo, and run from there.
Type "export PS1='$ ' && cp -R examples/demo-repo ../linkedin-demo/ && cd ../linkedin-demo && npx -y php2shell-repo-audit@0.1.0 --version >/dev/null 2>&1; echo WARM$((1+1))"
Enter
Wait+Screen@90s /WARM2/
Type "clear"
Enter
# First frame (what LinkedIn and link previews show): the result, not an empty terminal.
Type "npx php2shell-repo-audit@0.1.0 demo-repo"
Enter
Wait+Screen@20s /exit \d/
Show
Sleep 1500ms
Hide
Type "clear"
Enter
Sleep 300ms
Show

Sleep 500ms
Type "npx php2shell-repo-audit@0.1.0 demo-repo"
Sleep 300ms
Enter
Wait+Screen@20s /exit \d/
# Hold the final frame on the three buckets.
Sleep 3s
