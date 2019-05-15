import { app } from "../../../../packages/core-container/dist";
import { Database, EventEmitter, State, TransactionPool } from "../../../../packages/core-interfaces/dist";
import { Handlers } from "../../../../packages/core-transactions/dist";
import { Interfaces, Transactions } from "../../../../packages/crypto/dist";
import { configManager } from "../../../../packages/crypto/dist/managers";
import { BigNumber } from "../../../../packages/crypto/dist/utils";
import { StakeAssetError } from "../errors";
import { IStakeObject } from "../interfaces";
import { StakeRegistrationTransaction } from "../transactions";

export class StakeRegistrationTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return StakeRegistrationTransaction;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const transactions = await connection.transactionsRepository.getAssetsByType(this.getConstructor().type);
        const lastBlock = app
            .resolvePlugin<State.IStateService>("state")
            .getStore()
            .getLastBlock();
        const timestamp = lastBlock.data.timestamp;
        const milestone = configManager.getMilestone(lastBlock.data.height);
        for (const t of transactions) {
            let stakeArray: IStakeObject[];
            const wallet = walletManager.findByPublicKey(t.senderPublicKey);

            // Get wallet stake if it exists
            if ((wallet as any).stake.length) {
                stakeArray = (wallet as any).stake;
            }

            // Get transaction data and build stake object.
            const s = t.asset.stakeRegistration;

            // TODO: Calculate weight properly
            let level: string;

            if (s.duration >= 7889400 && s.duration < 15778800) {
                level = "3m";
            }
            if (s.duration >= 15778800 && s.duration < 31557600) {
                level = "6m";
            }
            if (s.duration >= 31557600 && s.duration < 63115200) {
                level = "1y";
            }
            if (s.duration > 63115200) {
                level = "2y";
            }

            const multiplier: number = milestone.stakeLevels[level];
            const sWeight = t.amount.times(multiplier);

            const o: { start: number; amount: BigNumber; duration: number; weight: BigNumber; renewing: boolean } = {
                start: t.timestamp,
                amount: t.amount,
                duration: s.duration,
                weight: sWeight,
                renewing: s.renewing,
            };

            // In case the stake object already exists (checked by stake timestamp), it should have an index already.
            // If it's a fresh stake object oIndex will be -1
            const oIndex = stakeArray.indexOf(t.timestamp);

            // If stake already exists then this must be an updated stake.
            // If updated stake stake is not renewing and is expired: find previous non-updated stake and remove from stakeArray.
            if (oIndex >= 0 && !s.renewing && timestamp > t.timestamp + s.duration) {
                delete stakeArray[oIndex];
            } else if (oIndex >= 0) {
                // Stake is updated
                stakeArray[oIndex] = o;
            } else {
                // Stake is new
                stakeArray[t.timestamp] = o;
            }

            (wallet as any).stakeWeight = (wallet as any).stakeWeight.plus(o.weight);
            (wallet as any).stake = stakeArray;
        }
    }

    public canBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        databaseWalletManager: State.IWalletManager,
    ): boolean {
        const { data }: Interfaces.ITransaction = transaction;

        const o: { start: number; amount: BigNumber; duration: number; renewing: boolean } =
            data.asset.stakeRegistration;

        if (!o.duration || o.duration < 0) {
            throw new StakeAssetError();
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
        const t = transaction.data;
        const s = t.asset.stakeRegistration;

        // TODO: Calculate weight properly according to respective stake amount and duration
        const sWeight = t.amount;

        const o: IStakeObject = {
            start: t.timestamp,
            amount: t.amount,
            duration: s.duration,
            weight: sWeight,
            renewing: true,
        };

        sender.balance = sender.balance.minus(t.amount);
        (sender as any).stake[t.timestamp] = o;
        (sender as any).stakeWeight = (sender as any).stakeWeight.plus(o.weight);
    }

    protected revertForSender(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        super.revertForSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const t = transaction.data;
        const s = t.asset.stakeRegistration;
        sender.balance = sender.balance.plus(t.amount);
        delete (sender as any).stake[t.timestamp];
        (sender as any).stakeWeight = (sender as any).stakeWeight.minus(s.weight);
    }

    protected applyToRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }

    protected revertForRecipient(transaction: Interfaces.ITransaction, walletManager: State.IWalletManager): void {
        return;
    }
}
