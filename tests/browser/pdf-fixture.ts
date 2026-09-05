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
