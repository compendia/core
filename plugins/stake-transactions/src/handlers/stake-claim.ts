import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nos/stake-interfaces";
import {
    StakeAlreadyClaimedError,
    StakeNotFoundError,
    StakeNotYetClaimableError,
    WalletHasNoStakeError,
} from "../errors";
import { StakeClaimTransaction } from "../transactions";

export class StakeClaimHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeClaimTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const transactions = await connection.transactionsRepository.getAssetsByType(this.getConstructor().type);
        for (const t of transactions) {
            const wallet = walletManager.findByPublicKey(t.senderPublicKey);
            const s = t.asset.stakeClaim;
            const blockTime = s.blockTime;
            const sender = wallet;
            const stake = (sender as any).stake[blockTime];
            // Refund stake
            (sender as any).balance = (sender as any).balance.plus(stake.amount);
            (sender as any).stake[blockTime].claimed = true;
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        // Get wallet stake if it exists
        if (!(wallet as any).stake.length) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = (wallet as any).stake;
        const { data }: Interfaces.ITransaction = transaction;
        const blockTime = data.asset.stakeClaim.blockTime;

        if (!(blockTime in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[blockTime].claimed) {
            throw new StakeAlreadyClaimedError();
        }

        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();

        if (stakeArray[blockTime].claimableTimestamp < lastBlock.data.timestamp) {
            throw new StakeNotYetClaimableError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.claimed", transaction.data);
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
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeClaim.blockTime;
        const stake = (sender as any).stake[blockTime];
        // Refund stake
        (sender as any).balance = (sender as any).balance.plus(stake.amount);
        (sender as any).stake[blockTime].claimed = true;
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeClaim.blockTime;
        const stake = (sender as any).stake[blockTime];
        // Revert refund stake
        (sender as any).balance = (sender as any).balance.minus(stake.amount);
        (sender as any).stake[blockTime].claimed = false;
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
