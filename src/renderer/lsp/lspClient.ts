/**
 * Backward-compatible wrapper around the LspClient class.
 * All 30+ import sites continue working without changes.
 */
import { lspClient } from './LspServiceImpl'
import type { MonacoInstance } from './types'
import type { DocumentSymbolNode } from '../../shared/types'

export function sendRequest(method: string, params: unknown, timeoutMs?: number): Promise<unknown> {
  return lspClient.sendRequest(method, params, timeoutMs)
}

export function currentDocUri(): string {
  return lspClient.currentDocUri()
}

export function isInitialized(): boolean {
  return lspClient.initialized
}

export async function startLspClient(
  workspaceRoot: string,
  monacoInstance: MonacoInstance,
  getDocUri: () => string | null,
  getDocContent: () => string
): Promise<void> {
  return lspClient.start(workspaceRoot, monacoInstance, getDocUri, getDocContent)
}

export function stopLspClient(): void {
  lspClient.stop()
}

export function isLspRunning(): boolean {
  return lspClient.initialized
}

export function lspNotifyDidOpen(filePath: string, content: string): void {
  lspClient.notifyDidOpen(filePath, content)
}

export function lspNotifyDidChange(filePath: string, content: string): void {
  lspClient.notifyDidChange(filePath, content)
}

export function lspNotifyDidSave(filePath: string): void {
  lspClient.notifyDidSave(filePath)
}

export function lspNotifyDidClose(filePath: string): void {
  lspClient.notifyDidClose(filePath)
}

export async function lspRequestDocumentSymbols(filePath: string): Promise<DocumentSymbolNode[]> {
  return lspClient.requestDocumentSymbols(filePath)
}
