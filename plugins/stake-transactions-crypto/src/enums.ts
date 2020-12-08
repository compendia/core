export enum StakeTransactionType {
    StakeCreate = 0,
    StakeRedeem = 1,
    StakeCancel = 2,
    StakeExtend = 3,
}

export const StakeTransactionGroup = 100;

export enum StakeTransactionStaticFees {
    StakeCreate = "0",
    StakeRedeem = "0",
    StakeCancel = "0",
    StakeExtend = "0",
}
