#!/bin/sh
#
# linux-quest-udev.sh
#
# Lets ADB reach a Meta Quest on Linux without accepting the headset's
# "Allow access to data" prompt every time you plug it in.
#
# Linux only lets a normal user open a USB device when a udev rule allows it.
# Without one, adb lists the Quest as "no permissions" and VR CyberDeck can't
# connect until the data/MTP prompt is accepted (the MTP rule happens to unlock
# adb too). This installs a rule for Meta's USB vendor ID (2833) so the headset
# connects as soon as it's plugged in, like it does on Windows.
#
# VR CyberDeck can do this for you: FIX USB ACCESS on the headset's card.
#
# Usage:
#   sh scripts/linux-quest-udev.sh
#
# Then unplug and replug the Quest.

set -e

RULE_FILE=/etc/udev/rules.d/51-android-quest.rules

printf '%s\n' \
  '# Meta Quest (vendor 2833) - allow adb access without the MTP/data prompt.' \
  '# Installed by VR CyberDeck.' \
  'SUBSYSTEM=="usb", ATTR{idVendor}=="2833", MODE="0666", TAG+="uaccess"' \
  | sudo tee "$RULE_FILE" > /dev/null

sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=usb

echo "Installed $RULE_FILE - unplug and replug your Quest."
