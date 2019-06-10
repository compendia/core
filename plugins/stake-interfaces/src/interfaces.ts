import { Utils } from "@arkecosystem/crypto";

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
