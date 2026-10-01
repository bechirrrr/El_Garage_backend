import { IsIn } from 'class-validator';
import { WorkOrderStatus } from '../../../generated/prisma/client.js';

export class UpdateWorkOrderStatusDto {
  @IsIn(Object.values(WorkOrderStatus))
  status!: WorkOrderStatus;
}
