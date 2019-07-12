import { app } from "@arkecosystem/core-container";
import { Database, EventEmitter, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers } from "@arkecosystem/core-transactions";
import { Interfaces, Transactions } from "@arkecosystem/crypto";
import { StakeInterfaces } from "@nosplatform/stake-interfaces";
import {
    StakeAlreadyRedeemedError,
    StakeNotFoundError,
    StakeNotYetCanceledError,
    StakeNotYetRedeemableError,
    WalletHasNoStakeError,
} from "../errors";
import { StakeRedeemTransaction } from "../transactions";

export class StakeRedeemTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeRedeemTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const databaseService = app.resolvePlugin<Database.IDatabaseService>("database");
        const transactionsRepository = databaseService.transactionsBusinessRepository;
        const transactions = await transactionsRepository.findAllByType(this.getConstructor().type);

        for (const t of transactions.rows) {
            const sender: State.IWallet = walletManager.findByPublicKey(t.senderPublicKey);
            const s = t.asset.stakeRedeem;
            const blockTime = s.blockTime;
            const stake = sender.stake[blockTime];
            // Refund stake
            sender.balance = sender.balance.plus(stake.amount);
            sender.stake[blockTime].redeemed = true;
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        let stakeArray: StakeInterfaces.IStakeArray;

        // Get wallet stake if it exists
        if (wallet.stake === {}) {
            throw new WalletHasNoStakeError();
        }

        stakeArray = wallet.stake;
        const { data }: Interfaces.ITransaction = transaction;
        const blockTime = data.asset.stakeRedeem.blockTime;

        if (!(blockTime in stakeArray)) {
            throw new StakeNotFoundError();
        }

        if (stakeArray[blockTime].redeemed) {
            throw new StakeAlreadyRedeemedError();
        }

        if (!stakeArray[blockTime].redeemableTimestamp) {
            throw new StakeNotYetCanceledError();
        }

        if (transaction.data.timestamp < stakeArray[blockTime].redeemableTimestamp) {
            throw new StakeNotYetRedeemableError();
        }

        return super.canBeApplied(transaction, wallet, databaseWalletManager);
    }

    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("stake.redeemed", transaction.data);
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
        const blockTime = t.asset.stakeRedeem.blockTime;
        const stake = sender.stake[blockTime];
        // Refund stake
        const newBalance = sender.balance.plus(stake.amount);
        const redeemed = true;
        Object.assign(sender, {
            balance: newBalance,
            stake: {
                ...sender.stake,
                [blockTime]: {
                    ...sender.stake[blockTime],
                    redeemed,
                },
            },
        });
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const blockTime = t.asset.stakeRedeem.blockTime;
        const stake = sender.stake[blockTime];
        // Revert refund stake
        const newBalance = sender.balance.minus(stake.amount);
        const redeemed = false;
        Object.assign(sender, {
            balance: newBalance,
            stake: {
                ...sender.stake,
                [blockTime]: {
                    ...sender.stake[blockTime],
                    redeemed,
                },
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
