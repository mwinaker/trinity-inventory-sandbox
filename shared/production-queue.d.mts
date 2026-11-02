export type ProductionQueueJob = {
  itemType?: string
  productTitle?: string
  productionStatus?: string
  fulfillmentStatus?: string
  financialStatus?: string
  test?: boolean
  cancelledAt?: string
}

export function isProductionBatJob(job: ProductionQueueJob | null | undefined): boolean
export function isActionableProductionJob(job: ProductionQueueJob | null | undefined): boolean
export function isConfirmedProductionJob(job: ProductionQueueJob | null | undefined): boolean
