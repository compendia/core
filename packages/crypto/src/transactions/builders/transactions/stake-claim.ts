import { ITransactionData } from "../../../interfaces";
import { feeManager } from "../../../managers";
import { BigNumber } from "../../../utils";
import { TransactionBuilder } from "./transaction";

export class StakeClaimBuilder extends TransactionBuilder<StakeClaimBuilder> {
    constructor() {
        super();
        this.data.type = 102;
        this.data.fee = feeManager.get(100);
        this.data.amount = BigNumber.ZERO;
        this.data.recipientId = undefined;
        this.data.senderPublicKey = undefined;
        this.data.asset = { stakeClaim: { blockTime: 0 } };
        this.signWithSenderAsRecipient = true;
    }

    public stakeAsset(blockTime: number): StakeClaimBuilder {
        this.data.asset.stakeClaim.blockTime = blockTime;
        return this;
    }

    public getStruct(): ITransactionData {
        const struct: ITransactionData = super.getStruct();
        struct.amount = this.data.amount;
        struct.asset = this.data.asset;
        return struct;
    }

    protected instance(): StakeClaimBuilder {
        return this;
    }
}
