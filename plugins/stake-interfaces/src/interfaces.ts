import { Utils } from "@arkecosystem/crypto";

export type StakeLevel = "3m" | "6m" | "1y" | "2y";

export interface IStakeObject {
    amount: Utils.BigNumber;
    duration: number;
    weight: Utils.BigNumber;
    redeemableTimestamp: number;
    redeemed: boolean;
}

export interface IStakeArray {
    [index: number]: IStakeObject;
}
