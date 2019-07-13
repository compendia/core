import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Constants, Crypto, Interfaces, Transactions, Utils } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import { NotEnoughBalanceError, StakeDurationError, StakeNotIntegerError, StakeTimestampError } from "../errors";
import { VoteWeight } from "../helpers";
import { StakeCreateTransaction } from "../transactions";

export class StakeCreateTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeCreateTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const transactionsRepository = databaseService.transactionsBusinessRepository;
        const transactions = await transactionsRepository.findAllByType(this.getConstructor().type);

        for (const t of transactions.rows) {
            const wallet: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(t);
            const blockTime = t.asset.stakeCreate.timestamp;
            const newBalance = wallet.balance.minus(o.amount);
            const newWeight = wallet.stakeWeight.plus(o.weight);
            Object.assign(wallet, {
                balance: newBalance,
                stakeWeight: newWeight,
                stake: {
                    ...wallet.stake,
                    [blockTime]: o,
                },
            });
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        const { data }: Interfaces.ITransaction = transaction;
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(data);

        if (
            data.asset.stakeCreate.timestamp - Crypto.Slots.getTime() > 120 ||
            data.asset.stakeCreate - Crypto.Slots.getTime() < 120
        ) {
            throw new StakeTimestampError();
        }

        // Amount can only be in increments of 1 NOS
        if ((o.amount.toNumber() / Constants.ARKTOSHI).toString().includes(".")) {
            throw new StakeNotIntegerError();
        }

        if (o.amount.isGreaterThan(wallet.balance.minus(Utils.BigNumber.make(data.fee)))) {
            throw new NotEnoughBalanceError();
        }

        if (!o.duration || o.duration < 7889400) {
            throw new StakeDurationError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.registered", transaction.data);
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
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(transaction.data);
        const blockTime = transaction.data.asset.stakeCreate.timestamp;
        const newBalance = sender.balance.minus(o.amount);
        const newWeight = sender.stakeWeight.plus(o.weight);
        Object.assign(sender, {
            balance: newBalance,
            stakeWeight: newWeight,
            stake: {
                ...sender.stake,
                [blockTime]: o,
            },
        });
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const o: StakeInterfaces.IStakeObject = VoteWeight.stakeObject(transaction.data);
        const blockTime = transaction.data.asset.stakeCreate.timestamp;
        const newBalance = sender.balance.plus(o.amount);
        const newWeight = sender.stakeWeight.minus(o.weight);
        Object.assign(sender, {
            balance: newBalance,
            stakeWeight: newWeight,
            stake: {
                ...sender.stake,
                [blockTime]: undefined,
            },
        });
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}