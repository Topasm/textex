/** Small, deterministic PDF with real text and a URI annotation, no downloads. */
export function pdfFixture(revision: number): Uint8Array {
  const text = revision === 1 ? 'The efficient method works.' : 'The revised method works.'
  const stream = `BT /F1 18 Tf 60 740 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [6 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Annot /Subtype /Link /Rect [60 680 300 705] /Border [0 0 0] /A << /S /URI /URI (https://example.org/) >> >>'
  ]
  return encodePdf(objects)
}

function encodePdf(objects: string[]): Uint8Array {
  let pdf = '%PDF-1.7\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

/** Real hyperref and biblatex links point at the second-page bibliography. */
export function citationPdfFixture(): Uint8Array {
  const first = 'BT /F1 18 Tf 60 740 Td (Read [1].) Tj 0 -40 Td (Author 2025) Tj 0 -40 Td (Go to section) Tj 0 -40 Td (Missing entry) Tj 0 -40 Td ([1,2]) Tj ET'
  const second = 'BT /F1 18 Tf 60 740 Td (References on page two) Tj ET'
  return encodePdf([
    '<< /Type /Catalog /Pages 2 0 R /Dests << /cite.method2026 [6 0 R /XYZ 60 740 null] /cite.0@author2025 [6 0 R /XYZ 60 700 null] /section.2 [6 0 R /Fit] /cite.missing [6 0 R /Fit] >> >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [8 0 R 9 0 R 10 0 R 11 0 R] >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${first.length} >>\nstream\n${first}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${second.length} >>\nstream\n${second}\nendstream`,
    '<< /Type /Annot /Subtype /Link /Rect [100 736 126 756] /Border [0 0 0] /Dest (cite.method2026) >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 696 180 716] /Border [0 0 0] /Dest (cite.0@author2025) >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 656 180 676] /Border [0 0 0] /Dest (section.2) >>',
    '<< /Type /Annot /Subtype /Link /Rect [60 616 180 636] /Border [0 0 0] /Dest (cite.missing) >>'
  ])
}

/** Matches on pages 12 and 24 are outside the initial virtual render window. */
export function multipagePdfFixture(): Uint8Array {
  const count = 24
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  for (let page = 1; page <= count; page++) {
    const text = page === 12 ? 'Distant target. Distant target.' : page === 24 ? 'Distant target at the end.' : `Page ${page} has ordinary text.`
    const stream = `BT /F1 18 Tf 60 740 Td (${text}) Tj ET`
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (page - 1) * 2} 0 R >>`)
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  }
  return encodePdf(objects)
}
