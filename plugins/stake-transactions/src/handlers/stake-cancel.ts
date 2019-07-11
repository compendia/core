import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { StakeAlreadyCanceledError, StakeNotFoundError, WalletHasNoStakeError } from "../errors";
import { StakeCancelTransaction } from "../transactions";

export class StakeCancelTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeCancelTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const transactionsRepository = databaseService.transactionsBusinessRepository;
        const transactions = await transactionsRepository.findAllByType(this.getConstructor().type);

        for (const t of transactions.rows) {
            const wallet: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            // Get wallet stake if it exists
            const s = t.asset.stakeCancel;
            const blockTime = s.blockTime;
            const stake = wallet.stake[blockTime];
            let x: number;
            wallet.stakeWeight = wallet.stakeWeight.minus(stake.weight);
            for (x = blockTime; x < blockTime + 315576000; x += stake.duration) {
                if (x > t.timestamp) {
                    wallet.stake[blockTime].redeemableTimestamp = x;
                    break;
                }
            }
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        if (wallet.stake === {}) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = wallet.stake;
        const data: Interfaces.ITransactionData = transaction.data;
        const blockTime = data.asset.stakeCancel.blockTime;

        if (!(blockTime in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[blockTime].redeemableTimestamp > 0) {
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
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeCancel.blockTime;
        const stake = sender.stake[blockTime];
        let x: number;
        // Remove stake weight
        sender.stakeWeight = sender.stakeWeight.minus(stake.weight);
        for (x = blockTime; x < blockTime + 315576000; x += stake.duration) {
            if (x > t.timestamp) {
                sender.stake[blockTime].redeemableTimestamp = x;
                break;
            }
        }
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeCancel.blockTime;
        const stake = sender.stake[blockTime];
        sender.stakeWeight = sender.stakeWeight.plus(stake.weight);
        sender.stake[blockTime].redeemableTimestamp = 0;
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
