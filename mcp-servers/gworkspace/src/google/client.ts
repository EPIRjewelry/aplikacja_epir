import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { googleDocToMarkdown } from '../convert/docs-to-markdown.js';
import { compressForContext } from '../convert/context-window.js';
import { sheetValuesToCsv } from '../convert/sheets-to-csv.js';
import type { GoogleDocument } from './types.js';

export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
};

export class GWorkspaceClient {
  constructor(private readonly auth: OAuth2Client) {}

  static async create(): Promise<GWorkspaceClient> {
    const { getAuthorizedClient } = await import('../auth/oauth.js');
    const auth = await getAuthorizedClient();
    return new GWorkspaceClient(auth);
  }

  async getFileMetadata(fileId: string): Promise<DriveFileMeta> {
    const drive = google.drive({ version: 'v3', auth: this.auth });
    const res = await drive.files.get({
      fileId,
      fields: 'id,name,mimeType,webViewLink,modifiedTime',
      supportsAllDrives: true,
    });
    return {
      id: res.data.id ?? fileId,
      name: res.data.name ?? '',
      mimeType: res.data.mimeType ?? 'application/octet-stream',
      webViewLink: res.data.webViewLink ?? undefined,
      modifiedTime: res.data.modifiedTime ?? undefined,
    };
  }

  async readDocAsMarkdown(fileId: string, maxChars?: number): Promise<{
    markdown: string;
    meta: DriveFileMeta;
    truncated: boolean;
    originalLength: number;
  }> {
    const meta = await this.getFileMetadata(fileId);
    const docs = google.docs({ version: 'v1', auth: this.auth });
    const res = await docs.documents.get({ documentId: fileId });
    const md = googleDocToMarkdown(res.data as GoogleDocument);
    const windowed = compressForContext(md, maxChars);
    return {
      markdown: windowed.text,
      meta,
      truncated: windowed.truncated,
      originalLength: windowed.originalLength,
    };
  }

  async readSheetAsCsv(
    spreadsheetId: string,
    range = 'Sheet1',
    maxChars?: number,
  ): Promise<{
    csv: string;
    meta: DriveFileMeta;
    truncated: boolean;
    originalLength: number;
  }> {
    const meta = await this.getFileMetadata(spreadsheetId);
    const sheets = google.sheets({ version: 'v4', auth: this.auth });
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const csv = sheetValuesToCsv((res.data.values ?? []) as (string | number | boolean | null)[][]);
    const windowed = compressForContext(csv, maxChars);
    return {
      csv: windowed.text,
      meta,
      truncated: windowed.truncated,
      originalLength: windowed.originalLength,
    };
  }

  /** Eksport tekstu (np. SVG/Markdown) — nowy plik na Dysku (async bridge Project B). */
  async createTextFile(params: {
    name: string;
    content: string;
    mimeType?: string;
    parentFolderId?: string;
  }): Promise<DriveFileMeta> {
    const drive = google.drive({ version: 'v3', auth: this.auth });
    const res = await drive.files.create({
      requestBody: {
        name: params.name,
        mimeType: params.mimeType ?? 'text/plain',
        parents: params.parentFolderId ? [params.parentFolderId] : undefined,
      },
      media: {
        mimeType: params.mimeType ?? 'text/plain',
        body: params.content,
      },
      fields: 'id,name,mimeType,webViewLink,modifiedTime',
      supportsAllDrives: true,
    });
    return {
      id: res.data.id ?? '',
      name: res.data.name ?? params.name,
      mimeType: res.data.mimeType ?? params.mimeType ?? 'text/plain',
      webViewLink: res.data.webViewLink ?? undefined,
      modifiedTime: res.data.modifiedTime ?? undefined,
    };
  }
}
