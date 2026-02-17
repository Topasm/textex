import React, { useState, useEffect } from 'react';
import { DataGrid } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { parseLatexTable, generateLatexTable, TableData } from '../../shared/tableParser';

interface Props {
    initialLatex: string;
    onApply: (newLatex: string) => void;
    onClose: () => void;
}

interface GridRow {
    [key: string]: string;
}

export const TableEditorModal = ({ initialLatex, onApply, onClose }: Props) => {
    const [data, setData] = useState<TableData>({ rows: [], alignment: '' });
    const [columns, setColumns] = useState<any[]>([]);
    const [rows, setRows] = useState<GridRow[]>([]);

    useEffect(() => {
        const parsed = parseLatexTable(initialLatex);
        setData(parsed);

        if (parsed.rows.length > 0) {
            const cols = parsed.rows[0].map((_, i) => ({
                key: `${i}`,
                name: `Col ${i + 1}`,
                editable: true,
                resizable: true,
            }));
            setColumns(cols);

            const gridRows = parsed.rows.map((row) => {
                const rowObj: GridRow = {};
                row.forEach((cell, idx) => {
                    rowObj[`${idx}`] = cell;
                });
                return rowObj;
            });
            setRows(gridRows);
        }
    }, [initialLatex]);

    const handleRowsChange = (newRows: GridRow[]) => {
        setRows(newRows);
    };

    const handleApply = () => {
        // Convert back to TableData
        const newRows = rows.map((row) => {
            // Ensure we extract values in order of columns
            return columns.map(col => row[col.key] || '');
        });

        // We keep the original alignment for now. 
        // Future improvement: Allow editing alignment.
        const newLatex = generateLatexTable({ ...data, rows: newRows });
        onApply(newLatex);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-[#2e2e2e] p-6 rounded-lg shadow-xl w-[80vw] h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold dark:text-white">Edit Table Visually</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-auto bg-white dark:bg-[#1e1e1e]">
                    {columns.length > 0 ? (
                        <DataGrid
                            columns={columns}
                            rows={rows}
                            onRowsChange={handleRowsChange}
                            className="rdg-light dark:rdg-dark h-full"
                        />
                    ) : (
                        <div className="text-center p-10 text-gray-500">No data found or invalid table format.</div>
                    )}
                </div>

                <div className="mt-4 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApply}
                        className="px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white"
                    >
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
