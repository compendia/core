import { Utils } from "@nosplatform/crypto";

export type StakeLevel = "3m" | "6m" | "1y" | "2y";

export interface IStakeObject {
    timestamp: number;
    amount: Utils.BigNumber;
    duration: number;
    weight: Utils.BigNumber;
    halved: boolean;
    redeemableTimestamp: number;
    redeemed: boolean;
}

export interface IStakeArray {
    [index: number]: IStakeObject;
}
