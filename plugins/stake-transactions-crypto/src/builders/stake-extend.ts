import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { StakeExtendTransaction } from "../transactions/stake-extend";

export class StakeExtendBuilder extends Transactions.TransactionBuilder<StakeExtendBuilder> {
    constructor() {
        super();
        this.data.version = 2;
        this.data.typeGroup = StakeTransactionGroup;
        this.data.type = StakeTransactionType.StakeExtend;
        this.data.fee = StakeExtendTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = { stakeExtend: { id: "", duration: 0 } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(id: string, duration: number): StakeExtendBuilder {
        this.data.asset.stakeExtend.id = id;
        this.data.asset.stakeExtend.duration = duration;
        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeExtendBuilder {
        return this;
    }
}
