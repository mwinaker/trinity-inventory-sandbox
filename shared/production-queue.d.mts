export type ProductionQueueJob = {
  itemType?: string
  productTitle?: string
  productionStatus?: string
  fulfillmentStatus?: string
}

export function isProductionBatJob(job: ProductionQueueJob | null | undefined): boolean
export function isActionableProductionJob(job: ProductionQueueJob | null | undefined): boolean
