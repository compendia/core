import { app } from "@arkecosystem/core-container";
import { Database } from "@arkecosystem/core-interfaces";
import { Identities, Interfaces, Managers, Transactions, Types, Utils } from "@arkecosystem/crypto";
import { Builders as StakeBuilders } from "@nosplatform/stake-transactions-crypto";

import { secrets } from "../../../../__tests__/utils/config/testnet/delegates.json";

const defaultPassphrase: string = secrets[0];

interface IPassphrasePair {
    passphrase: string;
    secondPassphrase: string;
}

export class TransactionFactory {
    public static stakeCreate(duration: number, amount: Utils.BigNumber): TransactionFactory {
        const stakeBuilder = new StakeBuilders.StakeCreateBuilder();
        const builder = stakeBuilder.stakeAsset(duration, amount);
        return new TransactionFactory(builder);
    }

    public static stakeRedeem(stakeId: string): TransactionFactory {
        const stakeBuilder = new StakeBuilders.StakeRedeemBuilder();
        const builder = stakeBuilder.stakeAsset(stakeId);
        return new TransactionFactory(builder);
    }

    public static stakeCancel(stakeId: string): TransactionFactory {
        const stakeBuilder = new StakeBuilders.StakeCancelBuilder();
        const builder = stakeBuilder.stakeAsset(stakeId);
        return new TransactionFactory(builder);
    }

    public static getNonce(publicKey: string): Utils.BigNumber {
        try {
            return app.resolvePlugin<Database.IDatabaseService>("database").walletManager.getNonce(publicKey);
        } catch {
            return Utils.BigNumber.ZERO;
        }
    }

    private builder: any;
    private network: Types.NetworkName = "nospluginnet";
    private nonce: Utils.BigNumber;
    private fee: Utils.BigNumber;
    private timestamp: number;
    private passphrase: string = defaultPassphrase;
    // private secondPassphrase: string;
    private passphraseList: string[];
    private passphrasePairs: IPassphrasePair[];
    private version: number;
    private senderPublicKey: string;
    private expiration: number;

    public constructor(builder) {
        this.builder = builder;
    }

    public withFee(fee: number): TransactionFactory {
        this.fee = Utils.BigNumber.make(fee);

        return this;
    }

    public withTimestamp(timestamp: number): TransactionFactory {
        this.timestamp = timestamp;

        return this;
    }

    public withNetwork(network: Types.NetworkName): TransactionFactory {
        this.network = network;

        return this;
    }

    public withHeight(height: number): TransactionFactory {
        Managers.configManager.setHeight(height);

        return this;
    }

    public withSenderPublicKey(sender: string): TransactionFactory {
        this.senderPublicKey = sender;

        return this;
    }

    public withNonce(nonce: Utils.BigNumber): TransactionFactory {
        this.nonce = nonce;

        return this;
    }

    public withExpiration(expiration: number): TransactionFactory {
        this.expiration = expiration;

        return this;
    }

    public withVersion(version: number): TransactionFactory {
        this.version = version;

        return this;
    }

    public withPassphrase(passphrase: string): TransactionFactory {
        this.passphrase = passphrase;

        return this;
    }

    public withPassphraseList(passphrases: string[]): TransactionFactory {
        this.passphraseList = passphrases;

        return this;
    }

    public withPassphrasePairs(passphrases: IPassphrasePair[]): TransactionFactory {
        this.passphrasePairs = passphrases;

        return this;
    }

    public create(quantity: number = 1): Interfaces.ITransactionData[] {
        return this.make<Interfaces.ITransactionData>(quantity, "getStruct");
    }

    public createOne(): Interfaces.ITransactionData {
        return this.create(1)[0];
    }

    public build(quantity: number = 1): Interfaces.ITransaction[] {
        return this.make<Interfaces.ITransaction>(quantity, "build");
    }

    public getNonce(): Utils.BigNumber {
        if (this.nonce) {
            return this.nonce;
        }

        return TransactionFactory.getNonce(this.senderPublicKey);
    }

    private make<T>(quantity: number = 1, method: string): T[] {
        if (this.passphrasePairs && this.passphrasePairs.length) {
            return this.passphrasePairs.map(
                (passphrasePair: IPassphrasePair) =>
                    this.withPassphrase(passphrasePair.passphrase)
                        // .withSecondPassphrase(passphrasePair.secondPassphrase)
                        .sign<T>(quantity, method)[0],
            );
        }

        return this.sign<T>(quantity, method);
    }

    private sign<T>(quantity: number, method: string): T[] {
        Managers.configManager.setFromPreset(this.network);

        if (!this.senderPublicKey) {
            this.senderPublicKey = Identities.PublicKey.fromPassphrase(this.passphrase);
        }

        const transactions: T[] = [];
        let nonce = this.getNonce();

        for (let i = 0; i < quantity; i++) {
            if (this.builder.constructor.name === "TransferBuilder") {
                // @FIXME: when we use any of the "withPassphrase*" methods the builder will
                // always remember the previous vendor field instead generating a new one on each iteration
                const vendorField: string = this.builder.data.vendorField;

                if (!vendorField || (vendorField && vendorField.startsWith("Test Transaction"))) {
                    this.builder.vendorField(`Test Transaction ${i + 1}`);
                }
            }

            if (this.builder.constructor.name === "DelegateRegistrationBuilder") {
                // @FIXME: when we use any of the "withPassphrase*" methods the builder will
                // always remember the previous username instead generating a new one on each iteration
                if (!this.builder.data.asset.delegate.username) {
                    this.builder = Transactions.BuilderFactory.delegateRegistration().usernameAsset(
                        this.getRandomUsername(),
                    );
                }
            }

            if (this.version) {
                this.builder.version(this.version);
            }

            if (this.builder.data.version > 1) {
                nonce = nonce.plus(1);
                this.builder.nonce(nonce);
            }

            if (this.fee) {
                this.builder.fee(this.fee.toFixed());
            }

            if (this.timestamp) {
                this.builder.data.timestamp = this.timestamp;
            }

            if (this.senderPublicKey) {
                this.builder.senderPublicKey(this.senderPublicKey);
            }

            if (this.expiration) {
                this.builder.expiration(this.expiration);
            }

            let sign: boolean = true;
            if (this.passphraseList && this.passphraseList.length) {
                sign = this.builder.constructor.name === "MultiSignatureBuilder";

                for (let i = 0; i < this.passphraseList.length; i++) {
                    this.builder.multiSign(this.passphraseList[i], i);
                }
            }

            const testnet: boolean = ["unitnet", "testnet", "nospluginnet"].includes(
                Managers.configManager.get("network.name"),
            );

            if (sign) {
                const aip11: boolean = Managers.configManager.getMilestone().aip11;
                if (this.builder.data.version === 1 && aip11) {
                    Managers.configManager.getMilestone().aip11 = false;
                } else if (testnet) {
                    Managers.configManager.getMilestone().aip11 = true;
                }

                this.builder.sign(this.passphrase);

                // if (this.secondPassphrase) {
                //     this.builder.secondSign(this.secondPassphrase);
                // }
            }

            const transaction = this.builder[method]();

            if (testnet) {
                Managers.configManager.getMilestone().aip11 = true;
            }

            transactions.push(transaction);
        }

        return transactions;
    }

    private getRandomUsername(): string {
        return Math.random()
            .toString(36)
            .toLowerCase();
    }
}
