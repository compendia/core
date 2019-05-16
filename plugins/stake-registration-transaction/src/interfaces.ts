import { BigNumber } from "@arkecosystem/crypto/dist/utils";

export interface IStakeRegistrationAsset {
    duration: number;
    cancel: number;
}

export interface IStakeObject {
    start: number;
    amount: BigNumber;
    duration: number;
    weight: BigNumber;
    renewing: boolean;
}
