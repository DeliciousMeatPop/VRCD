import React, { useState } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardPreview,
  Text,
  Badge,
  Textarea,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  DialogActions,
  MessageBar,
  MessageBarBody,
  MessageBarActions,
  Spinner,
  tokens,
  makeStyles,
  shorthands
} from '@fluentui/react-components'
import {
  AddRegular,
  DeleteRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ClockRegular,
  PlayRegular,
  RadioButtonRegular,
  RecordRegular,
  DocumentRegular,
  CloudRegular,
  ChevronDownRegular,
  ChevronUpRegular,
  DismissRegular
} from '@fluentui/react-icons'
import { useMirrors } from '../hooks/useMirrors'
import { useSettings } from '../hooks/useSettings'
import { Mirror } from '@shared/types'
import ServerConfigSettings from './ServerConfigSettings'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalM,
    overflowY: 'auto',
    flex: 1
  },
  mirrorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: tokens.spacingVerticalM
  },
  mirrorCard: {
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: tokens.shadow8
    }
  },
  activeMirrorCard: {
    ...shorthands.border('2px', 'solid', tokens.colorBrandBackground)
  },
  mirrorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  mirrorInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS
  },
  addMirrorSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS
  },
  dialogContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM
  },
  rcloneSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`
  }
})

interface MirrorManagementProps {
  /** True when a server (public JSON or rclone config) has been configured. */
  serverConfigured?: boolean
  /** True when server mode is currently active (configured AND not toggled off). */
  serverActive?: boolean
  /** Toggle server mode on/off without wiping the saved server credentials. */
  onToggleServer?: (on: boolean) => void
}

const MirrorManagement: React.FC<MirrorManagementProps> = ({
  serverConfigured = false,
  serverActive = false,
  onToggleServer
}) => {
  const styles = useStyles()
  const {
    mirrors,
    isLoading,
    error,
    testingMirrors,
    addMirror,
    removeMirror,
    setActiveMirror,
    clearActiveMirror,
    testMirror,
    testAllMirrors,
    importMirrorFromFile,
    clearError
  } = useMirrors()

  const { serverConfig } = useSettings()

  const [showRcloneSection, setShowRcloneSection] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [configContent, setConfigContent] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const hasPublicConfig = serverConfig.baseUri.length > 0
  const activeMirror = mirrors.find((m) => m.isActive)

  const handleAddMirror = async (): Promise<void> => {
    if (!configContent.trim()) return

    setIsAdding(true)
    try {
      const success = await addMirror(configContent.trim())
      if (success) {
        setConfigContent('')
        setShowAddDialog(false)
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleImportFromFile = async (): Promise<void> => {
    setIsImporting(true)
    try {
      await importMirrorFromFile()
    } finally {
      setIsImporting(false)
    }
  }

  const handleRemoveMirror = async (id: string): Promise<void> => {
    if (window.confirm('Are you sure you want to remove this remote?')) {
      await removeMirror(id)
    }
  }

  const handleSetActive = async (id: string): Promise<void> => {
    await setActiveMirror(id)
  }

  const handleTestMirror = async (id: string): Promise<void> => {
    await testMirror(id)
  }

  const handleTestAll = async (): Promise<void> => {
    await testAllMirrors()
  }

  const getStatusIcon = (mirror: Mirror): React.JSX.Element => {
    if (testingMirrors.has(mirror.id)) {
      return <Spinner size="tiny" />
    }

    switch (mirror.testStatus) {
      case 'success':
        return <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
      case 'failed':
        return <DismissCircleRegular style={{ color: tokens.colorPaletteRedForeground1 }} />
      case 'testing':
        return <Spinner size="tiny" />
      default:
        return <ClockRegular style={{ color: tokens.colorNeutralForeground3 }} />
    }
  }

  const getStatusText = (mirror: Mirror): string => {
    if (testingMirrors.has(mirror.id)) {
      return 'Testing...'
    }

    switch (mirror.testStatus) {
      case 'success':
        return 'Online'
      case 'failed':
        return 'Failed'
      case 'testing':
        return 'Testing...'
      default:
        return 'Untested'
    }
  }

  const formatLastTested = (date?: Date): string => {
    if (!date) return 'Never'
    return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
      Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      'day'
    )
  }

  const getServerStatusText = (): string => {
    if (activeMirror) {
      return `${'Active method: Rclone Config'} (${activeMirror.name})`
    }
    if (hasPublicConfig) {
      return 'Active method: Public Server JSON'
    }
    return 'No server method configured. Use Set Public Server JSON or Set Rclone Config to get started.'
  }

  const getServerStatusColor = (): string => {
    if (activeMirror || hasPublicConfig) {
      return tokens.colorPaletteGreenForeground1
    }
    return tokens.colorNeutralForeground3
  }

  return (
    <div className={styles.container}>
      {/* Top button row: two top-level methods */}
      <div
        style={{
          display: 'flex',
          gap: tokens.spacingHorizontalS,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <ServerConfigSettings />
        <Button
          appearance={showRcloneSection ? 'primary' : 'secondary'}
          icon={<CloudRegular />}
          iconPosition="before"
          onClick={() => setShowRcloneSection((v) => !v)}
        >
          {'Set Rclone Config'}
          {mirrors.length > 0 ? ` (${mirrors.length})` : ''}
          {showRcloneSection ? (
            <ChevronUpRegular style={{ marginLeft: tokens.spacingHorizontalXS }} />
          ) : (
            <ChevronDownRegular style={{ marginLeft: tokens.spacingHorizontalXS }} />
          )}
        </Button>
      </div>

      {/* Active server method status */}
      <Card>
        <CardPreview>
          <div
            style={{
              padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: tokens.spacingHorizontalS
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
              {activeMirror || hasPublicConfig ? (
                <CheckmarkCircleRegular style={{ color: getServerStatusColor(), flexShrink: 0 }} />
              ) : (
                <DismissCircleRegular
                  style={{ color: tokens.colorNeutralForeground3, flexShrink: 0 }}
                />
              )}
              <Text style={{ color: getServerStatusColor() }}>{getServerStatusText()}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
              {activeMirror && hasPublicConfig && (
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<RadioButtonRegular />}
                  onClick={() => clearActiveMirror()}
                  title="Switch back to the public server"
                >
                  Use Public Server
                </Button>
              )}
              {/* Toggle server mode on/off without wiping the saved credentials */}
              {serverConfigured && onToggleServer && (
                <Button
                  appearance="primary"
                  size="small"
                  icon={serverActive ? <DismissCircleRegular /> : <PlayRegular />}
                  onClick={() => onToggleServer(!serverActive)}
                  title={
                    serverActive
                      ? 'Turn the server off and drop back to the sideloader (keeps your saved server info)'
                      : 'Turn the configured server back on'
                  }
                >
                  {serverActive ? 'Switch to Sideloader' : 'Switch to Server Mode'}
                </Button>
              )}
            </div>
          </div>
        </CardPreview>
      </Card>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
          <MessageBarActions
            containerAction={
              <Button
                appearance="transparent"
                icon={<DismissRegular />}
                onClick={clearError}
                aria-label="Dismiss"
              />
            }
          />
        </MessageBar>
      )}

      {/* Rclone section — only visible when toggled */}
      {showRcloneSection && (
        <div className={styles.rcloneSection}>
          <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' }}>
            <Button
              appearance="secondary"
              icon={<PlayRegular />}
              onClick={handleTestAll}
              disabled={mirrors.length === 0}
            >
              {'Test All'}
            </Button>
            <Button
              appearance="secondary"
              icon={<DocumentRegular />}
              onClick={handleImportFromFile}
              disabled={isImporting}
            >
              {isImporting ? <Spinner size="tiny" /> : 'Import from File'}
            </Button>
            <Dialog open={showAddDialog} onOpenChange={(_, data) => setShowAddDialog(data.open)}>
              <DialogTrigger disableButtonEnhancement>
                <Button appearance="primary" icon={<AddRegular />}>
                  {'Add Remote'}
                </Button>
              </DialogTrigger>
              <DialogSurface
                style={{
                  background: '#050514',
                  border: '1px solid rgba(var(--vrcd-neon-raw),0.35)',
                  ['--colorNeutralForeground1' as string]: 'var(--vrcd-neon)',
                  ['--colorNeutralForeground2' as string]: 'rgba(var(--vrcd-neon-raw),0.75)',
                  ['--colorNeutralBackground1' as string]: '#050514',
                  ['--colorNeutralStroke1' as string]: 'rgba(var(--vrcd-neon-raw),0.25)',
                  ['--colorBrandBackground' as string]: 'var(--vrcd-neon)',
                  ['--colorNeutralForegroundOnBrand' as string]: '#050514'
                }}
              >
                <DialogTitle>{'Add New Remote'}</DialogTitle>
                <DialogContent className={styles.dialogContent}>
                  <DialogBody>
                    <Text>
                      {
                        'Paste your rclone remote configuration below. The configuration should be in INI format.'
                      }
                    </Text>
                    <Textarea
                      placeholder={`Example:
[myremote]
type = ftp
host = example.com
port = 21
user = username
pass = password`}
                      value={configContent}
                      onChange={(_, data) => setConfigContent(data.value)}
                      rows={8}
                      resize="vertical"
                    />
                  </DialogBody>
                  <DialogActions>
                    <Button
                      appearance="secondary"
                      onClick={() => setShowAddDialog(false)}
                      disabled={isAdding}
                    >
                      {'Cancel'}
                    </Button>
                    <Button
                      appearance="primary"
                      onClick={handleAddMirror}
                      disabled={!configContent.trim() || isAdding}
                    >
                      {isAdding ? <Spinner size="tiny" /> : 'Add Remote'}
                    </Button>
                  </DialogActions>
                </DialogContent>
              </DialogSurface>
            </Dialog>
          </div>

          {isLoading ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: tokens.spacingVerticalXL
              }}
            >
              <Spinner size="medium" label={'Loading remotes...'} />
            </div>
          ) : mirrors.length === 0 ? (
            <Card>
              <CardPreview>
                <div style={{ padding: tokens.spacingVerticalXL, textAlign: 'center' }}>
                  <Text>
                    {'No custom remotes configured. Import from file or add one manually.'}
                  </Text>
                </div>
              </CardPreview>
            </Card>
          ) : (
            <div className={styles.mirrorGrid}>
              {mirrors.map((mirror) => (
                <Card
                  key={mirror.id}
                  className={`${styles.mirrorCard} ${mirror.isActive ? styles.activeMirrorCard : ''}`}
                  onClick={() => !mirror.isActive && handleSetActive(mirror.id)}
                >
                  <CardHeader
                    header={
                      <div className={styles.mirrorHeader}>
                        <div className={styles.mirrorInfo}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: tokens.spacingHorizontalXS
                            }}
                          >
                            {mirror.isActive ? (
                              <RecordRegular color={tokens.colorPaletteGreenForeground1} />
                            ) : (
                              <RadioButtonRegular />
                            )}
                            <Text weight="semibold">{mirror.name}</Text>
                          </div>
                          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                            {mirror.config.type}://{mirror.config.host}
                            {mirror.config.port && `:${mirror.config.port}`}
                          </Text>
                        </div>
                        <div className={styles.statusBadge}>
                          {getStatusIcon(mirror)}
                          <Badge
                            appearance="outline"
                            color={
                              mirror.testStatus === 'success'
                                ? 'success'
                                : mirror.testStatus === 'failed'
                                  ? 'danger'
                                  : 'informative'
                            }
                          >
                            {getStatusText(mirror)}
                          </Badge>
                        </div>
                      </div>
                    }
                  />
                  <CardPreview>
                    <div style={{ padding: tokens.spacingVerticalS }}>
                      <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                        {'Last tested:'} {formatLastTested(mirror.lastTested)}
                      </Text>
                      {mirror.testError && (
                        <Text size={100} style={{ color: tokens.colorPaletteRedForeground1 }}>
                          Error: {mirror.testError}
                        </Text>
                      )}
                      <div className={styles.actions}>
                        <Button
                          size="small"
                          appearance="secondary"
                          icon={<PlayRegular />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTestMirror(mirror.id)
                          }}
                          disabled={testingMirrors.has(mirror.id)}
                        >
                          {'Test'}
                        </Button>
                        <Button
                          size="small"
                          appearance="secondary"
                          icon={<DeleteRegular />}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveMirror(mirror.id)
                          }}
                        >
                          {'Remove'}
                        </Button>
                      </div>
                    </div>
                  </CardPreview>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MirrorManagement
