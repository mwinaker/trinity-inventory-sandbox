export function isCalendarDate(value: unknown): boolean
export function getOperationalDataQualityIssues(
  billets: Array<{ id: string; barcode?: string; deliveryDate?: string; weight?: number | '' }>,
  players: Array<{ id: string; playerName?: string; bats?: Array<{ length?: number | '' }> }>,
): Array<{ kind: string; label: string; recordId: string }>
