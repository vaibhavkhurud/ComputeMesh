export interface ReserveFundsDto {
  jobId: string;
  maxCostCents: string;
}

export interface GetWalletDto {
  type?: 'CUSTOMER' | 'PROVIDER';
}
