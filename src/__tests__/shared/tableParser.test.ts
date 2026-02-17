import { parseLatexTable, generateLatexTable } from '../../shared/tableParser';

describe('Table Parser', () => {
    const simpleTable = `
\\begin{tabular}{|c|c|}
  \\hline
  Head1 & Head2 \\\\
  \\hline
  Cell1 & Cell2 \\\\
  \\hline
\\end{tabular}`;

    it('parses simple table correctly', () => {
        const data = parseLatexTable(simpleTable);
        expect(data.alignment).toBe('|c|c|');
        expect(data.rows).toHaveLength(2);
        expect(data.rows[0]).toEqual(['Head1', 'Head2']);
        expect(data.rows[1]).toEqual(['Cell1', 'Cell2']);
    });

    it('generates table correctly', () => {
        const data = {
            rows: [['A', 'B'], ['C', 'D']],
            alignment: 'l|r'
        };
        const latex = generateLatexTable(data);
        expect(latex).toContain('\\begin{tabular}{l|r}');
        expect(latex).toContain('A & B \\\\');
        expect(latex).toContain('C & D \\\\');
    });
});
