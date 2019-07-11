import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import {
    StakeAlreadyExpiredError,
    StakeAlreadyRedeemedError,
    StakeNotFoundError,
    StakeNotYetCanceledError,
    WalletHasNoStakeError,
} from "../errors";
import { StakeUndoCancelTransaction } from "../transactions";

export class StakeUndoCancelTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeUndoCancelTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const transactionsRepository = databaseService.transactionsBusinessRepository;
        const transactions = await transactionsRepository.findAllByType(this.getConstructor().type);

        for (const t of transactions.rows) {
            const wallet: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            const s = t.asset.stakeUndoCancel;
            const blockTime = s.blockTime;
            const stake = wallet.stake[blockTime];
            // Undo cancel stake
            wallet.stake[blockTime].redeemableTimestamp = undefined;
            wallet.stakeWeight = wallet.stakeWeight.plus(stake.weight);
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        // Get wallet stake if it exists
        if ((wallet as any).stake === undefined) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = (wallet as any).stake;
        const { data }: Interfaces.ITransaction = transaction;
        const blockTime = data.asset.stakeUndoCancel.blockTime;

        if (!(blockTime in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[blockTime].redeemed) {
            throw new StakeAlreadyRedeemedError();
        }

        if (stakeArray[blockTime].redeemableTimestamp === undefined) {
            throw new StakeNotYetCanceledError();
        }

        if (transaction.data.timestamp >= stakeArray[blockTime].redeemableTimestamp) {
            throw new StakeAlreadyExpiredError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.uncanceled", transaction.data);
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
        const blockTime = t.asset.stakeUndoCancel.blockTime;
        const stake = sender.stake[blockTime];
        // Undo cancel stake
        sender.stake[blockTime].redeemableTimestamp = undefined;
        sender.stakeWeight = sender.stakeWeight.plus(stake.weight);
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeUndoCancel.blockTime;
        const stake = sender.stake[blockTime];
        // Remove stake weight
        let x = blockTime;
        sender.stakeWeight = sender.stakeWeight.minus(stake.weight);
        while (x < blockTime + 315576000) {
            if (x > t.timestamp) {
                sender.stake[blockTime].redeemableTimestamp = x;
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
