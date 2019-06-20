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
        const transactions = await connection.transactionsRepository.getAssetsByType(this.getConstructor().type);
        for (const t of transactions) {
            const wallet: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            // Get wallet stake if it exists
            const s = t.asset.stakeCancel;
            const blockTime = s.blockTime;
            const stake = wallet.stake[blockTime];
            let x = blockTime;
            wallet.stakeWeight = wallet.stakeWeight.minus(stake.weight);
            while (x < blockTime + 315576000) {
                if (x > t.data.timestamp) {
                    wallet.stake[blockTime].redeemableTimestamp = x;
                    break;
                }
                x += stake.duration;
            }
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        if ((wallet as any).stake === undefined) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = (wallet as any).stake;
        const { data }: Interfaces.ITransaction = transaction;
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
        let x = blockTime;
        // Remove stake weight
        sender.stakeWeight = sender.stakeWeight.minus(stake.weight);
        while (x < blockTime + 315576000) {
            if (x > transaction.data.timestamp) {
                sender.stake[blockTime].redeemableTimestamp = x;
                break;
            }
            x += stake.duration;
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
