import { Utils } from "@arkecosystem/crypto";

export interface IStakeCreateAsset {
    duration: number;
    amount: Utils.BigNumber;
    timestamp: number;
}

export interface IStakeRedeemAsset {
    id: string;
}

export type StakeLevel = "3m" | "6m" | "1y" | "2y";

export interface IStakeObject {
    id: string;
    timestamp: number;
    amount: Utils.BigNumber;
    duration: number;
    power: Utils.BigNumber;
    halved: boolean;
    redeemableTimestamp: number;
    redeemed: boolean;
}

export interface IStakeArray {
    [index: string]: IStakeObject;
}
