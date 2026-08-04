export type SalesDashboardWindowRange = '30' | '90' | 'all' | 'custom'

export type SalesDashboardWindow = {
  range: SalesDashboardWindowRange
  windowDays: number | null
  since: string
  through: string
  cacheKey: string
}

export function resolveSalesDashboardWindow(
  input?: {
    range?: SalesDashboardWindowRange
    since?: string
    through?: string
  },
  now?: Date | number | string,
): SalesDashboardWindow

export function isTimestampInsideSalesDashboardWindow(
  value: Date | number | string,
  window: Pick<SalesDashboardWindow, 'since' | 'through'> | null | undefined,
): boolean
