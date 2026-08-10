import React, { useState } from 'react'
import {
  Button,
  Dropdown,
  Option,
  Spinner,
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogBody,
  DialogActions,
  Text,
  tokens,
  makeStyles
} from '@fluentui/react-components'
import {
  ServerRegular,
  SettingsRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  ClockRegular,
  PlayRegular
} from '@fluentui/react-icons'
import { useMirrors } from '../hooks/useMirrors'
import MirrorManagement from './MirrorManagement'

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    width: '100%'
  },
  dropdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    width: '100%'
  },
  mirrorSelector: {
    flex: 1,
    minWidth: 0
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS
  },
  managementDialog: {
    width: '80vw',
    maxWidth: '1200px',
    height: '80vh',
    display: 'flex',
    flexDirection: 'column'
  }
})

const MirrorSelector: React.FC = () => {
  const styles = useStyles()
  const {
    mirrors,
    activeMirror,
    isLoading,
    testingMirrors,
    setActiveMirror,
    clearActiveMirror,
    testMirror
  } = useMirrors()

  const [showManagement, setShowManagement] = useState(false)

  const handleMirrorChange = async (mirrorId: string): Promise<void> => {
    if (mirrorId === 'public') {
      // For public mirror, clear the active mirror
      await clearActiveMirror()
      return
    }
    await setActiveMirror(mirrorId)
  }

  const handleTestMirror = async (): Promise<void> => {
    if (activeMirror) {
      await testMirror(activeMirror.id)
    }
  }

  const getStatusIcon = (): React.JSX.Element => {
    if (!activeMirror) {
      return <ServerRegular />
    }

    if (testingMirrors.has(activeMirror.id)) {
      return <Spinner size="tiny" />
    }

    switch (activeMirror.testStatus) {
      case 'success':
        return <CheckmarkCircleRegular style={{ color: tokens.colorPaletteGreenForeground1 }} />
      case 'failed':
        return <DismissCircleRegular style={{ color: tokens.colorPaletteRedForeground1 }} />
      default:
        return <ClockRegular style={{ color: tokens.colorNeutralForeground3 }} />
    }
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <Spinner size="tiny" />
        <Text>{'Loading remotes...'}</Text>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Row 1: status icon + dropdown */}
      <div className={styles.dropdownRow}>
        {getStatusIcon()}
        <Dropdown
          className={styles.mirrorSelector}
          value={activeMirror?.name || 'Public Server'}
          selectedOptions={[activeMirror?.id || 'public']}
          button={{ children: activeMirror?.name || 'Public Server' }}
          onOptionSelect={(_, data) => {
            if (data.optionValue) {
              handleMirrorChange(data.optionValue)
            }
          }}
          placeholder={'Select remote...'}
        >
          <Option value="public" text={'Public Server'}>
            {'Public Server'}
          </Option>
          {mirrors.map((mirror) => (
            <Option key={mirror.id} value={mirror.id} text={mirror.name}>
              {mirror.name}
            </Option>
          ))}
        </Dropdown>
      </div>

      {/* Row 2: test + manage buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {activeMirror && (
          <Button
            appearance="subtle"
            size="small"
            icon={<PlayRegular />}
            onClick={handleTestMirror}
            disabled={testingMirrors.has(activeMirror.id)}
            title={'Test remote connectivity'}
          >
            {'Test'}
          </Button>
        )}

        <Dialog open={showManagement} onOpenChange={(_, data) => setShowManagement(data.open)}>
          <DialogTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              size="small"
              icon={<SettingsRegular />}
              title={'Manage remotes'}
              style={{ flex: 1, justifyContent: 'flex-start' }}
            >
              {'Manage'} Remotes
            </Button>
          </DialogTrigger>
          <DialogSurface className={styles.managementDialog}>
            <DialogTitle>{'Server & Remotes'}</DialogTitle>
            <DialogContent
              style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              <DialogBody style={{ flex: 1, overflow: 'hidden' }}>
                <MirrorManagement />
              </DialogBody>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setShowManagement(false)}>
                  {'Close'}
                </Button>
              </DialogActions>
            </DialogContent>
          </DialogSurface>
        </Dialog>
      </div>
    </div>
  )
}

export default MirrorSelector
