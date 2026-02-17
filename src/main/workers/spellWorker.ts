import { parentPort } from 'worker_threads'
import nspell from 'nspell'
import fs from 'fs/promises'

let spell: ReturnType<typeof nspell> | null = null

interface WorkerMessage {
  type: 'init' | 'check' | 'suggest' | 'add'
  id: number
  affPath?: string
  dicPath?: string
  words?: string[]
  word?: string
}

parentPort?.on('message', async (msg: WorkerMessage) => {
  const { id } = msg

  switch (msg.type) {
    case 'init': {
      try {
        const [affData, dicData] = await Promise.all([
          fs.readFile(msg.affPath!, 'utf-8'),
          fs.readFile(msg.dicPath!, 'utf-8')
        ])
        spell = nspell(affData, dicData)
        parentPort?.postMessage({ type: 'init', id, success: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        parentPort?.postMessage({ type: 'init', id, success: false, error: message })
      }
      break
    }
    case 'check': {
      if (!spell) {
        parentPort?.postMessage({ type: 'check', id, misspelled: [] })
        return
      }
      // Deduplicate words before checking
      const uniqueWords = [...new Set(msg.words!)]
      const misspelled = uniqueWords.filter((w) => !spell!.correct(w))
      parentPort?.postMessage({ type: 'check', id, misspelled })
      break
    }
    case 'suggest': {
      if (!spell) {
        parentPort?.postMessage({ type: 'suggest', id, suggestions: [] })
        return
      }
      const suggestions = spell.suggest(msg.word!).slice(0, 5)
      parentPort?.postMessage({ type: 'suggest', id, suggestions })
      break
    }
    case 'add': {
      if (spell) {
        spell.add(msg.word!)
      }
      parentPort?.postMessage({ type: 'add', id, success: true })
      break
    }
  }
})
