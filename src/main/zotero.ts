

import { ZoteroSearchResult } from '../shared/types'

interface ZoteroCreator {
    creatorType: string
    firstName?: string
    lastName?: string
    name?: string
}

interface ZoteroItem {
    citekey: string
    title?: string
    creators?: ZoteroCreator[]
    date?: string
    itemType?: string
}

const DEFAULT_PORT = 23119
const BASE_URL = (port: number) => `http://127.0.0.1:${port}/better-bibtex`

/**
 * Probe whether Zotero + BBT is running.
 */
export async function zoteroProbe(port = DEFAULT_PORT): Promise<boolean> {
    try {
        const response = await fetch(`${BASE_URL(port)}/cayw?probe=true`, {
            signal: AbortSignal.timeout(2000)
        })
        return response.ok
    } catch {
        return false
    }
}

/**
 * Open Zotero's native CAYW picker and return \cite{keys}.
 * This request blocks until the user selects items in Zotero and closes the picker.
 */
export async function zoteroCiteCAYW(port = DEFAULT_PORT): Promise<string> {
    try {
        const response = await fetch(`${BASE_URL(port)}/cayw?format=latex`, {
            signal: AbortSignal.timeout(300_000) // 5 min timeout for user interaction
        })

        if (!response.ok) {
            throw new Error(`CAYW failed: ${response.status} ${response.statusText}`)
        }

        return await response.text()
    } catch (error) {
        console.error('Zotero CAYW error:', error)
        throw error
    }
}

/**
 * Search Zotero library by term. Returns matching items with citekeys.
 */
export async function zoteroSearch(
    term: string,
    port = DEFAULT_PORT
): Promise<ZoteroSearchResult[]> {
    try {
        const response = await fetch(`${BASE_URL(port)}/json-rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'item.search',
                params: [term]
            })
        })

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status} ${response.statusText}`)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await response.json() as any



        // ...

        // BBT item.search returns an array of objects with citekey + metadata
        return (data.result || []).map((item: ZoteroItem) => ({
            citekey: item.citekey,
            title: item.title || '',
            author: formatAuthors(item.creators || []),
            year: item.date ? extractYear(item.date) : '',
            type: item.itemType || 'misc'
        }))
    } catch (error) {
        console.error('Zotero search error:', error)
        return []
    }
}

/**
 * Export selected items as BibTeX string via JSON-RPC.
 * Used to append entries to the project's .bib file.
 */
export async function zoteroExportBibtex(
    citekeys: string[],
    port = DEFAULT_PORT
): Promise<string> {
    try {
        const response = await fetch(`${BASE_URL(port)}/json-rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'item.export',
                params: [citekeys, 'betterbibtex']
            })
        })

        if (!response.ok) {
            throw new Error(`Export failed: ${response.status} ${response.statusText}`)
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await response.json() as any
        return data.result || ''
    } catch (error) {
        console.error('Zotero export error:', error)
        throw error
    }
}

function formatAuthors(creators: ZoteroCreator[]): string {
    return creators
        .filter(c => c.creatorType === 'author')
        .map(c => c.name || `${c.lastName}, ${c.firstName}`)
        .join('; ')
}

function extractYear(date: string): string {
    const match = date.match(/\d{4}/)
    return match ? match[0] : ''
}
