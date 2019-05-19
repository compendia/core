import { Utils } from "@arkecosystem/crypto";

export interface IStakeObject {
    start: number;
    amount: Utils.BigNumber;
    duration: number;
    weight: Utils.BigNumber;
    claimableTimestamp: number;
    claimed: boolean;
}
