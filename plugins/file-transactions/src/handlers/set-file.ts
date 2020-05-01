import { app } from "@arkecosystem/core-container";
import { Database, State, TransactionPool } from "@arkecosystem/core-interfaces";
import { Handlers, Interfaces as TransactionInterfaces, TransactionReader } from "@arkecosystem/core-transactions";
import { Interfaces, Managers, Transactions, Utils } from "@arkecosystem/crypto";
import { Enums, Transactions as FileTransactions } from "@nosplatform/file-transactions-crypto";
import * as multibase from "multibase";
import * as multihash from "multihashes";
import {
    FileKeyInvalid,
    InvalidMultiHash,
    IpfsHashAlreadyExists,
    SenderNotActiveDelegate,
    SenderNotDelegate,
} from "../errors";
// const emitter = app.resolvePlugin<EventEmitter.EventEmitter>("event-emitter");

export class SetFileTransactionHandler extends Handlers.TransactionHandler {
    public getConstructor(): Transactions.TransactionConstructor {
        return FileTransactions.SetFileTransaction;
    }

    public dependencies(): ReadonlyArray<Handlers.TransactionHandlerConstructor> {
        return [];
    }

    public walletAttributes(): ReadonlyArray<string> {
        const attributes = ["files"];
        const keys = Enums.FileKeys;
        for (const key of keys) {
            attributes.push(`files.${key}`);
        }
        return attributes;
    }

    public async bootstrap(connection: Database.IConnection, walletManager: State.IWalletManager): Promise<void> {
        const reader: TransactionReader = await TransactionReader.create(connection, this.getConstructor());
        while (reader.hasNext()) {
            const transactions = await reader.read();
            for (const transaction of transactions) {
                const wallet = walletManager.findByPublicKey(transaction.senderPublicKey);
                const fileKey = transaction.asset.fileKey;
                const ipfsHash = transaction.asset.ipfsHash;
                wallet.setAttribute(`files.${fileKey}`, ipfsHash);
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
            transaction.data.fee.isLessThan(Managers.configManager.getMilestone().fees.staticFees.setFile)
        ) {
            throw new SenderNotActiveDelegate();
        }

        const fileKey = transaction.data.asset.fileKey;
        const ipfsHash = transaction.data.asset.ipfsHash;

        if (!Enums.FileKeys.includes(fileKey)) {
            throw new FileKeyInvalid();
        }

        if (!this.isMultihash(ipfsHash)) {
            throw new InvalidMultiHash();
        }

        if (wallet.getAttribute(`files.${fileKey}`, "") === ipfsHash) {
            throw new IpfsHashAlreadyExists();
        }

        return super.throwIfCannotBeApplied(transaction, wallet, walletManager);
    }

    public async canEnterTransactionPool(
        data: Interfaces.ITransactionData,
        pool: TransactionPool.IConnection,
        processor: TransactionPool.IProcessor,
    ): Promise<{ type: string; message: string } | null> {
        if (
            await pool.senderHasTransactionsOfType(
                data.senderPublicKey,
                Enums.FileTransactionType.SetFile,
                Enums.FileTransactionGroup,
            )
        ) {
            return {
                type: "ERR_PENDING",
                message: `File transaction for wallet already in the pool`,
            };
        }
        return null;
    }

    /*
    public emitEvents(transaction: Interfaces.ITransaction, emitter: EventEmitter.EventEmitter): void {
        emitter.emit("files.updated", transaction.data);
    }
    */

    public async applyToSender(
        transaction: Interfaces.ITransaction,
        walletManager: State.IWalletManager,
    ): Promise<void> {
        await super.applyToSender(transaction, walletManager);
        const sender: State.IWallet = walletManager.findByPublicKey(transaction.data.senderPublicKey);
        sender.setAttribute(`files.${transaction.data.asset.fileKey}`, transaction.data.asset.ipfsHash);
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

        const FileTransactions: Database.IBootstrapTransaction[] = [];
        while (reader.hasNext()) {
            FileTransactions.push(...(await reader.read()));
        }

        if (FileTransactions.length) {
            const setFileTransaction: Database.IBootstrapTransaction = FileTransactions.pop();
            const previousIpfsHash = setFileTransaction.asset.ipfsHash;
            sender.setAttribute(`files.${transaction.data.asset.fileKey}`, previousIpfsHash);
        } else {
            sender.forgetAttribute(`files.${transaction.data.asset.fileKey}`);
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

    private isString = input => {
        return typeof input === "string";
    };

    private convertToString = input => {
        if (Buffer.isBuffer(input)) {
            return multibase
                .encode("base58btc", input)
                .toString()
                .slice(1);
        }

        if (this.isString(input)) {
            return input;
        }

        return false;
    };

    private isMultihash(hash) {
        const formatted = this.convertToString(hash);
        try {
            multihash.decode(multibase.decode("z" + formatted));
            return true;
        } catch (e) {
            return false;
        }
    }
}
