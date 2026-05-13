/** Tylko bezpieczne fragmenty identyfikatorów SQL: [a-zA-Z0-9_] */
export function assertSqlIdentifier(name: string, label: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`[ANALYTICS_SQL] invalid ${label} identifier`);
  }
  return name;
}
