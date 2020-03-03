import { Interfaces, Transactions, Utils } from "@arkecosystem/crypto";

import { StakeTransactionGroup, StakeTransactionType } from "../enums";
import { StakeRedeemTransaction } from "../transactions/stake-redeem";

export class StakeRedeemBuilder extends Transactions.TransactionBuilder<StakeRedeemBuilder> {
    constructor() {
        super();
        this.data.version = 2;
        this.data.typeGroup = StakeTransactionGroup;
        this.data.type = StakeTransactionType.StakeRedeem;
        this.data.fee = StakeRedeemTransaction.staticFee();
        this.data.amount = Utils.BigNumber.ZERO;
        this.data.asset = { stakeRedeem: { id: "" } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(id: string): StakeRedeemBuilder {
        this.data.asset.stakeRedeem.id = id;
        return this;
    }

    public getStruct(): Interfaces.ITransactionData {
        const struct: Interfaces.ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeRedeemBuilder {
        return this;
    }
}
