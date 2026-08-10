import React, { useState } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableHeaderCell,
  TableRow,
  TableCell,
  Text,
  makeStyles,
  tokens
} from '@fluentui/react-components'
import {
  FolderOpenRegular,
  DocumentRegular,
  DeleteRegular,
  ArrowUploadRegular
} from '@fluentui/react-icons'
import { LocalUploadError } from '@shared/types'

const useStyles = makeStyles({
  description: {
    marginBottom: tokens.spacingVerticalM
  },
  actionRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM
  },
  errorBox: {
    marginTop: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorPaletteRedBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorPaletteRedBorder1}`
  },
  errorTitle: {
    color: tokens.colorPaletteRedForeground1,
    display: 'block',
    marginBottom: tokens.spacingVerticalS
  },
  errorItem: {
    marginTop: tokens.spacingVerticalXS
  },
  rulesBox: {
    marginTop: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2
  },
  emptyState: {
    marginTop: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic'
  },
  typeTag: {
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3
  }
})

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

const LocalUploadDialog: React.FC = () => {
  const styles = useStyles()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [validationErrors, setValidationErrors] = useState<LocalUploadError[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const addPaths = (newPaths: string[]): void => {
    setSelectedPaths((prev) => {
      const combined = [...prev]
      for (const p of newPaths) {
        if (!combined.includes(p)) combined.push(p)
      }
      return combined
    })
    setValidationErrors([])
  }

  const handleAddFolders = async (): Promise<void> => {
    const paths = await window.api.dialog.showLocalFolderPicker()
    if (paths && paths.length > 0) addPaths(paths)
  }

  const handleAddZips = async (): Promise<void> => {
    const paths = await window.api.dialog.showLocalZipPicker()
    if (paths && paths.length > 0) addPaths(paths)
  }

  const handleRemovePath = (path: string): void => {
    setSelectedPaths((prev) => prev.filter((p) => p !== path))
    setValidationErrors([])
  }

  const handleUpload = async (): Promise<void> => {
    setIsProcessing(true)
    setValidationErrors([])

    try {
      const result = await window.api.uploads.addLocalItemsToQueue(selectedPaths)
      if (result.errors.length > 0) {
        setValidationErrors(result.errors)
      } else {
        setIsOpen(false)
        setSelectedPaths([])
      }
    } catch (err) {
      console.error('[LocalUploadDialog] Error adding items to queue:', err)
      setValidationErrors([
        { path: '', error: err instanceof Error ? err.message : 'Unknown error' }
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = (): void => {
    setIsOpen(false)
    setValidationErrors([])
  }

  const isZip = (path: string): boolean => path.toLowerCase().endsWith('.zip')

  return (
    <>
      <Button
        icon={<ArrowUploadRegular />}
        appearance="subtle"
        size="small"
        onClick={() => setIsOpen(true)}
        style={{
          fontFamily: 'var(--vrcd-font-mono)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          fontSize: '11px',
          color: 'var(--vrcd-neon)',
          justifyContent: 'flex-start',
          width: '100%',
          border: '1px solid rgba(var(--vrcd-neon-raw),0.45)'
        }}
      >
        {'Upload Local Files'}
      </Button>

      <Dialog
        open={isOpen}
        onOpenChange={(_, data) => {
          if (!data.open) handleClose()
        }}
      >
        <DialogSurface
          mountNode={document.getElementById('portal')}
          style={{
            maxWidth: '680px',
            width: '90vw',
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
          <DialogBody>
            <DialogTitle>{'Upload Local Files'}</DialogTitle>
            <DialogContent>
              <Text className={styles.description}>
                {
                  'Select folders containing APK files or ZIP archives to upload to the server. Each folder must contain exactly one APK file.'
                }
              </Text>

              <div className={styles.actionRow}>
                <Button icon={<FolderOpenRegular />} onClick={handleAddFolders}>
                  {'Add Folders'}
                </Button>
                <Button icon={<DocumentRegular />} onClick={handleAddZips}>
                  {'Add ZIP Files'}
                </Button>
              </div>

              {selectedPaths.length === 0 ? (
                <Text className={styles.emptyState}>
                  {'No items selected. Add folders or ZIP files above.'}
                </Text>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>{'Name'}</TableHeaderCell>
                      <TableHeaderCell style={{ width: '80px' }}>{'Type'}</TableHeaderCell>
                      <TableHeaderCell style={{ width: '60px' }}>{'Actions'}</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPaths.map((path) => (
                      <TableRow key={path}>
                        <TableCell style={{ wordBreak: 'break-all' }}>{basename(path)}</TableCell>
                        <TableCell>
                          <span className={styles.typeTag}>
                            {isZip(path) ? 'ZIP file' : 'Folder'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            icon={<DeleteRegular />}
                            appearance="subtle"
                            size="small"
                            onClick={() => handleRemovePath(path)}
                            aria-label={'Remove'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {validationErrors.length > 0 && (
                <div className={styles.errorBox}>
                  <Text weight="semibold" className={styles.errorTitle}>
                    {'Upload refused — validation errors:'}
                  </Text>
                  {validationErrors.map((err, i) => (
                    <div key={i} className={styles.errorItem}>
                      {err.path && (
                        <Text size={200} weight="semibold">
                          {basename(err.path)}:{' '}
                        </Text>
                      )}
                      <Text size={200}>{err.error}</Text>
                    </div>
                  ))}
                  <div style={{ marginTop: tokens.spacingVerticalM }}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground2 }}>
                      {
                        'How it works: Each selected folder must contain exactly one APK file. It can also contain an OBB folder, instruction files, or other related content. If you have multiple APKs, put each in its own separate folder.'
                      }
                    </Text>
                  </div>
                </div>
              )}

              {selectedPaths.length > 0 && validationErrors.length === 0 && (
                <div className={styles.rulesBox}>
                  <Text size={200}>
                    {
                      'How it works: Each selected folder must contain exactly one APK file. It can also contain an OBB folder, instruction files, or other related content. If you have multiple APKs, put each in its own separate folder.'
                    }
                  </Text>
                </div>
              )}
            </DialogContent>

            <DialogActions>
              <Button appearance="secondary" onClick={handleClose}>
                {'Cancel'}
              </Button>
              <Button
                appearance="primary"
                onClick={handleUpload}
                disabled={selectedPaths.length === 0 || isProcessing}
                icon={<ArrowUploadRegular />}
              >
                {isProcessing ? 'Validating...' : `${'Upload'} (${selectedPaths.length})`}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}

export default LocalUploadDialog
