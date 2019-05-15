import { BigNumber } from "../../../packages/crypto/dist/utils";

export interface IStakeRegistrationAsset {
    duration: number;
}

export interface IStakeObject {
    start: number;
    amount: BigNumber;
    duration: number;
    weight: BigNumber;
    renewing: boolean;
}
