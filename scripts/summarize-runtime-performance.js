#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const jsonOutput = args.includes('--json')
const reportPaths = args.filter((arg) => arg !== '--json')

if (reportPaths.length === 0) {
  console.error('Usage: node scripts/summarize-runtime-performance.js <report.json...> [--json]')
  process.exit(1)
}

const metricNames = [
  'startup.shellInteractive',
  'startup.editorInteractive',
  'editor.inputToFrame',
  'pipeline.editToPdfPage',
  'pdf.scrollFrame',
  'renderer.longTask'
]

function percentile(sorted, ratio) {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index]
}

function round(value) {
  return value === null ? null : Math.round(value * 100) / 100
}

function summarize(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (sorted.length === 0) return null
  const total = sorted.reduce((sum, value) => sum + value, 0)
  return {
    count: sorted.length,
    minMs: round(sorted[0]),
    meanMs: round(total / sorted.length),
    p50Ms: round(percentile(sorted, 0.5)),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1])
  }
}

function readReport(reportPath) {
  const resolvedPath = path.resolve(reportPath)
  const report = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'))
  if (report.schemaVersion !== 1 || !report.samples || !report.memory) {
    throw new Error(`Unsupported runtime performance report: ${resolvedPath}`)
  }
  return { path: resolvedPath, report }
}

function last(items) {
  return Array.isArray(items) && items.length > 0 ? items[items.length - 1] : null
}

try {
  const reports = reportPaths.map(readReport)
  const metrics = {}

  for (const metric of metricNames) {
    const values = reports.flatMap(({ report }) =>
      Array.isArray(report.samples[metric]) ? report.samples[metric] : []
    )
    const summary = summarize(values)
    if (summary) metrics[metric] = summary
  }

  const workingSetKiB = reports
    .map(({ report }) => last(report.memory.application)?.totalWorkingSetKiB)
    .filter(Number.isFinite)
  const privateKiB = reports
    .map(({ report }) => last(report.memory.application)?.totalPrivateKiB)
    .filter(Number.isFinite)
  const usedJsHeapBytes = reports
    .map(({ report }) => last(report.memory.renderer)?.usedJsHeapBytes)
    .filter(Number.isFinite)

  const result = {
    schemaVersion: 1,
    reportCount: reports.length,
    reports: reports.map(({ path: reportPath, report }) => ({
      path: reportPath,
      generatedAt: report.generatedAt,
      runtime: report.runtime
    })),
    metrics,
    memoryMedian: {
      totalWorkingSetKiB: round(percentile(workingSetKiB.sort((a, b) => a - b), 0.5)),
      totalPrivateKiB: round(percentile(privateKiB.sort((a, b) => a - b), 0.5)),
      usedJsHeapBytes: round(percentile(usedJsHeapBytes.sort((a, b) => a - b), 0.5))
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Runtime reports: ${result.reportCount}`)
    console.table(result.metrics)
    console.log('Memory median:', result.memoryMedian)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
