export type InteractivePayslip = {
  takeHomePay: number;
  taxAmount: number;
  niAmount: number;

  grossPayModule: PayModule;
  taxAndNIModule: PayModule;
  pensionModule: PayModule;
  deductionModule: PayModule;
  netDeductionModule: PayModule;
  netAdditionModule: PayModule;
  taxableBenefitsModule: PayModule;

  payDate: Date;
}

export type PayModule = {
  amount: number;
  moduleLines: ModuleLine[];
}

export type ModuleLine = {
  description: string;
  total: number;
}
