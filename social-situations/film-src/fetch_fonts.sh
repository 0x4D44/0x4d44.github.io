#!/bin/bash
# Fetch the four OFL fonts the film uses (Fontsource builds on jsDelivr) and convert them to TTF.
# Needs: curl, python3 with fonttools + brotli.
set -e
cd "$(dirname "$0")"
mkdir -p fonts
for p in caveat-brush/files/caveat-brush-latin-400-normal kalam/files/kalam-latin-700-normal \
         kalam/files/kalam-latin-400-normal fraunces/files/fraunces-latin-600-normal; do
  n=$(basename "$p")
  [ -f "fonts/$n.ttf" ] && continue
  curl -sSfL -o "fonts/$n.woff2" "https://cdn.jsdelivr.net/npm/@fontsource/$p.woff2"
  python3 -c "from fontTools.ttLib import TTFont; f=TTFont('fonts/$n.woff2'); f.flavor=None; f.save('fonts/$n.ttf')"
  rm "fonts/$n.woff2"
done
echo "fonts ready"
