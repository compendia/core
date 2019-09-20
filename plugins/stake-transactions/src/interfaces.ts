import { Utils } from "@nosplatform/crypto";

export interface IStakeCreateAsset {
    duration: number;
    amount: Utils.BigNumber;
    timestamp: number;
}

export interface IBlockTimeAsset {
    blockTime: number;
}
