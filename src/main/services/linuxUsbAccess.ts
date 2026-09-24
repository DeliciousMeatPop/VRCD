/**
 * Linux USB access for Quest headsets.
 *
 * On Windows the Oculus/ADB driver grants access to the headset automatically.
 * On Linux, a non-root user can only open a USB device if a udev rule allows
 * it, so without one adb lists the Quest as "no permissions" and nothing
 * connects. Users often work around this by accepting the headset's "Allow
 * access to data" prompt: that switches the Quest into MTP mode, and the
 * distro's libmtp udev rule happens to grant access to the whole device,
 * adb included. That's why Linux users report having to log into the headset
 * and click the USB prompt every time.
 *
 * Installing a udev rule for Meta's USB vendor ID (2833) fixes it for good:
 * the headset connects as soon as it's plugged in, like it does on Windows.
 */

import { execFile } from 'child_process'
import { app } from 'electron'
import { existsSync, promises as fs } from 'fs'
import { join } from 'path'

export const QUEST_UDEV_RULE_PATH = '/etc/udev/rules.d/51-android-quest.rules'

// MODE 0666 works without any group membership (no logout needed); uaccess
// additionally hands the device to whoever is logged in at the seat.
export const QUEST_UDEV_RULE =
  '# Meta Quest (vendor 2833) - allow adb access without the MTP/data prompt.\n' +
  '# Installed by VR CyberDeck.\n' +
  'SUBSYSTEM=="usb", ATTR{idVendor}=="2833", MODE="0666", TAG+="uaccess"\n'

export interface LinuxUsbFixResult {
  success: boolean
  message: string
}

export function isQuestUdevRuleInstalled(): boolean {
  return process.platform === 'linux' && existsSync(QUEST_UDEV_RULE_PATH)
}

/** Commands shown to the user when the automatic install isn't possible. */
const MANUAL_STEPS =
  `echo '${QUEST_UDEV_RULE.trim().split('\n').pop()}' | ` +
  `sudo tee ${QUEST_UDEV_RULE_PATH} && ` +
  'sudo udevadm control --reload-rules && sudo udevadm trigger'

/**
 * Write the udev rule to /etc/udev/rules.d via pkexec (the desktop's graphical
 * admin prompt), then reload udev. The headset must be unplugged and replugged
 * afterwards so the device node is recreated with the new permissions.
 */
export async function installQuestUdevRule(): Promise<LinuxUsbFixResult> {
  if (process.platform !== 'linux') {
    return { success: false, message: 'This fix is only needed on Linux.' }
  }

  const tempRule = join(app.getPath('temp'), `vrcd-51-android-quest-${Date.now()}.rules`)
  await fs.writeFile(tempRule, QUEST_UDEV_RULE, 'utf8')

  // Paths are passed as positional args ($1/$2) so nothing is interpolated
  // into the root shell script.
  const script =
    'install -m 0644 "$1" "$2" && udevadm control --reload-rules && udevadm trigger --subsystem-match=usb'

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'pkexec',
        ['/bin/sh', '-c', script, 'vrcd-udev', tempRule, QUEST_UDEV_RULE_PATH],
        { timeout: 120000 },
        (err, _stdout, stderr) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException & { code?: number | string }).code
            const e = new Error(stderr?.trim() || err.message) as Error & {
              code?: number | string
            }
            e.code = code
            reject(e)
          } else {
            resolve()
          }
        }
      )
    })
  } catch (error) {
    const err = error as Error & { code?: number | string }
    console.error('[LinuxUsbAccess] udev rule install failed:', err.message)
    if (err.code === 'ENOENT') {
      return {
        success: false,
        message: `pkexec isn't installed, so VR CyberDeck can't ask for admin rights. Run this in a terminal instead:\n${MANUAL_STEPS}`
      }
    }
    // pkexec: 126 = user dismissed the password dialog, 127 = not authorized.
    if (err.code === 126 || err.code === 127) {
      return {
        success: false,
        message: `Admin password prompt was cancelled or denied. You can also run this in a terminal:\n${MANUAL_STEPS}`
      }
    }
    return {
      success: false,
      message: `Could not install the udev rule (${err.message}). Run this in a terminal instead:\n${MANUAL_STEPS}`
    }
  } finally {
    fs.unlink(tempRule).catch(() => {})
  }

  console.log(`[LinuxUsbAccess] Installed ${QUEST_UDEV_RULE_PATH}`)
  return {
    success: true,
    message:
      'USB access fixed. Unplug the Quest and plug it back in. You can dismiss the "Allow access to data" prompt from now on.'
  }
}
