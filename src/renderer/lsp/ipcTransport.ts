import {
  AbstractMessageReader,
  AbstractMessageWriter,
  DataCallback,
  Message,
  MessageReader,
  MessageWriter,
  Disposable
} from 'vscode-jsonrpc'

export class IpcMessageReader extends AbstractMessageReader implements MessageReader {
  private callback: DataCallback | null = null

  listen(callback: DataCallback): Disposable {
    this.callback = callback
    window.api.onLspMessage((message: object) => {
      this.callback?.(message as Message)
    })
    return {
      dispose: () => {
        this.callback = null
        window.api.removeLspMessageListener()
      }
    }
  }
}

export class IpcMessageWriter extends AbstractMessageWriter implements MessageWriter {
  async write(msg: Message): Promise<void> {
    try {
      await window.api.lspSend(msg as object)
    } catch (err) {
      this.fireError(
        err instanceof Error ? err : new Error(String(err))
      )
    }
  }

  end(): void {
    // nothing to do
  }
}
