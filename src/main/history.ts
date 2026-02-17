import { promises as fs } from 'fs';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import type { HistoryItem } from '../shared/types';

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export async function saveSnapshot(filePath: string, content: string): Promise<void> {
    try {
        const projectRoot = path.dirname(filePath); // Assumes generic project structure
        const fileName = path.basename(filePath);
        const historyDir = path.join(projectRoot, '.textex', 'history', fileName);

        await fs.mkdir(historyDir, { recursive: true });

        const timestamp = Date.now();
        const snapshotPath = path.join(historyDir, `${timestamp}.gz`);

        const compressed = await gzip(content);
        await fs.writeFile(snapshotPath, compressed);

        // Optional: Prune old history (keep last 50)
        const files = await fs.readdir(historyDir);
        if (files.length > 50) {
            const sorted = files.sort((a, b) => parseInt(a) - parseInt(b));
            for (let i = 0; i < files.length - 50; i++) {
                await fs.unlink(path.join(historyDir, sorted[i]));
            }
        }
    } catch (error) {
        if (isDev) console.error('Failed to save snapshot:', error);
    }
}

export async function getHistoryList(filePath: string): Promise<HistoryItem[]> {
    try {
        const projectRoot = path.dirname(filePath);
        const fileName = path.basename(filePath);
        const historyDir = path.join(projectRoot, '.textex', 'history', fileName);

        try {
            await fs.access(historyDir);
        } catch {
            return [];
        }

        const files = await fs.readdir(historyDir);
        const items: HistoryItem[] = [];

        for (const file of files) {
            if (!file.endsWith('.gz')) continue;

            const stat = await fs.stat(path.join(historyDir, file));
            const timestamp = parseInt(file.replace('.gz', ''));

            if (!isNaN(timestamp)) {
                items.push({
                    timestamp,
                    size: stat.size,
                    path: path.join(historyDir, file)
                });
            }
        }

        return items.sort((a, b) => b.timestamp - a.timestamp); // Newest first
    } catch (error) {
        if (isDev) console.error('Failed to get history list:', error);
        return [];
    }
}

export async function loadSnapshot(snapshotPath: string): Promise<string> {
    try {
        const buffer = await fs.readFile(snapshotPath);
        const decoded = await gunzip(buffer);
        return decoded.toString();
    } catch (error) {
        if (isDev) console.error('Failed to load snapshot:', error);
        throw error;
    }
}
