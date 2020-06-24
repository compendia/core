import { Crypto, Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { StakeCreateTransaction } from "../transactions/stake-create";

export class StakeCreateBuilder extends Transactions.TransactionBuilder<StakeCreateBuilder> {
    constructor() {
        super();
        this.data.version = 2;
        this.data.typeGroup = StakeTransactionGroup;
        this.data.type = StakeTransactionType.StakeCreate;
        this.data.fee = StakeCreateTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = { stakeCreate: { duration: 0, amount: Utils.BigNumber.ZERO, timestamp: 0 } };
    }

    public stakeAsset(duration: number, amount: Utils.BigNumber | string): StakeCreateBuilder {
        this.data.asset.stakeCreate.duration = duration;
        this.data.asset.stakeCreate.amount = Utils.BigNumber.make(amount);
        this.data.asset.stakeCreate.timestamp = Crypto.Slots.getTime();
        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeCreateBuilder {
        return this;
    }
}
