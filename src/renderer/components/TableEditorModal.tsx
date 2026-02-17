import React, { useState, useMemo } from 'react';
import { DataGrid, Column, RenderEditCellProps } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { parseLatexTable, generateLatexTable, TableData } from '../../shared/tableParser';
import './TableEditorModal.css'; // We'll need to create this for basic styling if needed

interface Props {
    initialLatex: string;
    onApply: (newLatex: string) => void;
    onClose: () => void;
}

interface Row {
    [key: string]: string;
}

export const TableEditorModal: React.FC<Props> = ({ initialLatex, onApply, onClose }) => {
    // Parse initial LaTeX
    const initialData = useMemo(() => parseLatexTable(initialLatex), [initialLatex]);

    // Convert TableData to DataGrid format
    const [rows, setRows] = useState<Row[]>(() => {
        return initialData.rows.map((row) => {
            const rowObj: Row = {};
            row.forEach((cell, idx) => {
                rowObj[`col${idx}`] = cell;
            });
            return rowObj;
        });
    });

    const [columns, setColumns] = useState<Column<Row>[]>(() => {
        if (initialData.rows.length === 0) return [];
        // Determine max columns
        const maxCols = Math.max(...initialData.rows.map(r => r.length));
        return Array.from({ length: maxCols }).map((_, i) => ({
            key: `col${i}`,
            name: `Col ${i + 1}`,
            editable: true,
            resizable: true,
            editor: textEditor
        }));
    });

    const handleRowsChange = (newRows: Row[]) => {
        setRows(newRows);
    };

    const handleApply = () => {
        // Convert back to TableData
        const newTableData: TableData = {
            alignment: initialData.alignment, // Preserve alignment for now
            rows: rows.map(row => {
                return columns.map(col => row[col.key] || '');
            })
        };
        const newLatex = generateLatexTable(newTableData);
        onApply(newLatex);
    };

    return (
        <div className="table-editor-overlay">
            <div className="table-editor-modal">
                <div className="table-editor-header">
                    <h3>Visual Table Editor</h3>
                    <button onClick={onClose} className="close-btn">×</button>
                </div>

                <div className="table-editor-grid-container">
                    <DataGrid
                        columns={columns}
                        rows={rows}
                        onRowsChange={handleRowsChange}
                        className="rdg-light" // Force light theme or add dark mode support later
                    />
                </div>

                <div className="table-editor-footer">
                    <button onClick={onClose} className="cancel-btn">Cancel</button>
                    <button onClick={handleApply} className="apply-btn">Apply Changes</button>
                </div>
            </div>
        </div>
    );
};

// Simple text editor for cells
function textEditor({ row, column, onRowChange, onClose }: RenderEditCellProps<Row>) {
    return (
        <input
            className="rdg-text-editor"
            ref={(input) => input?.focus()}
            value={row[column.key]}
            onChange={(e) => onRowChange({ ...row, [column.key]: e.target.value })}
            onBlur={() => onClose(true)}
        />
    );
}
