import { Utils } from "@arkecosystem/crypto";

export interface IStakeCreateAsset {
    duration: number;
    amount: Utils.BigNumber;
}

export interface IBlockTimeAsset {
    blockTime: number;
}
