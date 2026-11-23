/**
 * "Safety Check Fix" - disables Meta's on-device app-safety binary check so
 * sideloaded ports / modified APKs aren't flagged or killed.
 *
 * These are device-shell commands (the `adb shell` prefix is implied). They
 * are deliberately kept out of the shell history / button tooltips: the UI
 * only reports how many ran successfully.
 */
const SAFETY_FIX_COMMANDS: readonly string[] = [
  'cmd device_config put oculus_shared_horizon oc_app_safety_binary_check false',
  'cmd device_config put oculus_shared_os_services oc_app_safety_binary_check false',
  'cmd device_config put hzos_system_sessionless qe_consumer_pha_detection false',
  'cmd device_config put oculus_shared_os_services_sessionless gk_consumer_pha_service_aosp false',
  'appops set com.oculus.appsafety RUN_IN_BACKGROUND ignore',
  'appops set com.oculus.appsafety START_FOREGROUND ignore',
  'pm clear com.oculus.ocms',
  'am force-stop com.oculus.appsafety',
  'am force-stop com.oculus.vrshell'
]

export const SAFETY_FIX_LABEL = 'safety-check-fix'

// Output that means the shell command itself failed (adb returns null on a
// transport error; these cover the device-side failures).
const FAILURE_PATTERN =
  /\b(exception|error|failed|failure|unknown command|not found|permission denied|no such)\b/i

export interface SafetyFixResult {
  total: number
  succeeded: number
  /** 1-based indexes of commands that failed (no command text is exposed). */
  failed: number[]
  message: string
}

export async function runSafetyFix(
  run: (command: string) => Promise<string | null>
): Promise<SafetyFixResult> {
  const total = SAFETY_FIX_COMMANDS.length
  const failed: number[] = []

  for (let i = 0; i < total; i++) {
    try {
      const out = await run(SAFETY_FIX_COMMANDS[i])
      if (out === null || out === undefined || FAILURE_PATTERN.test(out)) failed.push(i + 1)
    } catch {
      failed.push(i + 1)
    }
  }

  const succeeded = total - failed.length
  const message =
    failed.length === 0
      ? `All ${total} commands ran successfully.`
      : `${succeeded}/${total} commands ran successfully. Failed: #${failed.join(', #')}. ` +
        'Check the headset is connected and authorized, then try again.'
  return { total, succeeded, failed, message }
}
