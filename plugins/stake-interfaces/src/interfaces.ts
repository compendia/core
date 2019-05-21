import { Utils } from "@arkecosystem/crypto";

export interface IStakeObject {
    amount: Utils.BigNumber;
    duration: number;
    weight: Utils.BigNumber;
    claimableTimestamp: number;
    claimed: boolean;
}

export interface IStakeArray {
    [index: number]: IStakeObject;
}
