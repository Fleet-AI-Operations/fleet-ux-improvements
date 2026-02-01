#!/bin/bash

set -e  # Exit on error

BRANCH="$1"

if [ -z "$BRANCH" ]; then
  echo "Usage: $0 <branch>"
  exit 1
fi

cd "../"

if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Local branch '$BRANCH' does not exist."
  exit 1
fi

if ! git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  echo "Remote branch 'origin/$BRANCH' does not exist."
  exit 1
fi

git checkout main
git merge "$BRANCH"

# Inlined sync-branch-config.sh logic
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"
file_path="$root/fleet.user.js"
dry_run=false
if [[ ! -f "$file_path" ]]; then
  echo "[error] fleet.user.js not found: $file_path"
  exit 1
fi
branch="$(git -C "$root" rev-parse --abbrev-ref HEAD)"
echo "[info] Current branch: $branch"
if [[ "$dry_run" == true ]]; then
  echo "[info] Dry run mode - no files will be modified"
fi
header_version="$(
  awk '/^\/\/ @version[[:space:]]+/ {print $3; exit}' "$file_path"
)"
if [[ -z "$header_version" ]]; then
  echo "[error] Could not find @version in header"
  exit 1
fi
needs_name_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ \@name\s+(\[[^\]]+\]\s+)?(.+?)(?:\r?\n|\z)/m) {
      my ($tag, $name) = ($1, $2);
      $name =~ s/^\s+|\s+$//g;
      if ($ENV{BRANCH} eq "main") {
        print($tag ? "1" : "0");
      } else {
        my $expected = "[" . $ENV{BRANCH} . "] ";
        print((!defined $tag || $tag ne $expected) ? "1" : "0");
      }
    }
  ' "$file_path"
}
needs_download_url_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ @downloadURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/fleet\.user\.js/m) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$file_path"
}
needs_update_url_change() {
  BRANCH="$branch" perl -0ne '
    if (/^\/\/ @updateURL\s+https:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/([^\/]+)\/fleet\.user\.js/m) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$file_path"
}
needs_github_config_change() {
  BRANCH="$branch" perl -0ne '
    if (/branch:\s*[\"\x27]([^\"\x27]+)[\"\x27]/) {
      print($1 ne $ENV{BRANCH} ? "1" : "0");
    }
  ' "$file_path"
}
needs_version_constant_change() {
  HEADER_VERSION="$header_version" perl -0ne '
    if (/const VERSION\s*=\s*[\"\x27]([^\"\x27]+)[\"\x27]/) {
      print($1 ne $ENV{HEADER_VERSION} ? "1" : "0");
    }
  ' "$file_path"
}
name_change="$(needs_name_change)"
download_change="$(needs_download_url_change)"
update_change="$(needs_update_url_change)"
github_change="$(needs_github_config_change)"
version_change="$(needs_version_constant_change)"
content="$(cat "$file_path")"
new_content="$(printf "%s" "$content" | BRANCH="$branch" HEADER_VERSION="$header_version" perl -0pe '
  s{(// \@name\s+)(\[[^\]]+\]\s+)?(.+?)(\r?\n|\z)}{
    my ($p, $tag, $name, $eol) = ($1, $2, $3, $4);
    $name =~ s/^\s+|\s+$//g;
    ($ENV{BRANCH} eq "main" ? $p . $name : $p . "[" . $ENV{BRANCH} . "] " . $name) . $eol
  }mge;
  s{(// @(?:download|update)URL\s+https://raw\.githubusercontent\.com/[^/]+/[^/]+/)([^/]+)(/fleet\.user\.js)}{$1.$ENV{BRANCH}.$3}ge;
  s{(branch:\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1.$ENV{BRANCH}.$3}ge;
  s{(const VERSION\s*=\s*[\"\x27])([^\"\x27]+)([\"\x27])}{$1.$ENV{HEADER_VERSION}.$3}ge;
')"
if [[ "$new_content" != "$content" ]]; then
  if [[ "$dry_run" == false ]]; then
    printf "%s" "$new_content" > "$file_path"
  fi
fi
changed=()
if [[ "$name_change" == "1" ]]; then changed+=("@name"); fi
if [[ "$download_change" == "1" ]]; then changed+=("@downloadURL"); fi
if [[ "$update_change" == "1" ]]; then changed+=("@updateURL"); fi
if [[ "$github_change" == "1" ]]; then changed+=("GITHUB_CONFIG.branch"); fi
if [[ "$version_change" == "1" ]]; then changed+=("VERSION constant"); fi
if [[ "${#changed[@]}" -gt 0 ]]; then
  if [[ "$dry_run" == true ]]; then
    echo "[info] Would update: ${changed[*]}"
  else
    echo "[info] Updated: ${changed[*]}"
  fi
else
  echo "[info] All values already in sync - no changes needed"
fi

git add .
git commit -m "Sync branch config"
git push

git branch -d "$BRANCH" || git branch -D "$BRANCH"
git push origin --delete "$BRANCH" || true

echo "The $BRANCH specific userscript can now safely be deleted."
echo "All changes are now live on the main userscript."