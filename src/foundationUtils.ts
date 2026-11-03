export interface SqlTableSummary {
  name: string;
  columns: string[];
  primaryKey: string;
}

export interface PytestSummary {
  passed: number;
  failed: number;
  rawExitZero: boolean;
}

/**
 * Extracts table names, column declarations, and primary keys from a SQLite DDL script.
 */
export function parseSqlSchemaTables(sql: string): SqlTableSummary[] {
  const tables: SqlTableSummary[] = [];
  const createTableRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;

  let match: RegExpExecArray | null = createTableRegex.exec(sql);
  while (match !== null) {
    const tableName = match[1];
    const body = match[2];
    const lines = body
      .split('\n')
      .map((line) => line.trim().replace(/,$/, ''))
      .filter((line) => line.length > 0 && !line.startsWith('--'));

    const columns: string[] = [];
    let primaryKey = '';

    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.startsWith('PRIMARY KEY')) {
        primaryKey = line;
      } else if (upper.startsWith('FOREIGN KEY') || upper.startsWith('CONSTRAINT')) {
        continue;
      } else {
        const colName = line.split(/\s+/)[0];
        if (colName) {
          columns.push(colName);
        }
        if (upper.includes('PRIMARY KEY') && !primaryKey) {
          primaryKey = `${colName} (PRIMARY KEY)`;
        }
      }
    }

    tables.push({
      name: tableName,
      columns,
      primaryKey: primaryKey || 'rowid',
    });

    match = createTableRegex.exec(sql);
  }

  return tables;
}

/**
 * Parses pytest summary counts from CLI stdout.
 */
export function parsePytestOutput(stdout: string, exitCode: number): PytestSummary {
  const passedMatch = stdout.match(/(\d+)\s+passed/i);
  const failedMatch = stdout.match(/(\d+)\s+failed/i);

  return {
    passed: passedMatch ? Number(passedMatch[1]) : 0,
    failed: failedMatch ? Number(failedMatch[1]) : 0,
    rawExitZero: exitCode === 0,
  };
}
