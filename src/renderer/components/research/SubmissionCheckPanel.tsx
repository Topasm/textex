import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CircleCheck,
  CircleX,
  FileCheck2,
  Info,
  LoaderCircle,
  RefreshCw,
  TriangleAlert
} from 'lucide-react'
import type {
  SubmissionCheckFinding,
  SubmissionCheckResult,
  SubmissionCheckSeverity
} from '../../../shared/submissionCheck'
import { navigateToDiagnostic } from '../../services/diagnosticNavigation'
import { useEditorStore } from '../../store/useEditorStore'
import { useProjectStore } from '../../store/useProjectStore'
import { errorMessage } from '../../utils/errorMessage'
import { ICON_SIZE } from '../ui/IconSystem'

const SEVERITIES: SubmissionCheckSeverity[] = ['error', 'warning', 'info']

function findingLocation(finding: SubmissionCheckFinding): string | null {
  if (!finding.file.trim() || !Number.isSafeInteger(finding.line) || finding.line < 1) return null
  return `${finding.file}:${finding.line}`
}

function FindingIcon({ severity }: { severity: SubmissionCheckSeverity }) {
  if (severity === 'error') return <CircleX size={ICON_SIZE.compact} aria-hidden="true" />
  if (severity === 'warning') {
    return <TriangleAlert size={ICON_SIZE.compact} aria-hidden="true" />
  }
  return <Info size={ICON_SIZE.compact} aria-hidden="true" />
}

function FindingContent({ finding }: { finding: SubmissionCheckFinding }) {
  const location = findingLocation(finding)
  return (
    <>
      <FindingIcon severity={finding.severity} />
      <span className="submission-check-finding-copy">
        <strong>{finding.message}</strong>
        <span>
          <code>{finding.code}</code>
          {location ? <span>{location}</span> : null}
        </span>
      </span>
    </>
  )
}

function FindingRow({ finding }: { finding: SubmissionCheckFinding }) {
  const { t } = useTranslation()
  const location = findingLocation(finding)
  const className = `submission-check-finding ${finding.severity}`

  if (!location) {
    return (
      <div className={className}>
        <FindingContent finding={finding} />
      </div>
    )
  }

  return (
    <button
      type="button"
      className={className}
      aria-label={t('submissionCheck.openFinding', {
        message: finding.message,
        location
      })}
      onClick={() => {
        void navigateToDiagnostic({
          file: finding.file,
          line: finding.line,
          severity: finding.severity,
          message: finding.message
        })
      }}
    >
      <FindingContent finding={finding} />
    </button>
  )
}

export function SubmissionCheckPanel() {
  const { t } = useTranslation()
  const activeFilePath = useEditorStore((state) => state.activeFilePath)
  const projectRoot = useProjectStore((state) => state.projectRoot)
  const [checkTarget, setCheckTarget] = useState(() => ({
    projectRoot,
    rootFile: activeFilePath
  }))
  const rootFile = checkTarget.rootFile
  const requestEpoch = useRef(0)
  const [result, setResult] = useState<SubmissionCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (checkTarget.projectRoot !== projectRoot) {
      setCheckTarget({ projectRoot, rootFile: activeFilePath })
    } else if (!checkTarget.rootFile && activeFilePath) {
      setCheckTarget({ projectRoot, rootFile: activeFilePath })
    }
  }, [activeFilePath, checkTarget.projectRoot, checkTarget.rootFile, projectRoot])

  const runCheck = useCallback(async () => {
    if (!rootFile) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }

    const epoch = ++requestEpoch.current
    setLoading(true)
    setError(null)
    try {
      const nextResult = await window.api.runSubmissionCheck({ rootFile })
      if (requestEpoch.current !== epoch) return
      setResult(nextResult)
    } catch (runError) {
      if (requestEpoch.current !== epoch) return
      setResult(null)
      setError(errorMessage(runError))
    } finally {
      if (requestEpoch.current === epoch) setLoading(false)
    }
  }, [rootFile])

  useEffect(() => {
    void runCheck()
    return () => {
      requestEpoch.current += 1
    }
  }, [runCheck])

  if (!rootFile) {
    return (
      <div className="research-reference-view submission-check-view">
        <div className="submission-check-empty">
          <FileCheck2 size={28} aria-hidden="true" />
          <strong>{t('submissionCheck.noDocument')}</strong>
          <span>{t('submissionCheck.noDocumentHint')}</span>
        </div>
      </div>
    )
  }

  const attentionCount = result ? result.summary.errors + result.summary.warnings : 0
  const passed = Boolean(result && attentionCount === 0)

  return (
    <div className="research-reference-view submission-check-view">
      <div className="submission-check-toolbar">
        <div>
          <strong>{t('submissionCheck.title')}</strong>
          <span title={rootFile}>{rootFile.split(/[\\/]/u).pop()}</span>
        </div>
        <button type="button" onClick={() => void runCheck()} disabled={loading}>
          {loading ? (
            <LoaderCircle className="spin" size={ICON_SIZE.compact} aria-hidden="true" />
          ) : (
            <RefreshCw size={ICON_SIZE.compact} aria-hidden="true" />
          )}
          {t('submissionCheck.rerun')}
        </button>
      </div>

      {loading && !result ? (
        <div className="submission-check-empty" role="status">
          <LoaderCircle className="spin" size={24} aria-hidden="true" />
          <strong>{t('submissionCheck.running')}</strong>
        </div>
      ) : null}

      {error ? (
        <div className="submission-check-empty error" role="alert">
          <CircleX size={24} aria-hidden="true" />
          <strong>{t('submissionCheck.failed')}</strong>
          <span>{error}</span>
          <button type="button" onClick={() => void runCheck()}>
            {t('submissionCheck.retry')}
          </button>
        </div>
      ) : null}

      {result ? (
        <>
          <section className={`submission-check-summary ${passed ? 'passed' : 'issues'}`}>
            {passed ? (
              <CircleCheck size={22} aria-hidden="true" />
            ) : (
              <TriangleAlert size={22} aria-hidden="true" />
            )}
            <div>
              <strong>
                {passed
                  ? t('submissionCheck.passed')
                  : t('submissionCheck.needsAttention', { count: attentionCount })}
              </strong>
              <span>{t('submissionCheck.scannedFiles', { count: result.scannedFiles })}</span>
            </div>
            <dl>
              <div className="error">
                <dt>{t('submissionCheck.errors')}</dt>
                <dd>{result.summary.errors}</dd>
              </div>
              <div className="warning">
                <dt>{t('submissionCheck.warnings')}</dt>
                <dd>{result.summary.warnings}</dd>
              </div>
              <div className="info">
                <dt>{t('submissionCheck.info')}</dt>
                <dd>{result.summary.info}</dd>
              </div>
            </dl>
          </section>

          <div className="submission-check-groups">
            {result.findings.length === 0 ? (
              <div className="submission-check-empty compact">
                <CircleCheck size={22} aria-hidden="true" />
                <strong>{t('submissionCheck.noFindings')}</strong>
              </div>
            ) : (
              SEVERITIES.map((severity) => {
                const findings = result.findings.filter((finding) => finding.severity === severity)
                if (findings.length === 0) return null
                return (
                  <section className="submission-check-group" key={severity}>
                    <h3>
                      {t(`submissionCheck.${severity}Group`)}
                      <span>{findings.length}</span>
                    </h3>
                    {findings.map((finding, index) => (
                      <FindingRow
                        finding={finding}
                        key={`${finding.code}:${finding.file}:${finding.line}:${index}`}
                      />
                    ))}
                  </section>
                )
              })
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
