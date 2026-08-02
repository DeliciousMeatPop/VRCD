import React, { useState, useEffect } from 'react'
import {
  Text,
  Button,
  Input,
  Textarea,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  DialogActions,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  CheckmarkCircleRegular,
  ServerRegular,
  DismissCircleRegular
} from '@fluentui/react-icons'
import { useSettings } from '../hooks/useSettings'

const useStyles = makeStyles({
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    alignItems: 'flex-end'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: 1
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalS
  }
})

const ServerConfigSettings: React.FC = () => {
  const styles = useStyles()
  const { serverConfig, setServerConfig } = useSettings()

  const [open, setOpen] = useState(false)
  const [baseUri, setBaseUri] = useState(serverConfig.baseUri)
  const [password, setPassword] = useState(serverConfig.password)
  const [pastedJson, setPastedJson] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    setBaseUri(serverConfig.baseUri)
    setPassword(serverConfig.password)
  }, [serverConfig.baseUri, serverConfig.password])

  // Parse a JSON blob and, if it carries string baseUri + password, copy the
  // values into the two fields. Returns true when it applied something.
  const tryApplyJson = (text: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed) return false
    try {
      const parsed = JSON.parse(trimmed) as { baseUri?: unknown; password?: unknown }
      if (typeof parsed.baseUri === 'string' && typeof parsed.password === 'string') {
        setBaseUri(parsed.baseUri)
        setPassword(parsed.password)
        return true
      }
    } catch {
      // Not valid JSON (yet) — ignore while the user is still typing/pasting.
    }
    return false
  }

  const handleJsonChange = (value: string): void => {
    setPastedJson(value)
    // Auto-fill the fields the instant the pasted text is valid JSON, so a
    // paste "just works" without a second button click.
    if (tryApplyJson(value)) setLocalError(null)
  }

  const handleParseJson = (): void => {
    setLocalError(null)
    if (!pastedJson.trim()) {
      setLocalError('Paste a JSON snippet first')
      return
    }
    if (!tryApplyJson(pastedJson)) {
      setLocalError('JSON must contain string "baseUri" and "password" fields')
    }
  }

  const handleSave = async (): Promise<void> => {
    setLocalError(null)
    setSaveSuccess(false)
    // Save straight from a pasted JSON blob even if the fields weren't filled
    // in (e.g. the user pasted JSON and clicked Save directly).
    let uri = baseUri
    let pass = password
    if ((!uri.trim() || !pass.trim()) && pastedJson.trim()) {
      try {
        const parsed = JSON.parse(pastedJson.trim()) as { baseUri?: unknown; password?: unknown }
        if (typeof parsed.baseUri === 'string') uri = parsed.baseUri
        if (typeof parsed.password === 'string') pass = parsed.password
        setBaseUri(uri)
        setPassword(pass)
      } catch {
        // Fall through to the validation below.
      }
    }
    if (!uri.trim() || !pass.trim()) {
      setLocalError('Both baseUri and password are required')
      return
    }
    try {
      await setServerConfig({ baseUri: uri.trim(), password: pass.trim() })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving server config:', err)
      setLocalError('Failed to save server configuration')
    }
  }


  return (
    <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="secondary" icon={<ServerRegular />}>
          Set Public Server JSON
        </Button>
      </DialogTrigger>
      <DialogSurface style={{ maxWidth: '600px' }}>
        <DialogTitle>Public Server JSON</DialogTitle>
        <DialogContent>
          <DialogBody
            style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM }}
          >
            <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
              Paste the full JSON — the fields below fill in automatically — then click Save. Or
              fill in the fields yourself. Credentials are stored locally.
            </Text>

            <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS }}>
              <Text size={200} weight="semibold">
                Paste JSON
              </Text>
              <Textarea
                value={pastedJson}
                onChange={(_, data) => handleJsonChange(data.value)}
                placeholder='{"baseUri":"https://...","password":"..."}'
                rows={2}
                resize="vertical"
              />
              <Button size="small" onClick={handleParseJson} appearance="subtle">
                Fill fields from JSON
              </Button>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <Text size={200} weight="semibold">
                  Base URI
                </Text>
                <Input
                  value={baseUri}
                  onChange={(_, data) => setBaseUri(data.value)}
                  placeholder="https://your-url-here/"
                />
              </div>
              <div className={styles.field}>
                <Text size={200} weight="semibold">
                  Password
                </Text>
                <Input
                  value={password}
                  onChange={(_, data) => setPassword(data.value)}
                  placeholder="your-password-here"
                  type="password"
                />
              </div>
            </div>

            {localError && (
              <div className={styles.status}>
                <DismissCircleRegular style={{ color: tokens.colorPaletteRedForeground1 }} />
                <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                  {localError}
                </Text>
              </div>
            )}
            {saveSuccess && (
              <div className={styles.status}>
                <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                <Text size={200} style={{ color: tokens.colorPaletteGreenForeground1 }}>
                  Saved. Force Sync or restart to use new credentials.
                </Text>
              </div>
            )}
          </DialogBody>
          <DialogActions>
            <Button appearance="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button appearance="primary" onClick={handleSave}>
              Save
            </Button>
          </DialogActions>
        </DialogContent>
      </DialogSurface>
    </Dialog>
  )
}

export default ServerConfigSettings
