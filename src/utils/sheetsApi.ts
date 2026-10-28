import {
  SheetStudentRecord,
  formatStudentRowForSheet,
  parseSheetRowsToRecords,
} from './omrLogic';

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheetNames: string[];
  spreadsheetUrl: string;
}

/**
 * Fetches spreadsheet metadata including its title and available sheet/tab names.
 */
export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Failed to load Google Sheet (HTTP ${res.status})`
    );
  }

  const data = await res.json();
  const sheetNames: string[] =
    data.sheets?.map((s: any) => s.properties?.title).filter(Boolean) || [
      'Sheet1',
    ];

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'Untitled OMR Sheet',
    sheetNames,
    spreadsheetUrl:
      data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Creates a brand new Google Sheet pre-formatted with the exact 8 columns:
 * আইডি | নাম | স্কুল | মোবাইল | Right | Wrong | Empty | Total
 * and optional starter student rows.
 */
export async function createOMRGoogleSheet(
  title: string,
  initialRecords: SheetStudentRecord[],
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const createRes = await fetch(SHEETS_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: {
            title: 'OMR_Results',
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(
      err?.error?.message ||
        `Failed to create new Google Sheet (HTTP ${createRes.status})`
    );
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const tabName =
    created.sheets?.[0]?.properties?.title || 'OMR_Results';

  const headerRow = [
    'আইডি',
    'নাম',
    'স্কুল',
    'মোবাইল',
    'Right',
    'Wrong',
    'Empty',
    'Total',
  ];

  const valueRows = [
    headerRow,
    ...initialRecords.map((rec) => formatStudentRowForSheet(rec)),
  ];

  await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${tabName}!A1:H${valueRows.length}`)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: valueRows,
      }),
    }
  );

  return {
    spreadsheetId,
    title: created.properties?.title || title,
    sheetNames: [tabName],
    spreadsheetUrl:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Reads all rows A:H from the selected Google Sheet tab and parses them into SheetStudentRecord[].
 */
export async function readStudentRecordsFromSheet(
  spreadsheetId: string,
  sheetTabName: string,
  accessToken: string
): Promise<SheetStudentRecord[]> {
  const range = `${sheetTabName}!A1:H500`;
  const res = await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Failed to read rows from Google Sheet (${res.status})`
    );
  }

  const data = await res.json();
  const rows: (string | number)[][] = data.values || [];
  return parseSheetRowsToRecords(rows);
}

/**
 * Writes the full list of student records (including header row) back to the Google Sheet.
 * Must be triggered after user confirmation per Workspace destructive/mutating operation rules.
 */
export async function syncAllStudentRecordsToSheet(
  spreadsheetId: string,
  sheetTabName: string,
  records: SheetStudentRecord[],
  accessToken: string
): Promise<void> {
  const headerRow = [
    'আইডি',
    'নাম',
    'স্কুল',
    'মোবাইল',
    'Right',
    'Wrong',
    'Empty',
    'Total',
  ];

  const values = [
    headerRow,
    ...records.map((r) => formatStudentRowForSheet(r)),
  ];

  const range = `${sheetTabName}!A1:H${values.length}`;
  const res = await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Failed to update Google Sheet (${res.status})`
    );
  }
}
