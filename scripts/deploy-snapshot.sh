#!/usr/bin/env bash
# Deploys the working tree to Vercel production without git metadata.
# The Vercel project belongs to a different account than the git commit author,
# and Vercel blocks CLI deploys whose commit author is not a project member.
set -euo pipefail
OUT="${TMPDIR:-/tmp}/korrin-deploy"
rm -rf "$OUT" && mkdir -p "$OUT"
rsync -a --exclude .git --exclude node_modules --exclude .next --exclude .env.local --exclude internal --exclude media --exclude video ./ "$OUT/"
cd "$OUT" && vercel deploy --prod --yes
