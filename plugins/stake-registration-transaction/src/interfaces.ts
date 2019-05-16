import { Utils } from "@arkecosystem/crypto";

export interface IStakeRegistrationAsset {
    duration: number;
    cancel: number;
}

export interface IStakeObject {
    start: number;
    amount: Utils.BigNumber;
    duration: number;
    weight: Utils.BigNumber;
    renewing: boolean;
}
