import { Utils } from "@arkecosystem/crypto";

export interface IStakeCreateAsset {
    duration: number;
    amount: Utils.BigNumber;
    timestamp: number;
}

export interface IStakeRedeemAsset {
    id: string;
}

export interface IStakeCancelAsset {
    id: string;
}

export type StakeLevel = "3m" | "6m" | "1y" | "2y";

export interface IStakeTimestamps {
    created: number;
    graceEnd: number;
    powerUp: number;
    redeemable: number;
}

export interface IStakeObject {
    id: string;
    status: "grace" | "canceled" | "active" | "expired" | "redeemed";
    timestamps: IStakeTimestamps;
    duration: number;
    amount: Utils.BigNumber;
    power: Utils.BigNumber;
}

export interface IStakeArray {
    [index: string]: IStakeObject;
}
