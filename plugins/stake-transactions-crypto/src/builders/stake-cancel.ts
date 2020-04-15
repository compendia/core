import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { StakeCancelTransaction } from "../transactions/stake-cancel";

export class StakeCancelBuilder extends Transactions.TransactionBuilder<StakeCancelBuilder> {
    constructor() {
        super();
        this.data.version = 2;
        this.data.typeGroup = StakeTransactionGroup;
        this.data.type = StakeTransactionType.StakeCancel;
        this.data.fee = StakeCancelTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = { stakeCancel: { id: "" } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(id: string): StakeCancelBuilder {
        this.data.asset.stakeCancel.id = id;
        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeCancelBuilder {
        return this;
    }
}
