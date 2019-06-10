import { ITransactionData } from "../../../interfaces";
import { feeManager } from "../../../managers";
import { BigNumber } from "../../../utils";
import { TransactionBuilder } from "./transaction";

export class StakeRedeemBuilder extends TransactionBuilder<StakeRedeemBuilder> {
    constructor() {
        super();
        this.data.type = 102;
        this.data.fee = feeManager.get(this.data.type);
        this.data.amount = BigNumber.ZERO;
        this.data.recipientId = undefined;
        this.data.senderPublicKey = undefined;
        this.data.asset = { stakeRedeem: { blockTime: 0 } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(blockTime: number): StakeRedeemBuilder {
        this.data.asset.stakeRedeem.blockTime = blockTime;
        return this;
    }

    public getStruct(): ITransactionData {
        const struct: ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeRedeemBuilder {
        return this;
    }
}
