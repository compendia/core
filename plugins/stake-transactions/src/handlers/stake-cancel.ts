import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nos/stake-interfaces";
import { StakeAlreadyCanceledError, StakeNotFoundError, WalletHasNoStakeError } from "../errors";
import { StakeCancelTransaction } from "../transactions";

export class StakeCancelHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeCancelTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const transactions = await connection.transactionsRepository.getAssetsByType(this.getConstructor().type);
        for (const t of transactions) {
            const wallet = walletManager.findByPublicKey(t.senderPublicKey);
            // Get wallet stake if it exists
            const s = t.asset.stakeCancel;
            const blockTime = s.blockTime;
            const sender = wallet;
            const stake = (sender as any).stake[blockTime];
            let x = stake.start;
            while (x < 315576000) {
                // Remove stake weight
                (sender as any).stakeWeight = (sender as any).stakeWeight.minus(stake.weight);
                (sender as any).stake[blockTime].claimableTimestamp = x;
                break;
            }
            x += stake.duration;
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeObject[];

        // Get wallet stake if it exists
        if (!(wallet as any).stake.length) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = (wallet as any).stake;
        const { data }: Interfaces.ITransaction = transaction;
        const blockTime = data.asset.stakeCancel.blockTime;

        if (stakeArray.indexOf(blockTime) < 0) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[blockTime].claimableTimestamp > 0) {
            throw new StakeAlreadyCanceledError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.canceled", transaction.data);
    }

    public canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): boolean {
        if (this.typeFromSenderAlreadyInPool(data, pool, processor)) {
            return false;
        }
        return true;
    }

    protected applyToSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.applyToSender(transaction, walletManager);
        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const timestamp = lastBlock.data.timestamp;
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeCancel.blockTime;
        const stake = (sender as any).stake[blockTime];
        let x = stake.start;
        while (x < 315576000) {
            if (x > timestamp) {
                // Remove stake weight
                (sender as any).stakeWeight = (sender as any).stakeWeight.minus(stake.weight);
                (sender as any).stake[blockTime].claimableTimestamp = x;
                break;
            }
            x += stake.duration;
        }
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const timestamp = lastBlock.data.timestamp;
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeCancel.blockTime;
        const stake = (sender as any).stake[blockTime];
        let x = stake.start;
        while (x < 315576000) {
            if (x > timestamp) {
                // Revert remove stake weight
                (sender as any).stakeWeight = (sender as any).stakeWeight.plus(stake.weight);
                (sender as any).stake[blockTime].claimableTimestamp = 0;
                break;
            }
            x += stake.duration;
        }
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}