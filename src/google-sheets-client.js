import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { config } from './config.js';
import { headers } from './approval-parser.js';

export class GoogleSheetsClient {
  constructor() {
    this.sheets = null;
    this.approvalIdCache = null;
  }

  async auth() {
    if (this.sheets) return this.sheets;

    let credentials;
    if (config.google.serviceAccountJson) {
      credentials = JSON.parse(config.google.serviceAccountJson);
    } else {
      const raw = await fs.readFile(path.resolve(config.google.credentialsPath), 'utf8');
      credentials = JSON.parse(raw);
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    return this.sheets;
  }

  sheetName() {
    return config.google.range.split('!')[0] || 'Approvals';
  }

  async ensureHeader() {
    const sheets = await this.auth();
    const range = `${this.sheetName()}!A1:K1`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range,
    });

    const existing = response.data.values?.[0] || [];
    if (existing.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.google.sheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
    }
  }

  async loadApprovalIds() {
    if (this.approvalIdCache) return this.approvalIdCache;

    const sheets = await this.auth();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: `${this.sheetName()}!A:A`,
    });

    const rows = response.data.values || [];
    this.approvalIdCache = new Set(rows.slice(1).map((row) => row[0]).filter(Boolean));
    return this.approvalIdCache;
  }

  async getRows() {
    const sheets = await this.auth();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.google.sheetId,
      range: config.google.range,
    });

    return response.data.values || [];
  }

  async hasApprovalId(approvalInstanceId) {
    const ids = await this.loadApprovalIds();
    return ids.has(approvalInstanceId);
  }

  async appendRow(row) {
    await this.ensureHeader();
    const sheets = await this.auth();
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.sheetId,
      range: config.google.range,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    if (this.approvalIdCache) this.approvalIdCache.add(row[0]);
  }

  async updateRows(updates) {
    if (!updates.length) return;

    const sheets = await this.auth();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map(({ rowNumber, row }) => ({
          range: `${this.sheetName()}!A${rowNumber}:K${rowNumber}`,
          values: [row],
        })),
      },
    });

    this.approvalIdCache = null;
  }

  async updateCells(updates) {
    if (!updates.length) return;

    const sheets = await this.auth();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates.map(({ range, value }) => ({
          range,
          values: [[value]],
        })),
      },
    });
  }
}
