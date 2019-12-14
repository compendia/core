import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { Enums, Transactions as DposIpfsTransactions } from "@nosplatform/dpos-ipfs-crypto";

import { IpfsHashAlreadyExists, IpfsKeyInvalid, SenderNotActiveDelegate, SenderNotDelegate } from "../errors";

// const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export class DposIpfsTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return DposIpfsTransactions.DposIpfsTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        const attributes = ["dpos.ipfs"];
        const keys = Enums.IpfsKeys;
        for (const key of keys) {
            attributes.push(`dpos.ipfs.${key}`);
        }
        return attributes;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const ipfsKey = transaction.asset.ipfsKey;
                const ipfsHash = transaction.asset.ipfsHash;
                wallet.setAttribute(`dpos.ipfs.${ipfsKey}`, ipfsHash);
                walletManager.reindex(wallet);
            }
        }
    }

    public dynamicFee(context: TransactionInterfaces.IDynamicFeeContext): Utils.BigNumber {
        // override dynamicFee calculation as this is a zero-fee transaction
        return Utils.BigNumber.ZERO;
    }

    public async isActivated(): Promise<boolean> {
        return true;
    }

    public async throwIfCannotBeApplied(
        transaction: Interfaces.ITransaction,
        wallet: State.IWallet,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        if (Utils.isException(transaction.data)) {
            return;
        }

        // Error if sender is not active delegate
        const database: Database.IDatabaseService = app.resolvePlugin("database");
        const delegates: State.IWallet[] = await database.getActiveDelegates();

        // If wallet is not a delegate, or is a delegate but not in forging position and fee is too low: throw error.
        if (!wallet.isDelegate()) {
            throw new SenderNotDelegate();
        }

        if (
            !delegates.find(delegate => delegate.publicKey === transaction.data.senderPublicKey) &&
            transaction.data.fee.isLessThan(Managers.configManager.getMilestone().fees.staticFees.dposIpfs)
        ) {
            throw new SenderNotActiveDelegate();
        }

        const ipfsKey = transaction.data.asset.ipfsKey;
        const ipfsHash = transaction.data.asset.ipfsHash;

        if (!Enums.IpfsKeys.includes(ipfsKey)) {
            throw new IpfsKeyInvalid();
        }

        if (wallet.getAttribute(`dpos.ipfs.${ipfsKey}`, "") === ipfsHash) {
            throw new IpfsHashAlreadyExists();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, walletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<boolean> {
        if (
            await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.DposIpfsTransactionType.DposIpfs,
                Enums.DposIpfsTransactionGroup,
            )
        ) {
            processor.pushError(data, "ERR_PENDING", `DPOS IPFS transaction for wallet already in the pool`);
            return false;
        }
        return true;
    }

    /*
    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("dpos.ipfs.updated", transaction.data);
    }
    */

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        sender.setAttribute(`dpos.ipfs.${transaction.data.asset.ipfsKey}`, transaction.data.asset.ipfsHash);
        walletManager.reindex(sender);
    }

    public async revertForSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.revertForSender(transaction, walletManager);
        const connection: Database.IConnection = app.resolvePlugin<Database.IDatabaseService>("database").connection;
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        const reader = await TransactionReader.create(connection, this.getConstructor());

        const DposIpfsTransactions: Database.IBootstrapTransaction[] = [];
        while (reader.hasNext()) {
            DposIpfsTransactions.push(...(await reader.read()));
        }

        if (DposIpfsTransactions.length) {
            const DposIpfsTransaction: Database.IBootstrapTransaction = DposIpfsTransactions.pop();
            const previousIpfsHash = DposIpfsTransaction.asset.ipfsHash;
            sender.setAttribute(`dpos.ipfs.${transaction.data.asset.ipfsKey}`, previousIpfsHash);
        } else {
            sender.forgetAttribute(`dpos.ipfs.${transaction.data.asset.ipfsKey}`);
        }

        walletManager.reindex(sender);
    }

    public async applyToRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {}

    public async revertForRecipient(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
        // tslint:disable-next-line: no-empty
    ): Promise<void> {}
}
