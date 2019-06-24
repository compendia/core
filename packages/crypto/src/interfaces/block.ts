import { ITransactionData } from "../interfaces";
import { BigNumber } from "../utils";
import { ITransaction, ITransactionJson } from "./transactions";

export interface IBlockVerification {
    verified: boolean;
    errors: string[];
    containsMultiSignatures: boolean;
}

export interface IBlock {
    serialized: string;
    data: IBlockData;
    transactions: ITransaction[];
    verification: IBlockVerification;

    getHeader(): IBlockData;
    verifySignature(): boolean;
    verify(): IBlockVerification;

    toString(): string;
    toJson(): IBlockJson;
}

// Fee Update:

export interface IBlockData {
    id?: string;
    idHex?: string;

    timestamp: number;
    version: number;
    height: number;
    previousBlockHex?: string;
    previousBlock: string;
    numberOfTransactions: number;
    totalAmount: BigNumber;
    totalFee: BigNumber;
    removedFee: BigNumber;
    reward: BigNumber;
    topReward: BigNumber;
    payloadLength: number;
    payloadHash: string;
    generatorPublicKey: string;

    blockSignature?: string;
    serialized?: string;
    transactions?: ITransactionData[];
}

export interface IBlockJson {
    id?: string;
    idHex?: string;

    timestamp: number;
    version: number;
    height: number;
    previousBlockHex?: string;
    previousBlock: string;
    numberOfTransactions: number;
    totalAmount: string;
    totalFee: string;
    removedFee: string;
    reward: string;
    topReward: string;
    payloadLength: number;
    payloadHash: string;
    generatorPublicKey: string;

    blockSignature?: string;
    serialized?: string;
    transactions?: ITransactionJson[];
}
