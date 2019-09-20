import { Interfaces, Utils } from "@nosplatform/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { Logger, Shared } from "../index";
import { IRoundInfo } from "../shared";

export interface IWallet {
    address: string;
    publicKey: string | undefined;
    secondPublicKey: string | undefined;
    balance: Utils.BigNumber;
    vote: string;
    voted: boolean;
    username: string | undefined;
    resigned: boolean;
    lastBlock: any;
    voteBalance: Utils.BigNumber;
    multisignature?: Interfaces.IMultiSignatureAsset;
    ipfsHashes: { [ipfsHash: string]: boolean };
    dirty: boolean;
    producedBlocks: number;
    forgedFees: Utils.BigNumber;
    removedFees: Utils.BigNumber;
    forgedRewards: Utils.BigNumber;
    forgedTopRewards: Utils.BigNumber;
    stakeWeight: Utils.BigNumber;
    stake: StakeInterfaces.IStakeArray;
    rate?: number;

    applyBlock(block: Interfaces.IBlockData): boolean;
    revertBlock(block: Interfaces.IBlockData): boolean;

    auditApply(transaction: Interfaces.ITransactionData): any[];
    toString(): string;

    verifySignatures(
        transaction: Interfaces.ITransactionData,
        multisignature?: Interfaces.IMultiSignatureAsset,
    ): boolean;
}

export type IDelegateWallet = IWallet & { rate: number; round: number };

export interface IWalletManager {
    logger: Logger.ILogger;

    reset(): void;

    allByAddress(): IWallet[];

    allByPublicKey(): IWallet[];

    allByUsername(): IWallet[];

    findById(id: string): IWallet;

    findDelegateById(id: string): IWallet;

    findByAddress(address: string): IWallet;

    has(addressOrPublicKey: string): boolean;

    findByPublicKey(publicKey: string): IWallet;

    findByUsername(username: string): IWallet;

    index(wallets: IWallet[]): void;

    reindex(wallet: IWallet): void;

    clone(): IWalletManager;

    loadActiveDelegateList(roundInfo: IRoundInfo): IDelegateWallet[];

    buildVoteBalances(): void;

    applyBlock(block: Interfaces.IBlock): void;

    buildDelegateRanking(roundInfo?: Shared.IRoundInfo): IDelegateWallet[];

    revertBlock(block: Interfaces.IBlock): void;

    applyTransaction(transaction: Interfaces.ITransaction): void;

    revertTransaction(transaction: Interfaces.ITransaction): void;

    isDelegate(publicKey: string): boolean;

    canBePurged(wallet: IWallet): boolean;

    forgetByAddress(address: string): void;

    forgetByPublicKey(publicKey: string): void;

    forgetByUsername(username: string): void;

    hasByAddress(address: string): boolean;

    hasByPublicKey(publicKey: string): boolean;

    hasByUsername(username: string): boolean;

    purgeEmptyNonDelegates(): void;
}
