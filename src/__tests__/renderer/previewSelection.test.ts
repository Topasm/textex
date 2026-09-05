import { describe, expect, it } from 'vitest'
import { findPreviewText, previewSourceRange } from '../../renderer/utils/previewSelection'

describe('PDF selection source matching', () => {
  it('maps wrapped PDF text and ligatures back to exact source columns', () => {
    expect(
      previewSourceRange('Heading\nThe efficient method works.\nEnd', 'efﬁcient\nmethod', 2, 2)
    ).toEqual({
      start: { line: 2, column: 5 },
      end: { line: 2, column: 21 }
    })
    expect(previewSourceRange('One sentence\ncontinues here.', 'sentence continues', 2, 1)).toEqual(
      {
        start: { line: 1, column: 5 },
        end: { line: 2, column: 10 }
      }
    )
  })

  it('uses source lines for macros or ambiguous matches without searching unrelated passages', () => {
    expect(previewSourceRange('Hello\n\\greeting{}\nHello', 'Hello', 2, 2)).toEqual({
      start: { line: 2, column: 1 },
      end: { line: 2, column: 12 }
    })
    expect(findPreviewText('repeat repeat', 'repeat')).toBeNull()
    expect(previewSourceRange('Hello', 'Hello', 0, 1)).toBeNull()
    expect(previewSourceRange('Hello', 'Hello', 1, 20)).toBeNull()
  })
})
