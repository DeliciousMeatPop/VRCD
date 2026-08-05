#!/system/bin/sh
#
# find-stale-obbs.sh
#
# Identifies installed apps whose OBB folder has accumulated multiple
# versioned OBB files under /sdcard/Android/obb/<package>.
#
# A healthy app has at most ONE main.*.obb and ONE patch.*.obb. Some titles
# (e.g. Bonelab) embed the version code in the OBB filename, like
# main.<versionCode>.com.StressLevelZero.BONELAB.obb. If an update pushed a
# new OBB without clearing the folder, the old versioned OBBs are left behind
# and the folder bloats. This script flags exactly those apps so you know
# which ones to clean up.
#
# Usage (nothing is pushed to the device):
#   adb shell < scripts/find-stale-obbs.sh
#
# Or run it on the device directly:
#   adb push scripts/find-stale-obbs.sh /data/local/tmp/
#   adb shell sh /data/local/tmp/find-stale-obbs.sh
#
# This script is READ-ONLY: it never deletes anything. See the notes it
# prints at the end for how to fix an affected app.

OBB_ROOT=/sdcard/Android/obb
found=0

if [ ! -d "$OBB_ROOT" ]; then
  echo "No OBB directory found at $OBB_ROOT (nothing to scan)."
  exit 0
fi

for dir in "$OBB_ROOT"/*/; do
  # Skip if the glob matched nothing (no subdirectories).
  [ -d "$dir" ] || continue

  pkg=${dir%/}
  pkg=${pkg##*/}

  main_count=0
  patch_count=0

  for f in "$dir"main.*.obb; do
    [ -f "$f" ] && main_count=$((main_count + 1))
  done
  for f in "$dir"patch.*.obb; do
    [ -f "$f" ] && patch_count=$((patch_count + 1))
  done

  if [ "$main_count" -gt 1 ] || [ "$patch_count" -gt 1 ]; then
    found=$((found + 1))
    echo "=================================================="
    echo "AFFECTED: $pkg"
    echo "  main OBBs: $main_count    patch OBBs: $patch_count"
    echo "  files (oldest versions can be deleted):"
    for f in "$dir"*.obb; do
      [ -f "$f" ] || continue
      size=$(du -h "$f" 2>/dev/null | cut -f1)
      echo "    ${size}	${f##*/}"
    done
    total=$(du -sh "$dir" 2>/dev/null | cut -f1)
    echo "  total folder size: $total"
  fi
done

echo "=================================================="
if [ "$found" -eq 0 ]; then
  echo "No apps with duplicate/stale OBB files were found."
else
  echo "$found app(s) affected."
  echo
  echo "To fix an affected app, either:"
  echo "  * Reinstall/update it in VRCD now that the installer clears stale"
  echo "    OBBs before pushing, OR"
  echo "  * Manually delete only the OLDER OBB file(s), keeping the newest"
  echo "    version, e.g.:"
  echo "      adb shell rm \"$OBB_ROOT/<package>/main.<oldVersion>.<package>.obb\""
fi
